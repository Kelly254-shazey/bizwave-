import { BadRequestException, Body, Controller, ForbiddenException, Get, Post, Query, ServiceUnavailableException } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { DatabaseService } from '../../database/database.service';
import { inventoryRowForRole } from '../../common/inventory-visibility';
import { envConfig } from '../../config/env.config';
import { CurrentUser, RequirePermissions, TenantCtx } from '../../common/decorators/auth.decorators';
import { AuthenticatedUser, TenantAuthContext } from '../../common/types/auth.types';

function resolveDateRange(daysStr?: string, startDate?: string, endDate?: string) {
  // Anchor reporting dates to the business timezone, not the server's UTC date.
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Nairobi' }).format(new Date());
  const validDate = (value: string | undefined) => Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T12:00:00Z`)));
  if ((startDate && !validDate(startDate)) || (endDate && !validDate(endDate))) throw new BadRequestException('Invalid date range.');
  const end = new Date(`${endDate || today}T12:00:00Z`);
  const parsedDays = Number.parseInt(daysStr || '30', 10);
  const days = Math.min(365, Math.max(7, Number.isFinite(parsedDays) ? parsedDays : 30));
  const start = startDate ? new Date(`${startDate}T12:00:00Z`) : new Date(end.getTime() - (days - 1) * 86400000);
  if (start > end) throw new BadRequestException('Start date must not be after end date.');
  const spanDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
  const prevEnd = new Date(start.getTime() - 86400000);
  const prevStart = new Date(prevEnd.getTime() - (spanDays - 1) * 86400000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { startDate: fmt(start), endDate: fmt(end), prevStartDate: fmt(prevStart), prevEndDate: fmt(prevEnd), spanDays };
}

function pctChange(curr: number, prev: number): number | null {
  if (prev === 0) return null;
  return Number((((curr - prev) / Math.abs(prev)) * 100).toFixed(1));
}

@ApiTags('Analytics & KPI Engine')
@ApiBearerAuth()
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly db: DatabaseService) {}

  @Get('overview')
  @RequirePermissions('analytics:read', 'sales:read')
  async overview(
    @Query('days') days: string | undefined,
    @Query('startDate') startDate: string | undefined,
    @Query('endDate') endDate: string | undefined,
    @Query('branchId') branchId: string | undefined,
    @Query('categoryId') categoryId: string | undefined,
    @TenantCtx() ctx: TenantAuthContext,
  ) {
    const range = resolveDateRange(days, startDate, endDate);
    const effectiveBranch = branchId && branchId !== 'all' ? branchId : null;
    const effectiveCategory = categoryId && categoryId !== 'all' ? categoryId : null;

    return this.db.withTenant(ctx.tenantId, async (client) => {
      // Current & Previous period KPIs via exact NUMERIC SQL
      const kpiSql = `
        WITH s AS (
          SELECT
            COALESCE(SUM(total_amount), 0)::NUMERIC(14,2) AS rev,
            COALESCE(SUM(cost_of_goods_sold), 0)::NUMERIC(14,2) AS cogs,
            COUNT(*)::BIGINT AS orders,
            COUNT(*) FILTER (WHERE cost_basis = 'unknown')::BIGINT AS unknown_costs,
            COUNT(*) FILTER (WHERE cost_basis = 'estimated')::BIGINT AS estimated_costs,
            COUNT(DISTINCT customer_id)::BIGINT AS customers
          FROM sales
          WHERE tenant_id = $1
            AND payment_status NOT IN ('reversed', 'refunded')
            AND ($2::uuid IS NULL OR branch_id = $2::uuid)
            AND ($3::uuid[] IS NULL OR branch_id = ANY($3::uuid[]))
            AND (transaction_date AT TIME ZONE 'Africa/Nairobi')::DATE BETWEEN $4::date AND $5::date
        ),
        e AS (
          SELECT COALESCE(SUM(amount), 0)::NUMERIC(14,2) AS exp, COUNT(*)::BIGINT AS exp_count
          FROM expenses
          WHERE tenant_id = $1
            AND ($2::uuid IS NULL OR branch_id = $2::uuid)
            AND ($3::uuid[] IS NULL OR branch_id = ANY($3::uuid[]))
            AND expense_date BETWEEN $4::date AND $5::date
        )
        SELECT s.rev, s.cogs, (s.rev - s.cogs)::NUMERIC(14,2) AS gross_profit,
               e.exp, e.exp_count,
               (s.rev - s.cogs - e.exp)::NUMERIC(14,2) AS net_profit,
               s.orders, s.unknown_costs, s.estimated_costs,
               CASE WHEN s.orders > 0 THEN ROUND(s.rev / s.orders, 2) ELSE 0 END AS aov,
               s.customers
        FROM s, e
      `;

      const [currRes, prevRes, trendRes, topProdRes, catRes, branchRes, expCatRes, payMixRes, invRes, custAcqRes, qualityRes, recsRes] =
        await Promise.all([
          client.query(kpiSql, [ctx.tenantId, effectiveBranch, ctx.allowedBranchIds, range.startDate, range.endDate]),
          client.query(kpiSql, [ctx.tenantId, effectiveBranch, ctx.allowedBranchIds, range.prevStartDate, range.prevEndDate]),
          client.query(
            `SELECT (s.transaction_date AT TIME ZONE 'Africa/Nairobi')::DATE::text AS date,
                    SUM(s.total_amount)::NUMERIC(14,2) AS revenue,
                    SUM(s.total_amount - s.cost_of_goods_sold)::NUMERIC(14,2) AS gross_profit,
                    COUNT(*)::int AS orders
             FROM sales s
             WHERE s.tenant_id = $1 AND s.payment_status NOT IN ('reversed','refunded')
               AND ($2::uuid IS NULL OR s.branch_id = $2::uuid)
               AND ($3::uuid[] IS NULL OR s.branch_id = ANY($3::uuid[]))
               AND (s.transaction_date AT TIME ZONE 'Africa/Nairobi')::DATE BETWEEN $4::date AND $5::date
             GROUP BY 1 ORDER BY 1 ASC`,
            [ctx.tenantId, effectiveBranch, ctx.allowedBranchIds, range.startDate, range.endDate],
          ),
          client.query(
            `SELECT COALESCE(p.id::text, si.product_name_snapshot) AS id,
                    si.product_name_snapshot AS name,
                    COALESCE(si.sku_snapshot, 'N/A') AS sku,
                    COALESCE(pc.name, 'Uncategorized') AS category,
                    SUM(si.quantity)::NUMERIC(12,2) AS units_sold,
                    SUM(si.line_total)::NUMERIC(14,2) AS revenue,
                    SUM(si.line_total - (si.quantity * si.unit_cost))::NUMERIC(14,2) AS gross_profit
             FROM sales_items si
             JOIN sales s ON s.tenant_id = si.tenant_id AND s.id = si.sale_id
             LEFT JOIN products p ON p.tenant_id = si.tenant_id AND p.id = si.product_id
             LEFT JOIN product_categories pc ON pc.tenant_id = p.tenant_id AND pc.id = p.category_id
             WHERE si.tenant_id = $1 AND s.payment_status NOT IN ('reversed','refunded')
               AND ($2::uuid IS NULL OR s.branch_id = $2::uuid)
               AND ($3::uuid[] IS NULL OR s.branch_id = ANY($3::uuid[]))
               AND ($6::uuid IS NULL OR p.category_id = $6::uuid)
               AND (s.transaction_date AT TIME ZONE 'Africa/Nairobi')::DATE BETWEEN $4::date AND $5::date
             GROUP BY 1, 2, 3, 4
             ORDER BY revenue DESC LIMIT 8`,
            [ctx.tenantId, effectiveBranch, ctx.allowedBranchIds, range.startDate, range.endDate, effectiveCategory],
          ),
          client.query(
            `SELECT COALESCE(pc.name, 'Uncategorized') AS category,
                    SUM(si.line_total)::NUMERIC(14,2) AS revenue,
                    SUM(si.quantity)::NUMERIC(12,2) AS units
             FROM sales_items si
             JOIN sales s ON s.tenant_id = si.tenant_id AND s.id = si.sale_id
             LEFT JOIN products p ON p.tenant_id = si.tenant_id AND p.id = si.product_id
             LEFT JOIN product_categories pc ON pc.tenant_id = p.tenant_id AND pc.id = p.category_id
             WHERE si.tenant_id = $1 AND s.payment_status NOT IN ('reversed','refunded')
               AND ($2::uuid IS NULL OR s.branch_id = $2::uuid)
               AND ($3::uuid[] IS NULL OR s.branch_id = ANY($3::uuid[]))
               AND (s.transaction_date AT TIME ZONE 'Africa/Nairobi')::DATE BETWEEN $4::date AND $5::date
             GROUP BY 1 ORDER BY revenue DESC`,
            [ctx.tenantId, effectiveBranch, ctx.allowedBranchIds, range.startDate, range.endDate],
          ),
          client.query(
            `SELECT b.id AS branch_id, b.name AS branch_name, b.code,
                    COALESCE(SUM(s.total_amount), 0)::NUMERIC(14,2) AS revenue,
                    COALESCE(SUM(s.total_amount - s.cost_of_goods_sold), 0)::NUMERIC(14,2) AS gross_profit,
                    COUNT(s.id)::int AS orders
             FROM branches b
             LEFT JOIN sales s ON s.tenant_id = b.tenant_id AND s.branch_id = b.id
               AND s.payment_status NOT IN ('reversed','refunded')
               AND (s.transaction_date AT TIME ZONE 'Africa/Nairobi')::DATE BETWEEN $3::date AND $4::date
             WHERE b.tenant_id = $1 AND b.status = 'active'
               AND ($2::uuid[] IS NULL OR b.id = ANY($2::uuid[]))
               AND ($5::uuid IS NULL OR b.id = $5::uuid)
             GROUP BY b.id ORDER BY revenue DESC`,
            [ctx.tenantId, ctx.allowedBranchIds, range.startDate, range.endDate, effectiveBranch],
          ),
          client.query(
            `SELECT COALESCE(ec.name, 'General') AS category, SUM(e.amount)::NUMERIC(14,2) AS total
             FROM expenses e
             LEFT JOIN expense_categories ec ON ec.tenant_id = e.tenant_id AND ec.id = e.category_id
             WHERE e.tenant_id = $1
               AND ($2::uuid IS NULL OR e.branch_id = $2::uuid)
               AND ($3::uuid[] IS NULL OR e.branch_id = ANY($3::uuid[]))
               AND e.expense_date BETWEEN $4::date AND $5::date
             GROUP BY 1 ORDER BY total DESC`,
            [ctx.tenantId, effectiveBranch, ctx.allowedBranchIds, range.startDate, range.endDate],
          ),
          client.query(
            `SELECT sp.payment_method, SUM(sp.amount)::NUMERIC(14,2) AS total, COUNT(*)::int AS count
             FROM sales_payments sp
             JOIN sales s ON s.tenant_id = sp.tenant_id AND s.id = sp.sale_id
             WHERE sp.tenant_id = $1 AND s.payment_status NOT IN ('reversed','refunded')
               AND ($2::uuid IS NULL OR s.branch_id = $2::uuid)
               AND ($5::uuid[] IS NULL OR s.branch_id = ANY($5::uuid[]))
               AND (s.transaction_date AT TIME ZONE 'Africa/Nairobi')::DATE BETWEEN $3::date AND $4::date
             GROUP BY 1 ORDER BY total DESC`,
            [ctx.tenantId, effectiveBranch, range.startDate, range.endDate, ctx.allowedBranchIds],
          ),
          client.query(
            `SELECT
               COUNT(*)::int AS total_skus,
               COUNT(*) FILTER (WHERE stock_status = 'stockout')::int AS stockout_count,
               COUNT(*) FILTER (WHERE stock_status = 'low_stock')::int AS low_stock_count,
               COALESCE(SUM(inventory_value_cost), 0)::NUMERIC(14,2) AS total_inventory_value
             FROM vw_inventory_status
             WHERE tenant_id = $1
               AND ($2::uuid IS NULL OR branch_id = $2::uuid)
               AND ($3::uuid[] IS NULL OR branch_id = ANY($3::uuid[]))`,
            [ctx.tenantId, effectiveBranch, ctx.allowedBranchIds],
          ),
          client.query(
            `SELECT COUNT(*)::int AS total_customers,
                    COUNT(*) FILTER (WHERE marketing_opt_in = TRUE)::int AS opted_in_customers,
                    COUNT(*) FILTER (WHERE created_at::date BETWEEN $2::date AND $3::date)::int AS new_customers
             FROM customers WHERE tenant_id = $1`,
            [ctx.tenantId, range.startDate, range.endDate],
          ),
          client.query(
            `SELECT
               (SELECT COUNT(*)::int FROM sales WHERE tenant_id = $1 AND ($2::uuid IS NULL OR branch_id = $2::uuid) AND ($3::uuid[] IS NULL OR branch_id = ANY($3::uuid[]))) AS total_sales_rows,
               (SELECT COUNT(*)::int FROM expenses WHERE tenant_id = $1 AND ($2::uuid IS NULL OR branch_id = $2::uuid) AND ($3::uuid[] IS NULL OR branch_id = ANY($3::uuid[]))) AS total_expense_rows,
               (SELECT COUNT(*)::int FROM vw_inventory_status WHERE tenant_id = $1 AND ($2::uuid IS NULL OR branch_id = $2::uuid) AND ($3::uuid[] IS NULL OR branch_id = ANY($3::uuid[]))) AS total_product_rows,
               (SELECT COUNT(*)::int FROM customers WHERE tenant_id = $1 AND $2::uuid IS NULL AND $3::uuid[] IS NULL) AS total_customer_rows,
               (SELECT ROUND(AVG(quality_score), 1) FROM data_import_jobs WHERE tenant_id = $1 AND quality_score IS NOT NULL AND ($2::uuid IS NULL OR branch_id = $2::uuid) AND ($3::uuid[] IS NULL OR branch_id = ANY($3::uuid[]))) AS avg_import_quality`,
            [ctx.tenantId, effectiveBranch, ctx.allowedBranchIds],
          ),
          client.query(
            `SELECT * FROM recommendations WHERE tenant_id = $1 AND status = 'open' ORDER BY CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END LIMIT 5`,
            [ctx.tenantId],
          ),
        ]);

      const c = currRes.rows[0];
      const p = prevRes.rows[0];
      const q = qualityRes.rows[0];
      const hasSalesData = Number(q.total_sales_rows) > 0;
      const hasExpenseData = ctx.permissions.includes('finance:read') && Number(q.total_expense_rows) > 0;
      const hasInventoryData = ctx.permissions.includes('inventory:read') && Number(q.total_product_rows) > 0;
      const hasCustomerData = ctx.permissions.includes('customers:read') && Number(q.total_customer_rows) > 0;

      const revenue = Number(c.rev);
      const prevRevenue = Number(p.rev);
      const expenses = Number(c.exp);
      const prevExpenses = Number(p.exp);
      const grossProfit = Number(c.gross_profit);
      const prevGrossProfit = Number(p.gross_profit);
      const netProfit = Number(c.net_profit);
      const prevNetProfit = Number(p.net_profit);
      const orderVolume = Number(c.orders);
      const costsComplete = orderVolume > 0 && Number(c.unknown_costs) === 0;
      const costsEstimated = Number(c.estimated_costs) > 0;
      const prevOrderVolume = Number(p.orders);
      const aov = Number(c.aov);
      const prevAov = Number(p.aov);

      const canViewFinance = ctx.permissions.includes('finance:read');

      // Documented KPI definitions with formulas & source transparency (Section 7.5)
      const kpis = {
        totalRevenue: {
          value: revenue,
          previousValue: prevRevenue,
          changePct: pctChange(revenue, prevRevenue),
          available: hasSalesData,
          formula: 'SUM(sales.total_amount) excluding reversed/refunded transactions',
          source: 'sales',
        },
        totalExpenses: {
          value: canViewFinance ? expenses : null,
          previousValue: canViewFinance ? prevExpenses : null,
          changePct: canViewFinance ? pctChange(expenses, prevExpenses) : null,
          available: hasExpenseData && canViewFinance,
          formula: 'SUM(expenses.amount) within selected date & branch scope',
          source: 'expenses',
        },
        grossProfit: {
          value: costsComplete && canViewFinance ? grossProfit : null,
          previousValue: canViewFinance && Number(p.orders) > 0 && Number(p.unknown_costs) === 0 ? prevGrossProfit : null,
          changePct: canViewFinance && costsComplete && Number(p.orders) > 0 && Number(p.unknown_costs) === 0 ? pctChange(grossProfit, prevGrossProfit) : null,
          available: costsComplete && canViewFinance,
          formula: 'SUM(sales.total_amount - sales.cost_of_goods_sold)',
          source: 'sales, sales_items',
        },
        netProfit: {
          value: costsComplete && hasExpenseData && canViewFinance ? netProfit : null,
          previousValue: costsComplete && Number(p.orders) > 0 && Number(p.unknown_costs) === 0 && hasExpenseData && canViewFinance ? prevNetProfit : null,
          changePct: costsComplete && Number(p.orders) > 0 && Number(p.unknown_costs) === 0 && hasExpenseData && canViewFinance ? pctChange(netProfit, prevNetProfit) : null,
          available: costsComplete && hasExpenseData && canViewFinance,
          formula: 'Gross Profit - Total Operating Expenses (hidden when expense data is missing)',
          source: 'sales, expenses',
        },
        orderVolume: {
          value: orderVolume,
          previousValue: prevOrderVolume,
          changePct: pctChange(orderVolume, prevOrderVolume),
          available: hasSalesData,
          formula: 'COUNT(sales.id) excluding reversed/refunded sales',
          source: 'sales',
        },
        avgOrderValue: {
          value: aov,
          previousValue: prevAov,
          changePct: pctChange(aov, prevAov),
          available: hasSalesData,
          formula: 'Total Revenue / Order Volume',
          source: 'sales',
        },
      };

      const coverageDomains = [hasSalesData, hasExpenseData, hasInventoryData, hasCustomerData];
      const coveragePct = Math.round((coverageDomains.filter(Boolean).length / coverageDomains.length) * 100);

      return {
        period: range,
        branchScope: effectiveBranch || (ctx.allowedBranchIds ? 'assigned_branches' : 'all_branches'),
        kpis,
        revenueTrend: trendRes.rows.map((r) => ({
          date: r.date,
          revenue: Number(r.revenue),
          grossProfit: canViewFinance && costsComplete ? Number(r.gross_profit) : null,
          orders: Number(r.orders),
        })),
        topProducts: topProdRes.rows.map((r) => ({
          ...r,
          units_sold: Number(r.units_sold),
          revenue: Number(r.revenue),
          gross_profit: canViewFinance && costsComplete ? Number(r.gross_profit) : null,
        })),
        salesByCategory: catRes.rows.map((r) => ({
          category: r.category,
          revenue: Number(r.revenue),
          units: Number(r.units),
        })),
        salesByBranch: branchRes.rows.map((r) => ({
          branchId: r.branch_id,
          branchName: r.branch_name,
          code: r.code,
          revenue: Number(r.revenue),
          grossProfit: canViewFinance && costsComplete ? Number(r.gross_profit) : null,
          orders: Number(r.orders),
        })),
        expensesByCategory: ctx.permissions.includes('finance:read')
          ? expCatRes.rows.map((r) => ({ category: r.category, total: Number(r.total) }))
          : [],
        paymentMix: payMixRes.rows.map((r) => ({
          method: r.payment_method,
          total: Number(r.total),
          count: Number(r.count),
        })),
        inventorySummary: ctx.permissions.includes('inventory:read') ? {
          totalSkus: Number(invRes.rows[0].total_skus),
          stockoutCount: Number(invRes.rows[0].stockout_count),
          lowStockCount: Number(invRes.rows[0].low_stock_count),
          totalInventoryValue: canViewFinance ? Number(invRes.rows[0].total_inventory_value) : null,
        } : null,
        customerSummary: ctx.permissions.includes('customers:read') && !effectiveBranch && ctx.allowedBranchIds === null ? custAcqRes.rows[0] : null,
        dataQuality: {
          coveragePct,
          costsComplete,
          costsEstimated,
          unknownCostRecords: Number(c.unknown_costs),
          hasSalesData,
          hasExpenseData,
          hasInventoryData,
          hasCustomerData,
          avgImportQualityScore: q.avg_import_quality == null ? null : Number(q.avg_import_quality),
          counts: {
            sales: Number(q.total_sales_rows),
            expenses: canViewFinance ? Number(q.total_expense_rows) : null,
            products: ctx.permissions.includes('inventory:read') ? Number(q.total_product_rows) : null,
            customers: ctx.permissions.includes('customers:read') && !effectiveBranch && ctx.allowedBranchIds === null ? Number(q.total_customer_rows) : null,
          },
        },
        recommendations: canViewFinance && !effectiveBranch && ctx.allowedBranchIds === null ? recsRes.rows : [],
      };
    });
  }

  @Get('sales')
  @RequirePermissions('sales:read')
  async salesAnalytics(@Query('days') days: string | undefined, @Query('branchId') branchId: string | undefined, @TenantCtx() ctx: TenantAuthContext) {
    const range = resolveDateRange(days);
    return this.db.withTenant(ctx.tenantId, async (client) => {
      const effectiveBranch = branchId && branchId !== 'all' ? branchId : null;
      const res = await client.query(
        `SELECT d.*, EXISTS(SELECT 1 FROM sales s WHERE s.tenant_id=d.tenant_id AND s.branch_id=d.branch_id
          AND s.payment_status NOT IN ('reversed','refunded') AND s.cost_basis='unknown'
          AND (s.transaction_date AT TIME ZONE 'Africa/Nairobi')::date=d.sale_date) AS has_unknown_costs
         FROM vw_daily_sales_summary d
         WHERE d.tenant_id = $1
           AND ($2::uuid IS NULL OR d.branch_id = $2::uuid)
           AND ($3::uuid[] IS NULL OR d.branch_id = ANY($3::uuid[]))
           AND d.sale_date BETWEEN $4::date AND $5::date
         ORDER BY d.sale_date DESC`,
        [ctx.tenantId, effectiveBranch, ctx.allowedBranchIds, range.startDate, range.endDate],
      );
      return { period: range, dailySummary: res.rows.map((row) => ({ ...row,
        total_cogs: ctx.permissions.includes('finance:read') && !row.has_unknown_costs ? row.total_cogs : null,
        gross_profit: ctx.permissions.includes('finance:read') && !row.has_unknown_costs ? row.gross_profit : null,
      })) };
    });
  }

  @Get('products')
  @RequirePermissions('analytics:read', 'finance:read')
  async productAnalytics(@TenantCtx() ctx: TenantAuthContext) {
    if (ctx.allowedBranchIds !== null) throw new ForbiddenException('Product performance is available only in the whole-business view.');
    return this.db.withTenant(ctx.tenantId, async (client) => {
      const [perf, cats, unknown] = await Promise.all([
        client.query(`SELECT * FROM vw_product_performance WHERE tenant_id = $1 ORDER BY gross_profit DESC`, [ctx.tenantId]),
        client.query(`SELECT * FROM product_categories WHERE tenant_id = $1 ORDER BY name ASC`, [ctx.tenantId]),
        client.query(`SELECT EXISTS(SELECT 1 FROM sales WHERE tenant_id=$1 AND payment_status NOT IN ('reversed','refunded') AND cost_basis='unknown') AS missing`, [ctx.tenantId]),
      ]);
      return { products: unknown.rows[0].missing ? perf.rows.map((p) => ({ ...p, total_cost: null, gross_profit: null, margin_pct: null })) : perf.rows, categories: cats.rows };
    });
  }

  @Get('customers')
  @RequirePermissions('customers:read')
  async customerAnalytics(@TenantCtx() ctx: TenantAuthContext) {
    if (ctx.allowedBranchIds !== null) throw new ForbiddenException('Customer analytics is available only in the whole-business view.');
    return this.db.withTenant(ctx.tenantId, async (client) => {
      const res = await client.query(
        `SELECT * FROM vw_customer_purchase_summary WHERE tenant_id = $1 ORDER BY lifetime_value DESC`,
        [ctx.tenantId],
      );
      return { customers: res.rows };
    });
  }

  @Get('expenses')
  @RequirePermissions('finance:read')
  async expenseAnalytics(@TenantCtx() ctx: TenantAuthContext) {
    return this.db.withTenant(ctx.tenantId, async (client) => {
      const res = await client.query(
        `SELECT * FROM vw_expense_summary WHERE tenant_id = $1 AND ($2::uuid[] IS NULL OR branch_id = ANY($2::uuid[])) ORDER BY expense_month DESC, total_amount DESC`,
        [ctx.tenantId, ctx.allowedBranchIds],
      );
      return { summary: res.rows };
    });
  }

  @Get('inventory')
  @RequirePermissions('inventory:read')
  async inventoryAnalytics(@TenantCtx() ctx: TenantAuthContext) {
    return this.db.withTenant(ctx.tenantId, async (client) => {
      const res = await client.query(
        `SELECT * FROM vw_inventory_status WHERE tenant_id = $1 AND ($2::uuid[] IS NULL OR branch_id = ANY($2::uuid[])) ORDER BY stock_status ASC, available_quantity ASC`,
        [ctx.tenantId, ctx.allowedBranchIds],
      );
      return { inventory: res.rows.map((row) => inventoryRowForRole(row, ctx)) };
    });
  }

  @Get('search')
  @RequirePermissions('analytics:read')
  async globalSearch(@Query('q') q: string | undefined, @TenantCtx() ctx: TenantAuthContext) {
    const term = (q || '').trim();
    if (term.length < 2) return { products: [], customers: [], sales: [] };
    const like = `%${term}%`;
    return this.db.withTenant(ctx.tenantId, async (client) => {
      const [products, customers, sales] = await Promise.all([
        ctx.permissions.includes('inventory:read')
          ? client.query(
              `SELECT p.id, p.sku, p.name, p.selling_price FROM products p
               WHERE p.tenant_id = $1 AND (p.name ILIKE $2 OR p.sku ILIKE $2)
                 AND ($3::uuid[] IS NULL OR EXISTS (SELECT 1 FROM inventory i WHERE i.tenant_id=p.tenant_id AND i.product_id=p.id AND i.branch_id=ANY($3::uuid[]))) LIMIT 6`,
              [ctx.tenantId, like, ctx.allowedBranchIds],
            )
          : Promise.resolve({ rows: [] }),
        ctx.permissions.includes('customers:read')
          ? client.query(
              `SELECT id, full_name, phone_number, email FROM customers WHERE tenant_id = $1 AND (full_name ILIKE $2 OR phone_number ILIKE $2) AND ($3::uuid[] IS NULL OR branch_id = ANY($3::uuid[])) LIMIT 6`,
              [ctx.tenantId, like, ctx.allowedBranchIds],
            )
          : Promise.resolve({ rows: [] }),
        ctx.permissions.includes('sales:read')
          ? client.query(
              `SELECT id, transaction_ref, total_amount, transaction_date FROM sales WHERE tenant_id = $1 AND transaction_ref ILIKE $2 AND ($3::uuid[] IS NULL OR branch_id = ANY($3::uuid[])) LIMIT 6`,
              [ctx.tenantId, like, ctx.allowedBranchIds],
            )
          : Promise.resolve({ rows: [] }),
      ]);
      return { products: products.rows, customers: customers.rows, sales: sales.rows };
    });
  }

  /**
   * Pro Data Scientist Statistical Audit, Multi-Model Ensemble Forecast,
   * Exact Formula Proofs, Weekday Seasonality, MAD Anomalies & Pie-Chart Datasets.
   */
  @Get('pro-insights')
  @RequirePermissions('analytics:read', 'sales:read')
  async proInsights(
    @Query('days') days: string | undefined,
    @Query('branchId') branchId: string | undefined,
    @Query('horizon') horizon: string | undefined,
    @TenantCtx() ctx: TenantAuthContext,
  ) {
    const requestedDays = Number(days || 45);
    const requestedHorizon = Number(horizon || 14);
    if (!Number.isInteger(requestedDays) || !Number.isInteger(requestedHorizon)) throw new BadRequestException('Days and horizon must be whole numbers.');
    const span = Math.min(90, Math.max(14, requestedDays));
    const horizonDays = Math.min(30, Math.max(7, requestedHorizon));
    const effectiveBranch = branchId && branchId !== 'all' ? branchId : null;

    return this.db.withTenant(ctx.tenantId, async (client) => {
      const [dailyRes, kpiRes, prodRes, payRes, expRes, invRes, finRes] = await Promise.all([
        client.query(
          `SELECT (s.transaction_date AT TIME ZONE 'Africa/Nairobi')::DATE::text AS date,
                  COALESCE(SUM(s.total_amount), 0)::float AS revenue,
                  COALESCE(SUM(s.total_amount - s.cost_of_goods_sold), 0)::float AS gross_profit,
                  COUNT(*)::int AS orders
           FROM sales s
           WHERE s.tenant_id = $1
             AND s.payment_status NOT IN ('reversed', 'refunded')
             AND ($2::uuid IS NULL OR s.branch_id = $2::uuid)
             AND ($3::uuid[] IS NULL OR s.branch_id = ANY($3::uuid[]))
             AND (s.transaction_date AT TIME ZONE 'Africa/Nairobi')::DATE >= (NOW() AT TIME ZONE 'Africa/Nairobi')::date - $4::int
           GROUP BY 1 ORDER BY 1 ASC`,
          [ctx.tenantId, effectiveBranch, ctx.allowedBranchIds, span],
        ),
        client.query(
          `SELECT
             COALESCE(SUM(s.total_amount), 0)::float AS total_revenue,
             COALESCE(SUM(s.cost_of_goods_sold), 0)::float AS total_cogs,
             COUNT(*)::int AS total_orders,
             COUNT(*) FILTER (WHERE s.cost_basis = 'unknown')::int AS unknown_costs,
             (SELECT COUNT(*)::int FROM expenses e WHERE e.tenant_id = $1
                AND ($2::uuid IS NULL OR e.branch_id = $2::uuid)
                AND ($3::uuid[] IS NULL OR e.branch_id = ANY($3::uuid[]))
                AND e.expense_date >= (NOW() AT TIME ZONE 'Africa/Nairobi')::date - $4::int) AS expense_count,
             (SELECT COALESCE(SUM(e.amount), 0)::float FROM expenses e
              WHERE e.tenant_id = $1
                AND ($2::uuid IS NULL OR e.branch_id = $2::uuid)
                AND ($3::uuid[] IS NULL OR e.branch_id = ANY($3::uuid[]))
                AND e.expense_date >= (NOW() AT TIME ZONE 'Africa/Nairobi')::date - $4::int) AS total_expenses
           FROM sales s
           WHERE s.tenant_id = $1
             AND s.payment_status NOT IN ('reversed', 'refunded')
             AND ($2::uuid IS NULL OR s.branch_id = $2::uuid)
             AND ($3::uuid[] IS NULL OR s.branch_id = ANY($3::uuid[]))
             AND (s.transaction_date AT TIME ZONE 'Africa/Nairobi')::DATE >= (NOW() AT TIME ZONE 'Africa/Nairobi')::date - $4::int`,
          [ctx.tenantId, effectiveBranch, ctx.allowedBranchIds, span],
        ),
        client.query(
          `SELECT si.product_name_snapshot AS name,
                  COALESCE(SUM(si.line_total), 0)::float AS revenue
           FROM sales_items si
           JOIN sales s ON s.tenant_id = si.tenant_id AND s.id = si.sale_id
           WHERE si.tenant_id = $1
             AND s.payment_status NOT IN ('reversed', 'refunded')
             AND ($2::uuid IS NULL OR s.branch_id = $2::uuid)
             AND ($3::uuid[] IS NULL OR s.branch_id = ANY($3::uuid[]))
             AND (s.transaction_date AT TIME ZONE 'Africa/Nairobi')::DATE >= (NOW() AT TIME ZONE 'Africa/Nairobi')::date - $4::int
           GROUP BY 1 ORDER BY revenue DESC LIMIT 30`,
          [ctx.tenantId, effectiveBranch, ctx.allowedBranchIds, span],
        ),
        client.query(
          `SELECT sp.payment_method AS method,
                  COALESCE(SUM(sp.amount), 0)::float AS total
           FROM sales_payments sp
           JOIN sales s ON s.tenant_id = sp.tenant_id AND s.id = sp.sale_id
           WHERE sp.tenant_id = $1
             AND s.payment_status NOT IN ('reversed', 'refunded')
             AND ($2::uuid IS NULL OR s.branch_id = $2::uuid)
             AND ($3::uuid[] IS NULL OR s.branch_id = ANY($3::uuid[]))
             AND (s.transaction_date AT TIME ZONE 'Africa/Nairobi')::DATE >= (NOW() AT TIME ZONE 'Africa/Nairobi')::date - $4::int
           GROUP BY 1 ORDER BY total DESC`,
          [ctx.tenantId, effectiveBranch, ctx.allowedBranchIds, span],
        ),
        client.query(
          `SELECT COALESCE(ec.name, e.vendor_name, 'General') AS category,
                  COALESCE(SUM(e.amount), 0)::float AS total
           FROM expenses e
           LEFT JOIN expense_categories ec ON ec.tenant_id = e.tenant_id AND ec.id = e.category_id
           WHERE e.tenant_id = $1
             AND ($2::uuid IS NULL OR e.branch_id = $2::uuid)
             AND ($3::uuid[] IS NULL OR e.branch_id = ANY($3::uuid[]))
             AND e.expense_date >= (NOW() AT TIME ZONE 'Africa/Nairobi')::date - $4::int
           GROUP BY 1 ORDER BY total DESC LIMIT 8`,
          [ctx.tenantId, effectiveBranch, ctx.allowedBranchIds, span],
        ),
        client.query(
          `SELECT COUNT(*) FILTER (WHERE stock_status = 'stockout')::int AS stockout_count,
                  COUNT(*) FILTER (WHERE stock_status = 'low_stock')::int AS low_stock_count
           FROM vw_inventory_status
           WHERE tenant_id = $1
             AND ($2::uuid IS NULL OR branch_id = $2::uuid)
             AND ($3::uuid[] IS NULL OR branch_id = ANY($3::uuid[]))`,
          [ctx.tenantId, effectiveBranch, ctx.allowedBranchIds],
        ),
        client.query(
          `SELECT
             (SELECT COALESCE(SUM(opening_balance), 0)::float FROM cash_accounts WHERE tenant_id = $1) AS cash_balance,
             (SELECT COALESCE(SUM(amount_due - amount_paid), 0)::float FROM payables WHERE tenant_id = $1 AND status <> 'paid') AS payables,
             (SELECT COALESCE(SUM(amount_due - amount_paid), 0)::float FROM receivables WHERE tenant_id = $1 AND status <> 'paid') AS receivables`,
          [ctx.tenantId],
        ),
      ]);

      const kpi = kpiRes.rows[0] || {};
      const inv = invRes.rows[0] || {};
      const fin = finRes.rows[0] || {};

      const canSeeFinance = ctx.permissions.includes('finance:read');
      const payload = {
        daily_sales: dailyRes.rows,
        products: prodRes.rows,
        payment_mix: payRes.rows,
        expense_mix: canSeeFinance ? expRes.rows : [],
        total_revenue: Number(kpi.total_revenue || 0),
        total_cogs: Number(kpi.total_cogs || 0),
        total_expenses: canSeeFinance ? Number(kpi.total_expenses || 0) : 0,
        cost_data_available: canSeeFinance && Number(kpi.total_orders || 0) > 0 && Number(kpi.unknown_costs || 0) === 0,
        expense_data_available: canSeeFinance && Number(kpi.expense_count || 0) > 0,
        total_orders: Number(kpi.total_orders || 0),
        cash_balance: canSeeFinance && !effectiveBranch && ctx.allowedBranchIds === null ? Number(fin.cash_balance || 0) : 0,
        payables: canSeeFinance && !effectiveBranch && ctx.allowedBranchIds === null ? Number(fin.payables || 0) : 0,
        receivables: canSeeFinance && !effectiveBranch && ctx.allowedBranchIds === null ? Number(fin.receivables || 0) : 0,
        liquidity_data_available: false,
        stockout_count: ctx.permissions.includes('inventory:read') ? Number(inv.stockout_count || 0) : 0,
        low_stock_count: ctx.permissions.includes('inventory:read') ? Number(inv.low_stock_count || 0) : 0,
        period_days: span,
        horizon_days: horizonDays,
      };

      const res = await fetch(`${envConfig.intelligenceUrl}/v1/scientist/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) {
        throw new BadRequestException('Pro Data Scientist engine is temporarily unavailable.');
      }
      const analysis = await res.json();
      // Analytics permission alone does not grant access to predictive features.
      if (!ctx.permissions.includes('predict:sales')) analysis.forecast = { series: [], model_benchmarks: [] };
      return {
        organization: ctx.tenantName,
        periodDays: span,
        horizonDays,
        generatedAt: new Date().toISOString(),
        ...analysis,
      };
    });
  }

  /**
   * Daily Continuous Records Check-In Status (Africa/Nairobi timezone).
   * Prompts clients whenever today's daily sales have not yet been logged.
   */
  @Get('daily-checkin-status')
  @RequirePermissions('analytics:read', 'sales:read')
  async dailyCheckinStatus(
    @Query('branchId') branchId: string | undefined,
    @TenantCtx() ctx: TenantAuthContext,
  ) {
    const effectiveBranch = branchId && branchId !== 'all' ? branchId : null;
    return this.db.withTenant(ctx.tenantId, async (client) => {
      const [calRes, streakRes] = await Promise.all([
        client.query(
          `WITH days AS (
             SELECT generate_series(
               (NOW() AT TIME ZONE 'Africa/Nairobi')::DATE - INTERVAL '6 days',
               (NOW() AT TIME ZONE 'Africa/Nairobi')::DATE,
               INTERVAL '1 day'
             )::DATE AS day_date
           )
           SELECT
             d.day_date::text AS date,
             TO_CHAR(d.day_date, 'Dy') AS day_label,
             COALESCE((
               SELECT SUM(s.total_amount)::float FROM sales s
               WHERE s.tenant_id = $1
                 AND s.payment_status NOT IN ('reversed', 'refunded')
                 AND ($2::uuid IS NULL OR s.branch_id = $2::uuid)
                 AND ($3::uuid[] IS NULL OR s.branch_id = ANY($3::uuid[]))
                 AND (s.transaction_date AT TIME ZONE 'Africa/Nairobi')::DATE = d.day_date
             ), 0) AS revenue,
             COALESCE((
               SELECT COUNT(*)::int FROM sales s
               WHERE s.tenant_id = $1
                 AND s.payment_status NOT IN ('reversed', 'refunded')
                 AND ($2::uuid IS NULL OR s.branch_id = $2::uuid)
                 AND ($3::uuid[] IS NULL OR s.branch_id = ANY($3::uuid[]))
                 AND (s.transaction_date AT TIME ZONE 'Africa/Nairobi')::DATE = d.day_date
             ), 0) AS orders,
             COALESCE((
               SELECT SUM(e.amount)::float FROM expenses e
               WHERE e.tenant_id = $1
                 AND ($2::uuid IS NULL OR e.branch_id = $2::uuid)
                 AND ($3::uuid[] IS NULL OR e.branch_id = ANY($3::uuid[]))
                 AND e.expense_date = d.day_date
             ), 0) AS expenses
           FROM days d
           ORDER BY d.day_date ASC`,
          [ctx.tenantId, effectiveBranch, ctx.allowedBranchIds],
        ),
        client.query(
          `SELECT DISTINCT (s.transaction_date AT TIME ZONE 'Africa/Nairobi')::DATE::text AS d
           FROM sales s
           WHERE s.tenant_id = $1
             AND s.payment_status NOT IN ('reversed', 'refunded')
             AND ($2::uuid IS NULL OR s.branch_id = $2::uuid)
             AND ($3::uuid[] IS NULL OR s.branch_id = ANY($3::uuid[]))
             AND (s.transaction_date AT TIME ZONE 'Africa/Nairobi')::DATE >= (NOW() AT TIME ZONE 'Africa/Nairobi')::DATE - INTERVAL '60 days'
           ORDER BY d DESC`,
          [ctx.tenantId, effectiveBranch, ctx.allowedBranchIds],
        ),
      ]);

      const calendar = calRes.rows.map((r) => ({
        date: r.date,
        dayLabel: r.day_label,
        revenue: Number(r.revenue || 0),
        orders: Number(r.orders || 0),
        expenses: ctx.permissions.includes('finance:read') ? Number(r.expenses || 0) : null,
        hasSales: Number(r.revenue || 0) > 0,
      }));
      const todayRow = calendar[calendar.length - 1];
      const recordedSet = new Set(streakRes.rows.map((r) => r.d));

      // Compute consecutive-day streak ending today (or yesterday if today not logged yet)
      let streakDays = 0;
      const anchor = new Date(`${todayRow.date}T12:00:00Z`);
      const startOffset = recordedSet.has(todayRow.date) ? 0 : 1;
      for (let i = startOffset; i < 60; i++) {
        const dt = new Date(anchor.getTime() - i * 86400000).toISOString().slice(0, 10);
        if (recordedSet.has(dt)) streakDays += 1;
        else break;
      }

      const missingRecentDays = calendar.filter((d) => !d.hasSales).length;

      return {
        todayDate: todayRow.date,
        todayLogged: todayRow.hasSales,
        needsTodayCheckin: !todayRow.hasSales,
        todayRevenue: todayRow.revenue,
        todayExpenses: todayRow.expenses,
        streakDays,
        missingRecentDays,
        calendar,
      };
    });
  }

  /**
   * 20-Second Daily Sales & Expense Close-of-Day Check-In.
   * Records M-Pesa, Cash, and Card/Bank totals strictly for analytics & forecasting.
   */
  @Post('daily-checkin')
  @RequirePermissions('sales:write')
  async submitDailyCheckin(
    @Body()
    body: {
      recordDate?: string;
      branchId?: string;
      mpesaSales?: number;
      cashSales?: number;
      cardBankSales?: number;
      orderCount?: number;
      cogsEstimatePct?: number;
      totalExpenses?: number;
      expenseVendor?: string;
      expenseNotes?: string;
      notes?: string;
    },
    @TenantCtx() ctx: TenantAuthContext,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const amounts = [body.mpesaSales, body.cashSales, body.cardBankSales, body.totalExpenses].map((value) => Number(value ?? 0));
    if (amounts.some((value) => !Number.isFinite(value) || value < 0)) throw new BadRequestException('Amounts must be valid non-negative numbers.');
    const [mpesa, cash, cardBank, totalExpenses] = amounts;
    const totalSales = Number((mpesa + cash + cardBank).toFixed(2));

    if (totalExpenses > 0 && !ctx.permissions.includes('finance:write')) throw new ForbiddenException('Your role cannot record expenses.');
    if (totalSales <= 0 && totalExpenses <= 0) {
      throw new BadRequestException('Enter at least one sales amount (M-Pesa, Cash, or Card/Bank) or daily expense.');
    }

    const hasCostEstimate = body.cogsEstimatePct !== undefined && body.cogsEstimatePct !== null;
    const cogsPct = hasCostEstimate ? Number(body.cogsEstimatePct) : 0;
    if (!Number.isFinite(cogsPct) || cogsPct < 0 || cogsPct > 100) throw new BadRequestException('Cost percentage must be between 0 and 100.');
    const recordDate =
      body.recordDate && /^\d{4}-\d{2}-\d{2}$/.test(body.recordDate)
        ? body.recordDate
        : new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Nairobi' }).format(new Date());

    return this.db.withTenant(ctx.tenantId, async (client) => {
      let targetBranchId = body.branchId && body.branchId !== 'all' ? body.branchId : null;
      if (ctx.allowedBranchIds && ctx.allowedBranchIds.length === 0) throw new ForbiddenException('No branch is assigned to your role.');
      if (ctx.allowedBranchIds && ctx.allowedBranchIds.length > 0) {
        if (targetBranchId && !ctx.allowedBranchIds.includes(targetBranchId)) {
          throw new ForbiddenException('You are not authorized to record daily sales for this branch.');
        }
        if (!targetBranchId) targetBranchId = ctx.allowedBranchIds[0];
      }
      if (!targetBranchId) {
        const bRes = await client.query(
          `SELECT id FROM branches WHERE tenant_id = $1 AND status = 'active' ORDER BY is_headquarters DESC, created_at ASC LIMIT 1`,
          [ctx.tenantId],
        );
        if (bRes.rowCount === 0) throw new BadRequestException('No active branch found for this workspace.');
        targetBranchId = bRes.rows[0].id;
      }

      let recordedSaleId: string | null = null;
      let recordedExpenseId: string | null = null;

      if (totalSales > 0) {
        const cogs = Number(((totalSales * cogsPct) / 100).toFixed(2));
        const txRef = `DAILY-${recordDate.replace(/-/g, '')}-${randomUUID().slice(0, 8)}`;
        const txTimestamp = `${recordDate}T18:00:00+03:00`;
        const ordersMeta = body.orderCount ? ` (${Math.max(1, Number(body.orderCount))} orders)` : '';
        const noteText = `Daily Sales Check-In${ordersMeta}${body.notes ? ` — ${String(body.notes).slice(0, 240)}` : ''}`;

        const saleIns = await client.query(
          `INSERT INTO sales (
             tenant_id, branch_id, transaction_ref, source_system, transaction_date,
             payment_status, currency_code, subtotal, discount_amount, tax_amount,
             total_amount, cost_of_goods_sold, notes, created_by, cost_basis
           )
           VALUES ($1,$2,$3,'manual',$4::timestamptz,'paid','KES',$5,0,0,$5,$6,$7,$8,$9)
           RETURNING id`,
          [ctx.tenantId, targetBranchId, txRef, txTimestamp, totalSales, cogs, noteText, user.userId, hasCostEstimate ? 'estimated' : 'unknown'],
        );
        recordedSaleId = saleIns.rows[0].id;

        const splits: Array<{ method: string; amount: number }> = [];
        if (mpesa > 0) splits.push({ method: 'mpesa', amount: mpesa });
        if (cash > 0) splits.push({ method: 'cash', amount: cash });
        if (cardBank > 0) splits.push({ method: 'bank_transfer', amount: cardBank });

        for (const sp of splits) {
          await client.query(
            `INSERT INTO sales_payments (tenant_id, sale_id, payment_method, amount, reconciliation_status, paid_at)
             VALUES ($1,$2,$3,$4,'recorded',$5::timestamptz)`,
            [ctx.tenantId, recordedSaleId, sp.method, sp.amount, txTimestamp],
          );
        }
      }

      if (totalExpenses > 0) {
        const expRef = `EXP-DAILY-${recordDate.replace(/-/g, '')}-${randomUUID().slice(0, 8)}`;
        const expIns = await client.query(
          `INSERT INTO expenses (
             tenant_id, branch_id, expense_ref, vendor_name, description,
             expense_date, amount, currency_code, payment_method, created_by
           )
           VALUES ($1,$2,$3,$4,$5,$6::date,$7,'KES','unspecified',$8)
           RETURNING id`,
          [
            ctx.tenantId,
            targetBranchId,
            expRef,
            (body.expenseVendor || 'Daily Operations').slice(0, 140),
            (body.expenseNotes || `Daily operating expenses for ${recordDate}`).slice(0, 280),
            recordDate,
            totalExpenses,
            user.userId,
          ],
        );
        recordedExpenseId = expIns.rows[0].id;
      }

      await client.query(`SELECT fn_refresh_analytics_views()`).catch(() => {});

      return {
        recorded: true,
        recordDate,
        totalSales,
        totalExpenses,
        recordedSaleId,
        recordedExpenseId,
        message: `Daily records for ${recordDate} saved. Analytics, pie charts, forecasts & BizWave AI are updated.`,
      };
    });
  }

  /**
   * Fetch & Analyze Client Business Website (Shopify, WooCommerce, JSON-LD, HTML Catalog, or Public CSV/JSON Feed).
   * Optionally imports all extracted products & categories directly into the tenant's isolated workspace.
   */
  @Post('website-analyze')
  @RequirePermissions('analytics:read')
  async analyzeWebsite(
    @Body() body: { url: string; importCatalog?: boolean; branchId?: string },
    @TenantCtx() ctx: TenantAuthContext,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const rawUrl = typeof body?.url === 'string' ? body.url.trim() : '';
    if (!rawUrl || rawUrl.length > 2048 || (body.importCatalog !== undefined && typeof body.importCatalog !== 'boolean')) {
      throw new BadRequestException('Please enter your business website URL (e.g. https://yourbusiness.co.ke).');
    }
    if (body.importCatalog && (!ctx.permissions.includes('inventory:write') || !ctx.permissions.includes('imports:manage'))) {
      throw new ForbiddenException('Your role can analyze website data but does not have catalog import permission.');
    }

    if (ctx.allowedBranchIds !== null && !ctx.allowedBranchIds.length) throw new ForbiddenException('No branch is assigned to your role.');
    let pyRes: Response;
    try {
      pyRes = await fetch(`${envConfig.intelligenceUrl}/v1/scientist/website-analyze`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: rawUrl }), signal: AbortSignal.timeout(30000),
      });
    } catch { throw new ServiceUnavailableException('Website analysis is temporarily unavailable. Please try again.'); }

    if (!pyRes.ok) {
      const errBody = await pyRes.json().catch(() => ({ detail: 'Could not fetch website.' }));
      throw new BadRequestException(errBody.detail || 'Could not fetch and analyze the provided website URL.');
    }
    const analysis: any = await pyRes.json();
    // Reviewing a website must not silently save a source or mutate the catalog.
    // Persist only after the user explicitly chooses to import/update items.
    if (!body.importCatalog) return { ...analysis, importedCount: 0, updatedCount: 0, skippedCount: 0, sourceSaved: false, syncedAt: null };

    return this.db.withTenant(ctx.tenantId, async (client) => {
      let targetBranchId = body.branchId && body.branchId !== 'all' ? body.branchId : null;
      if (ctx.allowedBranchIds && ctx.allowedBranchIds.length === 0) throw new ForbiddenException('No branch is assigned to your role.');
      if (ctx.allowedBranchIds && ctx.allowedBranchIds.length > 0) {
        if (targetBranchId && !ctx.allowedBranchIds.includes(targetBranchId)) {
          throw new ForbiddenException('Not authorized for the selected branch.');
        }
        if (!targetBranchId) targetBranchId = ctx.allowedBranchIds[0];
      }
      if (!targetBranchId) {
        const bRes = await client.query(
          `SELECT id FROM branches WHERE tenant_id = $1 AND status = 'active' ORDER BY is_headquarters DESC, created_at ASC LIMIT 1`,
          [ctx.tenantId],
        );
        targetBranchId = bRes.rows[0]?.id || null;
      }

      if (!targetBranchId) throw new BadRequestException('No active branch is available for this website source.');
      const branch = await client.query(`SELECT id FROM branches WHERE tenant_id=$1 AND id=$2 AND status='active'`, [ctx.tenantId, targetBranchId]);
      if (!branch.rowCount) throw new BadRequestException('Branch not found.');

      // Persist website sync snapshot in data_sources (source_type='json_api')
      const configSnapshot = {
        url: analysis.url,
        business_profile: analysis.business_profile,
        pricing_stats: analysis.pricing_stats,
        charts: analysis.charts,
        insights: analysis.insights,
        sample_products: (analysis.products || []).slice(0, 25),
        analyzed_at: new Date().toISOString(),
      };

      // Serialize saves for this tenant, branch and resolved public URL. This
      // avoids duplicate sources and conflicting links on simultaneous syncs.
      await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [`website:${ctx.tenantId}:${targetBranchId}:${analysis.url}`]);
      const existingDs = await client.query(
        `SELECT id FROM data_sources WHERE tenant_id = $1 AND source_type = 'json_api' AND config->>'url' = $2 AND branch_id IS NOT DISTINCT FROM $3::uuid LIMIT 1`,
        [ctx.tenantId, analysis.url, targetBranchId],
      );
      let sourceId: string;
      if (existingDs.rowCount && existingDs.rowCount > 0) {
        sourceId = existingDs.rows[0].id;
        await client.query(
          `UPDATE data_sources SET name = $3, status = 'active', config = $4::jsonb, last_synced_at = NOW() WHERE id = $1 AND tenant_id = $2`,
          [
            existingDs.rows[0].id,
            ctx.tenantId,
            `Website: ${(analysis.business_profile?.name || rawUrl).slice(0, 120)}`,
            JSON.stringify(configSnapshot),
          ],
        );
      } else {
        const insertedSource = await client.query(
          `INSERT INTO data_sources (tenant_id, branch_id, name, source_type, status, config, last_synced_at, created_by)
           VALUES ($1,$2,$3,'json_api','active',$4::jsonb,NOW(),$5) RETURNING id`,
          [
            ctx.tenantId,
            targetBranchId,
            `Website: ${(analysis.business_profile?.name || rawUrl).slice(0, 120)}`,
            JSON.stringify(configSnapshot),
            user.userId,
          ],
        );
        sourceId = insertedSource.rows[0].id;
      }

      // Import only explicit KES prices. A source may update only products it
      // created itself; an existing SKU owned by a user or another source is
      // skipped rather than silently overwritten. No costs or stock are inferred.
      let importedCount = 0;
      let updatedCount = 0;
      let skippedCount = 0;
      if (body.importCatalog && Array.isArray(analysis.products)) {
        const catCache = new Map<string, string>();
        const seen = new Set<string>();
        for (const item of analysis.products.slice(0, 150)) {
          const prodName = String(item?.name || '').trim().slice(0, 160);
          const sellingPrice = Number(item?.price);
          const currency = String(item?.currency || '').toUpperCase();
          if (!prodName || !Number.isFinite(sellingPrice) || sellingPrice <= 0 || sellingPrice >= 50_000_000 || currency !== 'KES') { skippedCount++; continue; }
          const rawSku = String(item.sku || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 48);
          const externalKey = rawSku ? `sku:${rawSku.toLowerCase()}` : `name:${prodName.toLowerCase()}`;
          if (seen.has(externalKey)) { skippedCount++; continue; }
          seen.add(externalKey);
          const link = await client.query(`SELECT product_id FROM website_catalog_links WHERE tenant_id=$1 AND data_source_id=$2 AND external_key=$3`, [ctx.tenantId, sourceId, externalKey]);
          const generatedSku = `WEB-${createHash('sha256').update(`${sourceId}|${externalKey}`).digest('hex').slice(0, 20).toUpperCase()}`;
          const sku = rawSku || generatedSku;
          if (!link.rowCount) {
            const existing = await client.query(`SELECT id FROM products WHERE tenant_id=$1 AND sku=$2`, [ctx.tenantId, sku]);
            if (existing.rowCount) { skippedCount++; continue; }
          }
          const catName = (String(item.category || 'Website Catalog').trim() || 'Website Catalog').slice(0, 80);
          let catId = catCache.get(catName.toLowerCase());
          if (!catId) {
            const existing = await client.query(`SELECT id FROM product_categories WHERE tenant_id=$1 AND LOWER(name)=LOWER($2) LIMIT 1`, [ctx.tenantId, catName]);
            if (existing.rowCount) catId = existing.rows[0].id;
            else catId = (await client.query(`INSERT INTO product_categories (tenant_id,name) VALUES ($1,$2) RETURNING id`, [ctx.tenantId, catName])).rows[0].id;
            catCache.set(catName.toLowerCase(), catId!);
          }
          if (link.rowCount) {
            const updated = await client.query(`UPDATE products SET name=$3, selling_price=$4, category_id=$5, updated_at=NOW()
              WHERE tenant_id=$1 AND id=$2 RETURNING id`, [ctx.tenantId, link.rows[0].product_id, prodName, sellingPrice, catId]);
            if (updated.rowCount) updatedCount++; else skippedCount++;
          } else {
            const inserted = await client.query(`INSERT INTO products (tenant_id,category_id,sku,name,cost_price,selling_price,track_inventory,is_active)
              VALUES ($1,$2,$3,$4,0,$5,FALSE,TRUE) ON CONFLICT (tenant_id,sku) DO NOTHING RETURNING id`,
              [ctx.tenantId, catId, sku, prodName, sellingPrice]);
            if (!inserted.rowCount) { skippedCount++; continue; }
            await client.query(`INSERT INTO website_catalog_links (tenant_id,data_source_id,external_key,product_id) VALUES ($1,$2,$3,$4)`,
              [ctx.tenantId, sourceId, externalKey, inserted.rows[0].id]);
            importedCount++;
          }
        }
        skippedCount += Math.max(0, analysis.products.length - 150);
      }

      return {
        ...analysis,
        importedCount,
        updatedCount,
        skippedCount,
        sourceSaved: true,
        syncedAt: new Date().toISOString(),
      };
    });
  }

  @Get('website-sources')
  @RequirePermissions('analytics:read')
  async listWebsiteSources(@Query('branchId') branchId: string | undefined, @TenantCtx() ctx: TenantAuthContext) {
    const branch = branchId && branchId !== 'all' ? branchId : null;
    return this.db.withTenant(ctx.tenantId, async (client) => {
      const res = await client.query(
        `SELECT id, name, status, config, last_synced_at
         FROM data_sources
         WHERE tenant_id = $1 AND source_type = 'json_api' AND config ? 'url'
           AND ($2::uuid[] IS NULL OR branch_id = ANY($2::uuid[]))
           AND ($3::uuid IS NULL OR branch_id=$3::uuid)
         ORDER BY last_synced_at DESC NULLS LAST LIMIT 10`,
        [ctx.tenantId, ctx.allowedBranchIds, branch],
      );
      return { sources: res.rows };
    });
  }
}
