import { BadRequestException, Body, Controller, ForbiddenException, Get, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { DatabaseService } from '../../database/database.service';
import { inventoryMovementForRole, inventoryRowForRole } from '../../common/inventory-visibility';
import { CurrentUser, RequirePermissions, TenantCtx } from '../../common/decorators/auth.decorators';
import { AuthenticatedUser, TenantAuthContext } from '../../common/types/auth.types';

const AdjustmentSchema = z.object({
  branchId: z.string().uuid(),
  productId: z.string().uuid(),
  adjustmentQuantity: z.number().refine((v) => v !== 0, 'Adjustment cannot be zero'),
  reasonCode: z.enum(['damaged', 'expired', 'shrinkage', 'recount', 'reversal', 'other']),
  notes: z.string().min(3),
});

@ApiTags('Inventory & Products')
@ApiBearerAuth()
@Controller('inventory')
export class InventoryController {
  constructor(private readonly db: DatabaseService) {}

  @Get()
  @RequirePermissions('inventory:read')
  async getStockStatus(
    @Query('branchId') branchId: string | undefined,
    @TenantCtx() ctx: TenantAuthContext,
  ) {
    const effectiveBranch = branchId && branchId !== 'all' ? branchId : null;
    if (effectiveBranch && ctx.allowedBranchIds && !ctx.allowedBranchIds.includes(effectiveBranch)) {
      throw new ForbiddenException('You are not authorized to access this branch.');
    }
    return this.db.withTenant(ctx.tenantId, async (client) => {
      const [items, alerts, movements] = await Promise.all([
        client.query(
          `SELECT * FROM vw_inventory_status
           WHERE tenant_id = $1
             AND ($2::uuid IS NULL OR branch_id = $2::uuid)
             AND ($3::uuid[] IS NULL OR branch_id = ANY($3::uuid[]))
           ORDER BY CASE stock_status WHEN 'stockout' THEN 0 WHEN 'low_stock' THEN 1 ELSE 2 END, product_name ASC`,
          [ctx.tenantId, effectiveBranch, ctx.allowedBranchIds],
        ),
        client.query(
          `SELECT sa.*, p.name AS product_name, p.sku, b.name AS branch_name
           FROM stock_alerts sa
           JOIN products p ON p.tenant_id = sa.tenant_id AND p.id = sa.product_id
           JOIN branches b ON b.tenant_id = sa.tenant_id AND b.id = sa.branch_id
           WHERE sa.tenant_id = $1 AND sa.status = 'open'
             AND ($2::uuid IS NULL OR sa.branch_id = $2::uuid)
             AND ($3::uuid[] IS NULL OR sa.branch_id = ANY($3::uuid[]))
           ORDER BY CASE sa.severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END`,
          [ctx.tenantId, effectiveBranch, ctx.allowedBranchIds],
        ),
        client.query(
          `SELECT im.*, p.name AS product_name, p.sku, b.name AS branch_name
           FROM inventory_movements im
           JOIN products p ON p.tenant_id = im.tenant_id AND p.id = im.product_id
           JOIN branches b ON b.tenant_id = im.tenant_id AND b.id = im.branch_id
           WHERE im.tenant_id = $1
             AND ($2::uuid IS NULL OR im.branch_id = $2::uuid)
             AND ($3::uuid[] IS NULL OR im.branch_id = ANY($3::uuid[]))
           ORDER BY im.occurred_at DESC
           LIMIT 40`,
          [ctx.tenantId, effectiveBranch, ctx.allowedBranchIds],
        ),
      ]);

      return {
        inventory: items.rows.map((row) => inventoryRowForRole(row, ctx)),
        alerts: alerts.rows,
        recentMovements: movements.rows.map((row) => inventoryMovementForRole(row, ctx)),
      };
    });
  }

  @Post('adjustments')
  @RequirePermissions('inventory:write')
  async recordAdjustment(
    @Body() body: unknown,
    @TenantCtx() ctx: TenantAuthContext,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: any,
  ) {
    const parsed = AdjustmentSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ message: 'Invalid stock adjustment', errors: parsed.error.flatten() });
    }
    const d = parsed.data;
    if (ctx.allowedBranchIds && !ctx.allowedBranchIds.includes(d.branchId)) {
      throw new ForbiddenException('You are not authorized to adjust stock for this branch.');
    }

    const result = await this.db.withTenant(ctx.tenantId, async (client) => {
      const pRes = await client.query(`SELECT cost_price, reorder_level FROM products WHERE tenant_id = $1 AND id = $2`, [
        ctx.tenantId,
        d.productId,
      ]);
      if (pRes.rowCount === 0) throw new BadRequestException('Product not found');

      const adj = await client.query(
        `INSERT INTO stock_adjustments (tenant_id, branch_id, product_id, adjustment_quantity, reason_code, notes, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [ctx.tenantId, d.branchId, d.productId, d.adjustmentQuantity, d.reasonCode, d.notes, user.userId],
      );

      const balRes = await client.query(
        `SELECT fn_record_inventory_movement($1,$2,$3,'adjustment',$4,$5,'stock_adjustment',$6,$7,$8) AS new_balance`,
        [
          ctx.tenantId,
          d.branchId,
          d.productId,
          d.adjustmentQuantity,
          pRes.rows[0].cost_price,
          adj.rows[0].id,
          `${d.reasonCode}: ${d.notes}`,
          user.userId,
        ],
      );
      const newBalance = Number(balRes.rows[0].new_balance);

      // Automatically resolve open stock alerts if replenished above reorder_level
      if (newBalance > Number(pRes.rows[0].reorder_level)) {
        await client.query(
          `UPDATE stock_alerts SET status = 'resolved', resolved_at = NOW()
           WHERE tenant_id = $1 AND branch_id = $2 AND product_id = $3 AND status = 'open'`,
          [ctx.tenantId, d.branchId, d.productId],
        );
      }

      return { adjustment: adj.rows[0], newBalance };
    });

    await this.db.appendAuditLog({
      tenantId: ctx.tenantId,
      actorUserId: user.userId,
      actorEmail: user.email,
      action: 'inventory.adjustment_recorded',
      resourceType: 'stock_adjustment',
      resourceId: result.adjustment.id,
      ipAddress: req.ip,
      changes: { ...d, newBalance: result.newBalance },
    });

    return result;
  }
}
