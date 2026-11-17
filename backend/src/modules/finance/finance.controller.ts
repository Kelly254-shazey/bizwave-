import { BadRequestException, Body, Controller, ForbiddenException, Get, Param, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { DatabaseService } from '../../database/database.service';
import { CurrentUser, RequirePermissions, TenantCtx } from '../../common/decorators/auth.decorators';
import { AuthenticatedUser, TenantAuthContext } from '../../common/types/auth.types';

const CreateExpenseSchema = z.object({
  branchId: z.string().uuid(),
  categoryId: z.string().uuid().optional().nullable(),
  vendorName: z.string().min(2).max(160),
  description: z.string().min(2),
  expenseDate: z.string(),
  amount: z.number().positive(),
  paymentMethod: z.enum(['mpesa', 'cash', 'card', 'bank_transfer']).default('mpesa'),
  isRecurring: z.boolean().default(false),
});

@ApiTags('Finance & M-Pesa Reconciliation')
@ApiBearerAuth()
@Controller('finance')
export class FinanceController {
  constructor(private readonly db: DatabaseService) {}

  @Get('overview')
  @RequirePermissions('finance:read')
  async overview(
    @Query('branchId') branchId: string | undefined,
    @TenantCtx() ctx: TenantAuthContext,
  ) {
    return this.db.withTenant(ctx.tenantId, async (client) => {
      const effectiveBranch = branchId && branchId !== 'all' ? branchId : null;
      const [expenses, categories, cashAccounts, cashTx, payables, receivables] = await Promise.all([
        client.query(
          `SELECT e.*, ec.name AS category_name, b.name AS branch_name
           FROM expenses e
           LEFT JOIN expense_categories ec ON ec.tenant_id = e.tenant_id AND ec.id = e.category_id
           JOIN branches b ON b.tenant_id = e.tenant_id AND b.id = e.branch_id
           WHERE e.tenant_id = $1
             AND ($2::uuid IS NULL OR e.branch_id = $2::uuid)
             AND ($3::uuid[] IS NULL OR e.branch_id = ANY($3::uuid[]))
           ORDER BY e.expense_date DESC LIMIT 50`,
          [ctx.tenantId, effectiveBranch, ctx.allowedBranchIds],
        ),
        client.query(`SELECT * FROM expense_categories WHERE tenant_id = $1 ORDER BY name ASC`, [ctx.tenantId]),
        client.query(`SELECT * FROM cash_accounts WHERE tenant_id = $1 ORDER BY created_at ASC`, [ctx.tenantId]),
        client.query(
          `SELECT ct.*, ca.name AS account_name, ca.account_type
           FROM cash_transactions ct
           JOIN cash_accounts ca ON ca.tenant_id = ct.tenant_id AND ca.id = ct.cash_account_id
           WHERE ct.tenant_id = $1
             AND ($2::uuid IS NULL OR ct.branch_id = $2::uuid)
           ORDER BY ct.transaction_date DESC LIMIT 40`,
          [ctx.tenantId, effectiveBranch],
        ),
        client.query(`SELECT * FROM payables WHERE tenant_id = $1 AND status <> 'paid' ORDER BY due_date ASC`, [ctx.tenantId]),
        client.query(`SELECT * FROM receivables WHERE tenant_id = $1 AND status <> 'paid' ORDER BY due_date ASC`, [ctx.tenantId]),
      ]);

      // Explicitly distinguish recorded vs reconciled vs estimated balances (Section 8.6)
      const statusTotals = await client.query(
        `SELECT record_status,
                SUM(CASE WHEN direction='inflow' THEN amount ELSE 0 END)::NUMERIC(14,2) AS inflows,
                SUM(CASE WHEN direction='outflow' THEN amount ELSE 0 END)::NUMERIC(14,2) AS outflows
         FROM cash_transactions
         WHERE tenant_id = $1
         GROUP BY record_status`,
        [ctx.tenantId],
      );

      return {
        expenses: expenses.rows,
        categories: categories.rows,
        cashAccounts: cashAccounts.rows,
        cashTransactions: cashTx.rows,
        reconciliationSummary: statusTotals.rows,
        payables: payables.rows,
        receivables: receivables.rows,
      };
    });
  }

  @Post('expenses')
  @RequirePermissions('finance:write')
  async createExpense(
    @Body() body: unknown,
    @TenantCtx() ctx: TenantAuthContext,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: any,
  ) {
    const parsed = CreateExpenseSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ message: 'Invalid expense payload', errors: parsed.error.flatten() });
    }
    const d = parsed.data;
    if (ctx.allowedBranchIds && !ctx.allowedBranchIds.includes(d.branchId)) {
      throw new ForbiddenException('You are not authorized to record expenses for this branch.');
    }
    const ref = `EXP-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;

    const exp = await this.db.withTenant(ctx.tenantId, async (client) => {
      const ins = await client.query(
        `INSERT INTO expenses (tenant_id, branch_id, category_id, expense_ref, vendor_name, description, expense_date, amount, payment_method, is_recurring, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
        [ctx.tenantId, d.branchId, d.categoryId || null, ref, d.vendorName, d.description, d.expenseDate, d.amount, d.paymentMethod, d.isRecurring, user.userId],
      );
      return ins.rows[0];
    });

    await this.db.appendAuditLog({
      tenantId: ctx.tenantId,
      actorUserId: user.userId,
      actorEmail: user.email,
      action: 'expense.created',
      resourceType: 'expense',
      resourceId: exp.id,
      ipAddress: req.ip,
      changes: { expenseRef: ref, amount: d.amount, vendor: d.vendorName },
    });

    return { expense: exp };
  }

  @Post('reconcile/:txId')
  @RequirePermissions('finance:write')
  async reconcileCashTransaction(
    @Param('txId') txId: string,
    @TenantCtx() ctx: TenantAuthContext,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: any,
  ) {
    const updated = await this.db.withTenant(ctx.tenantId, async (client) => {
      const res = await client.query(
        `UPDATE cash_transactions SET record_status = 'reconciled'
         WHERE tenant_id = $1 AND id = $2 RETURNING *`,
        [ctx.tenantId, txId],
      );
      if (res.rowCount === 0) throw new BadRequestException('Cash transaction not found');
      if (res.rows[0].matched_sale_id) {
        await client.query(
          `UPDATE sales_payments SET reconciliation_status = 'reconciled'
           WHERE tenant_id = $1 AND sale_id = $2`,
          [ctx.tenantId, res.rows[0].matched_sale_id],
        );
      }
      return res.rows[0];
    });

    await this.db.appendAuditLog({
      tenantId: ctx.tenantId,
      actorUserId: user.userId,
      actorEmail: user.email,
      action: 'finance.mpesa_reconciled',
      resourceType: 'cash_transaction',
      resourceId: txId,
      ipAddress: req.ip,
      changes: { mpesaReceipt: updated.mpesa_receipt_no, amount: updated.amount },
    });

    return { transaction: updated };
  }
}
