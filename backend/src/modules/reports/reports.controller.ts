import { BadRequestException, Body, Controller, Get, Post, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { DatabaseService } from '../../database/database.service';
import { CurrentUser, RequirePermissions, TenantCtx } from '../../common/decorators/auth.decorators';
import { AuthenticatedUser, TenantAuthContext } from '../../common/types/auth.types';

function toCsv(rows: Record<string, any>[]): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const esc = (v: any) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(','), ...rows.map((r) => headers.map((h) => esc(r[h])).join(','))].join('\n');
}

@ApiTags('Reporting')
@ApiBearerAuth()
@Controller('reports')
export class ReportsController {
  constructor(private readonly db: DatabaseService) {}

  @Get()
  @RequirePermissions('reports:read')
  async list(@TenantCtx() ctx: TenantAuthContext) {
    return this.db.withTenant(ctx.tenantId, async (client) => {
      const [executions, schedules] = await Promise.all([
        client.query(`SELECT * FROM report_executions WHERE tenant_id = $1 ORDER BY executed_at DESC LIMIT 30`, [ctx.tenantId]),
        client.query(
          `SELECT sr.*, rd.name AS report_name, rd.report_type
           FROM scheduled_reports sr
           JOIN report_definitions rd ON rd.tenant_id = sr.tenant_id AND rd.id = sr.report_definition_id
           WHERE sr.tenant_id = $1 ORDER BY sr.created_at DESC`,
          [ctx.tenantId],
        ),
      ]);
      return { executions: executions.rows, schedules: schedules.rows };
    });
  }

  private async fetchReportRows(tenantId: string, reportType: string, days: number, allowedBranches: string[] | null) {
    return this.db.withTenant(tenantId, async (client) => {
      switch (reportType) {
        case 'sales_summary':
          return (
            await client.query(
              `SELECT sale_date, branch_name, order_count, gross_sales, total_tax, net_revenue, total_cogs, gross_profit
               FROM vw_daily_sales_summary
               WHERE tenant_id = $1 AND sale_date >= CURRENT_DATE - ($2 || ' days')::interval
                 AND ($3::uuid[] IS NULL OR branch_id = ANY($3::uuid[]))
               ORDER BY sale_date DESC`,
              [tenantId, String(days), allowedBranches],
            )
          ).rows;
        case 'expense_ledger':
          return (
            await client.query(
              `SELECT e.expense_date, b.name AS branch_name, e.expense_ref, COALESCE(ec.name, 'General') AS category, e.vendor_name, e.description, e.amount, e.payment_method, e.reconciliation_status
               FROM expenses e
               JOIN branches b ON b.tenant_id = e.tenant_id AND b.id = e.branch_id
               LEFT JOIN expense_categories ec ON ec.tenant_id = e.tenant_id AND ec.id = e.category_id
               WHERE e.tenant_id = $1 AND e.expense_date >= CURRENT_DATE - ($2 || ' days')::interval
               ORDER BY e.expense_date DESC`,
              [tenantId, String(days)],
            )
          ).rows;
        case 'inventory_valuation':
          return (
            await client.query(
              `SELECT branch_name, sku, product_name, category_name, on_hand_quantity, reserved_quantity, available_quantity, reorder_level, cost_price, selling_price, inventory_value_cost, stock_status
               FROM vw_inventory_status WHERE tenant_id = $1 ORDER BY branch_name, product_name`,
              [tenantId],
            )
          ).rows;
        case 'customer_insights':
          return (
            await client.query(
              `SELECT full_name, phone_number, email, preferred_channel, marketing_opt_in, total_orders, lifetime_value, last_purchase_at, days_since_last_purchase
               FROM vw_customer_purchase_summary WHERE tenant_id = $1 ORDER BY lifetime_value DESC`,
              [tenantId],
            )
          ).rows;
        case 'branch_comparison':
          return (
            await client.query(
              `SELECT branch_code, branch_name, city, order_count, total_revenue, gross_profit, total_expenses, net_contribution
               FROM vw_branch_performance WHERE tenant_id = $1 ORDER BY total_revenue DESC`,
              [tenantId],
            )
          ).rows;
        case 'cashflow_statement':
          return (
            await client.query(
              `SELECT tx_date, record_status, total_inflow, total_outflow, net_cashflow
               FROM vw_cashflow_reporting WHERE tenant_id = $1 ORDER BY tx_date DESC LIMIT 90`,
              [tenantId],
            )
          ).rows;
        default:
          throw new BadRequestException(`Unsupported report type: ${reportType}`);
      }
    });
  }

  @Post('generate')
  @RequirePermissions('reports:read')
  async generate(
    @Body() body: { reportType: string; days?: number; format?: 'csv' | 'json' },
    @TenantCtx() ctx: TenantAuthContext,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const days = Math.min(365, Math.max(7, body.days || 30));
    const format = body.format || 'json';
    const rows = await this.fetchReportRows(ctx.tenantId, body.reportType, days, ctx.allowedBranchIds);

    const exec = await this.db.withTenant(ctx.tenantId, async (client) => {
      const ins = await client.query(
        `INSERT INTO report_executions (tenant_id, report_type, format, parameters, status, row_count, executed_by)
         VALUES ($1,$2,$3,$4::jsonb,'completed',$5,$6) RETURNING *`,
        [ctx.tenantId, body.reportType, format, JSON.stringify({ days }), rows.length, user.userId],
      );
      return ins.rows[0];
    });

    return {
      execution: exec,
      rowCount: rows.length,
      rows,
      csv: format === 'csv' ? toCsv(rows) : undefined,
    };
  }

  @Get('export')
  @RequirePermissions('reports:read')
  async exportCsv(
    @Query('reportType') reportType: string,
    @Query('days') daysStr: string | undefined,
    @TenantCtx() ctx: TenantAuthContext,
    @Res() res: Response,
  ) {
    const days = Math.min(365, Math.max(7, parseInt(daysStr || '30', 10)));
    const rows = await this.fetchReportRows(ctx.tenantId, reportType || 'sales_summary', days, ctx.allowedBranchIds);
    const csv = toCsv(rows);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="bizwave-${reportType}-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(csv);
  }

  @Post('schedule')
  @RequirePermissions('reports:manage')
  async scheduleReport(
    @Body() body: { name: string; reportType: string; cronExpression?: string; recipients: string[] },
    @TenantCtx() ctx: TenantAuthContext,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!body.name || !body.reportType) throw new BadRequestException('name and reportType are required');
    return this.db.withTenant(ctx.tenantId, async (client) => {
      const def = await client.query(
        `INSERT INTO report_definitions (tenant_id, name, report_type, created_by)
         VALUES ($1,$2,$3,$4) RETURNING id`,
        [ctx.tenantId, body.name, body.reportType, user.userId],
      );
      const sch = await client.query(
        `INSERT INTO scheduled_reports (tenant_id, report_definition_id, cron_expression, recipients, format, next_run_at)
         VALUES ($1,$2,$3,$4::jsonb,'csv', NOW() + INTERVAL '7 days') RETURNING *`,
        [ctx.tenantId, def.rows[0].id, body.cronExpression || '0 7 * * 1', JSON.stringify(body.recipients || [])],
      );
      return { schedule: sch.rows[0] };
    });
  }
}
