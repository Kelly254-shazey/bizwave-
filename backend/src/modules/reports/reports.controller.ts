import { BadRequestException, Body, Controller, ForbiddenException, Get, Post, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { DatabaseService } from '../../database/database.service';
import { CurrentUser, RequirePermissions, TenantCtx } from '../../common/decorators/auth.decorators';
import { AuthenticatedUser, TenantAuthContext } from '../../common/types/auth.types';

function toCsv(rows: Record<string, any>[]): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const esc = (v: any) => {
    let s = v === null || v === undefined ? '' : String(v);
    // Untrusted names/descriptions must not execute as spreadsheet formulas.
    if (/^[\s\u0000-\u001f]*[=+@-]/.test(s)) s = `'${s}`;
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
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
  async list(@TenantCtx() ctx: TenantAuthContext, @CurrentUser() user: AuthenticatedUser) {
    const reportTypes = this.allowedReportTypes(ctx);
    return this.db.withTenant(ctx.tenantId, async (client) => {
      const [executions, schedules] = await Promise.all([
        client.query(`SELECT * FROM report_executions WHERE tenant_id = $1 AND ($2::boolean OR executed_by = $3) AND report_type = ANY($4::text[]) ORDER BY executed_at DESC LIMIT 30`, [ctx.tenantId, ctx.allowedBranchIds === null, user.userId, reportTypes]),
        client.query(
          `SELECT sr.*, rd.name AS report_name, rd.report_type
           FROM scheduled_reports sr
           JOIN report_definitions rd ON rd.tenant_id = sr.tenant_id AND rd.id = sr.report_definition_id
           WHERE sr.tenant_id = $1 AND ($2::boolean OR rd.created_by = $3) AND rd.report_type = ANY($4::text[]) ORDER BY sr.created_at DESC`,
          [ctx.tenantId, ctx.allowedBranchIds === null && ctx.permissions.includes('reports:manage'), user.userId, reportTypes],
        ),
      ]);
      return { executions: executions.rows, schedules: schedules.rows };
    });
  }

  private allowedReportTypes(ctx: TenantAuthContext): string[] {
    const required: Record<string, string[]> = {
      sales_summary: ['sales:read'], expense_ledger: ['finance:read'],
      inventory_valuation: ['inventory:read', 'finance:read'],
      customer_insights: ['customers:read', 'sales:read'], branch_comparison: ['sales:read'], cashflow_statement: ['finance:read'],
    };
    return Object.entries(required).filter(([type, permissions]) =>
      permissions.every((permission) => ctx.permissions.includes(permission)) &&
      (type !== 'customer_insights' || ctx.allowedBranchIds === null),
    ).map(([type]) => type);
  }

  private async fetchReportRows(ctx: TenantAuthContext, reportType: string, days: number) {
    const knownTypes = ['sales_summary', 'expense_ledger', 'inventory_valuation', 'customer_insights', 'branch_comparison', 'cashflow_statement'];
    if (!knownTypes.includes(reportType)) throw new BadRequestException('Unsupported report type.');
    if (!this.allowedReportTypes(ctx).includes(reportType)) throw new ForbiddenException('Your role cannot access this report.');
    const tenantId = ctx.tenantId; const allowedBranches = ctx.allowedBranchIds;
    return this.db.withTenant(tenantId, async (client) => {
      switch (reportType) {
        case 'sales_summary':
          return (
            await client.query(
              `SELECT sale_date, branch_name, order_count, gross_sales, total_tax, net_revenue
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
                 AND ($3::uuid[] IS NULL OR e.branch_id = ANY($3::uuid[]))
               ORDER BY e.expense_date DESC`,
              [tenantId, String(days), allowedBranches],
            )
          ).rows;
        case 'inventory_valuation':
          return (
            await client.query(
              `SELECT branch_name, sku, product_name, category_name, on_hand_quantity, reserved_quantity, available_quantity, reorder_level, CASE WHEN cost_price > 0 THEN cost_price END AS cost_price, selling_price, CASE WHEN cost_price > 0 THEN inventory_value_cost END AS inventory_value_cost, stock_status
               FROM vw_inventory_status WHERE tenant_id = $1 AND ($2::uuid[] IS NULL OR branch_id = ANY($2::uuid[])) ORDER BY branch_name, product_name`,
              [tenantId, allowedBranches],
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
              `SELECT branch_code, branch_name, city, order_count, total_revenue
               FROM vw_branch_performance WHERE tenant_id = $1 AND ($2::uuid[] IS NULL OR branch_id = ANY($2::uuid[])) ORDER BY total_revenue DESC`,
              [tenantId, allowedBranches],
            )
          ).rows;
        case 'cashflow_statement':
          return (
            await client.query(
              `SELECT tx_date, record_status, total_inflow, total_outflow, net_cashflow
               FROM vw_cashflow_reporting WHERE tenant_id = $1 AND ($2::uuid[] IS NULL OR branch_id = ANY($2::uuid[])) ORDER BY tx_date DESC LIMIT 90`,
              [tenantId, allowedBranches],
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
    const requestedDays = Number(body?.days ?? 30);
    if (!Number.isInteger(requestedDays) || requestedDays < 7 || requestedDays > 365) throw new BadRequestException('Days must be a whole number between 7 and 365.');
    if (body?.format && !['json', 'csv'].includes(body.format)) throw new BadRequestException('Unsupported report format.');
    const days = requestedDays;
    const format = body.format || 'json';
    const rows = await this.fetchReportRows(ctx, body.reportType, days);

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
    const days = Number(daysStr || 30);
    if (!Number.isInteger(days) || days < 7 || days > 365) throw new BadRequestException('Days must be a whole number between 7 and 365.');
    const rows = await this.fetchReportRows(ctx, reportType || 'sales_summary', days);
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
    await this.fetchReportRows(ctx, body.reportType, 30);
    return this.db.withTenant(ctx.tenantId, async (client) => {
      const def = await client.query(
        `INSERT INTO report_definitions (tenant_id, name, report_type, created_by)
         VALUES ($1,$2,$3,$4) RETURNING id`,
        [ctx.tenantId, body.name, body.reportType, user.userId],
      );
      const sch = await client.query(
        `INSERT INTO scheduled_reports (tenant_id, report_definition_id, cron_expression, recipients, format, is_active, next_run_at)
         VALUES ($1,$2,$3,$4::jsonb,'csv', FALSE, NULL) RETURNING *`,
        [ctx.tenantId, def.rows[0].id, body.cronExpression || '0 7 * * 1', JSON.stringify(body.recipients || [])],
      );
      return { schedule: sch.rows[0], deliveryEnabled: false, message: 'Schedule saved as a draft. Automated report delivery is not configured.' };
    });
  }
}
