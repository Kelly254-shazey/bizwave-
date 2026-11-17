import { BadRequestException, Body, Controller, ForbiddenException, Get, Param, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { DatabaseService } from '../../database/database.service';
import { CurrentUser, RequirePermissions, TenantCtx } from '../../common/decorators/auth.decorators';
import { AuthenticatedUser, TenantAuthContext } from '../../common/types/auth.types';

const CreateSaleSchema = z.object({
  branchId: z.string().uuid(),
  customerId: z.string().uuid().optional().nullable(),
  paymentMethod: z.enum(['mpesa', 'cash', 'card', 'bank_transfer', 'credit']).default('mpesa'),
  externalPaymentRef: z.string().optional(),
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        quantity: z.number().positive(),
        unitPrice: z.number().nonnegative().optional(),
      }),
    )
    .min(1),
  notes: z.string().optional(),
});

@ApiTags('Sales')
@ApiBearerAuth()
@Controller('sales')
export class SalesController {
  constructor(private readonly db: DatabaseService) {}

  private assertBranchAllowed(ctx: TenantAuthContext, branchId: string | null) {
    if (branchId && ctx.allowedBranchIds && !ctx.allowedBranchIds.includes(branchId)) {
      throw new ForbiddenException('You are not authorized to access or modify this branch.');
    }
  }

  @Get()
  @RequirePermissions('sales:read')
  async list(
    @Query('branchId') branchId: string | undefined,
    @Query('limit') limitStr: string | undefined,
    @TenantCtx() ctx: TenantAuthContext,
  ) {
    const limit = Math.min(200, Math.max(10, parseInt(limitStr || '50', 10)));
    const effectiveBranch = branchId && branchId !== 'all' ? branchId : null;
    this.assertBranchAllowed(ctx, effectiveBranch);
    return this.db.withTenant(ctx.tenantId, async (client) => {
      const res = await client.query(
        `SELECT s.*, b.name AS branch_name, c.full_name AS customer_name,
                (SELECT sp.payment_method FROM sales_payments sp WHERE sp.sale_id = s.id LIMIT 1) AS payment_method
         FROM sales s
         JOIN branches b ON b.tenant_id = s.tenant_id AND b.id = s.branch_id
         LEFT JOIN customers c ON c.tenant_id = s.tenant_id AND c.id = s.customer_id
         WHERE s.tenant_id = $1
           AND ($2::uuid IS NULL OR s.branch_id = $2::uuid)
           AND ($3::uuid[] IS NULL OR s.branch_id = ANY($3::uuid[]))
         ORDER BY s.transaction_date DESC
         LIMIT $4`,
        [ctx.tenantId, effectiveBranch, ctx.allowedBranchIds, limit],
      );
      return { sales: res.rows };
    });
  }

  @Post()
  @RequirePermissions('sales:write')
  async create(
    @Body() body: unknown,
    @TenantCtx() ctx: TenantAuthContext,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: any,
  ) {
    const parsed = CreateSaleSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ message: 'Invalid sale payload', errors: parsed.error.flatten() });
    }
    const d = parsed.data;
    this.assertBranchAllowed(ctx, d.branchId);
    const txRef = `BW-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;

    const sale = await this.db.withTenant(ctx.tenantId, async (client) => {
      let subtotal = 0;
      let totalTax = 0;
      let totalCogs = 0;
      const resolvedItems: any[] = [];

      for (const item of d.items) {
        const pRes = await client.query(
          `SELECT id, sku, name, cost_price, selling_price, tax_rate, track_inventory FROM products WHERE tenant_id = $1 AND id = $2`,
          [ctx.tenantId, item.productId],
        );
        if (pRes.rowCount === 0) throw new BadRequestException(`Product ${item.productId} not found`);
        const p = pRes.rows[0];
        const unitPrice = item.unitPrice ?? Number(p.selling_price);
        const unitCost = Number(p.cost_price);
        const lineSub = Number((unitPrice * item.quantity).toFixed(2));
        const lineTax = Number((lineSub * (Number(p.tax_rate) / 100)).toFixed(2));
        subtotal += lineSub;
        totalTax += lineTax;
        totalCogs += Number((unitCost * item.quantity).toFixed(2));
        resolvedItems.push({ ...p, quantity: item.quantity, unitPrice, unitCost, lineTax, lineTotal: lineSub + lineTax });
      }

      const totalAmount = Number((subtotal + totalTax).toFixed(2));
      const saleIns = await client.query(
        `INSERT INTO sales (
           tenant_id, branch_id, customer_id, transaction_ref, source_system, transaction_date,
           payment_status, currency_code, subtotal, tax_amount, total_amount, cost_of_goods_sold, notes, created_by
         ) VALUES ($1,$2,$3,$4,'portal_pos',NOW(),'paid','KES',$5,$6,$7,$8,$9,$10) RETURNING *`,
        [ctx.tenantId, d.branchId, d.customerId || null, txRef, subtotal, totalTax, totalAmount, totalCogs, d.notes || null, user.userId],
      );
      const createdSale = saleIns.rows[0];

      for (const it of resolvedItems) {
        await client.query(
          `INSERT INTO sales_items (tenant_id, sale_id, product_id, product_name_snapshot, sku_snapshot, quantity, unit_price, unit_cost, tax_amount, line_total)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [ctx.tenantId, createdSale.id, it.id, it.name, it.sku, it.quantity, it.unitPrice, it.unitCost, it.lineTax, it.lineTotal],
        );
        if (it.track_inventory) {
          await client.query(
            `SELECT fn_record_inventory_movement($1,$2,$3,'sale',$4,$5,'sale',$6,$7,$8)`,
            [ctx.tenantId, d.branchId, it.id, -it.quantity, it.unitCost, createdSale.id, `Sale ${txRef}`, user.userId],
          );
        }
      }

      await client.query(
        `INSERT INTO sales_payments (tenant_id, sale_id, payment_method, amount, external_reference, reconciliation_status)
         VALUES ($1,$2,$3,$4,$5,'recorded')`,
        [ctx.tenantId, createdSale.id, d.paymentMethod, totalAmount, d.externalPaymentRef || null],
      );

      return createdSale;
    });

    await this.db.query(`SELECT fn_refresh_analytics_views()`);

    await this.db.appendAuditLog({
      tenantId: ctx.tenantId,
      actorUserId: user.userId,
      actorEmail: user.email,
      action: 'sale.created',
      resourceType: 'sale',
      resourceId: sale.id,
      ipAddress: req.ip,
      changes: { transactionRef: sale.transaction_ref, totalAmount: sale.total_amount },
    });

    return { sale };
  }

  /**
   * Traceable sales reversal — NEVER deletes historical financial records (Section 23)
   */
  @Post(':id/return')
  @RequirePermissions('sales:write')
  async reverseSale(
    @Param('id') id: string,
    @Body() body: { reason: string },
    @TenantCtx() ctx: TenantAuthContext,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: any,
  ) {
    if (!body?.reason || body.reason.trim().length < 3) {
      throw new BadRequestException('A clear reversal/return reason is required for audit compliance.');
    }
    const ret = await this.db.withTenant(ctx.tenantId, async (client) => {
      const sRes = await client.query(`SELECT * FROM sales WHERE tenant_id = $1 AND id = $2`, [
        ctx.tenantId,
        id,
      ]);
      if (sRes.rowCount === 0) throw new BadRequestException('Sale not found');
      const sale = sRes.rows[0];
      this.assertBranchAllowed(ctx, sale.branch_id);
      if (sale.payment_status === 'reversed') {
        throw new BadRequestException('This sale has already been reversed.');
      }

      const retRef = `RET-${sale.transaction_ref}`;
      const rIns = await client.query(
        `INSERT INTO sales_returns (tenant_id, sale_id, branch_id, return_ref, reason, refund_amount, processed_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [ctx.tenantId, sale.id, sale.branch_id, retRef, body.reason.trim(), sale.total_amount, user.userId],
      );

      const itemsRes = await client.query(
        `SELECT * FROM sales_items WHERE tenant_id = $1 AND sale_id = $2`,
        [ctx.tenantId, sale.id],
      );
      for (const it of itemsRes.rows) {
        await client.query(
          `INSERT INTO sales_return_items (tenant_id, sales_return_id, product_id, quantity, refund_amount)
           VALUES ($1,$2,$3,$4,$5)`,
          [ctx.tenantId, rIns.rows[0].id, it.product_id, it.quantity, it.line_total],
        );
        if (it.product_id) {
          await client.query(
            `SELECT fn_record_inventory_movement($1,$2,$3,'return',$4,$5,'sales_return',$6,$7,$8)`,
            [ctx.tenantId, sale.branch_id, it.product_id, it.quantity, it.unit_cost, rIns.rows[0].id, body.reason.trim(), user.userId],
          );
        }
      }

      await client.query(`UPDATE sales SET payment_status = 'reversed' WHERE tenant_id = $1 AND id = $2`, [
        ctx.tenantId,
        sale.id,
      ]);
      return rIns.rows[0];
    });

    await this.db.query(`SELECT fn_refresh_analytics_views()`);

    await this.db.appendAuditLog({
      tenantId: ctx.tenantId,
      actorUserId: user.userId,
      actorEmail: user.email,
      action: 'sale.reversed',
      resourceType: 'sales_return',
      resourceId: ret.id,
      ipAddress: req.ip,
      changes: { saleId: id, reason: body.reason, refundAmount: ret.refund_amount },
    });

    return { salesReturn: ret };
  }
}
