import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { DatabaseService } from '../../database/database.service';
import { RequirePermissions, TenantCtx } from '../../common/decorators/auth.decorators';
import { TenantAuthContext } from '../../common/types/auth.types';

function resolveDateRange(daysStr?: string, startDate?: string, endDate?: string) {
  const end = endDate ? new Date(endDate) : new Date();
  const days = Math.min(365, Math.max(7, parseInt(daysStr || '30', 10)));
  const start = startDate ? new Date(startDate) : new Date(end.getTime() - (days - 1) * 86400000);
  const spanDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
  const prevEnd = new Date(start.getTime() - 86400000);
  const prevStart = new Date(prevEnd.getTime() - (spanDays - 1) * 86400000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return {
    startDate: fmt(start),
    endDate: fmt(end),
    prevStartDate: fmt(prevStart),
    prevEndDate: fmt(prevEnd),
    spanDays,
  };
}

function pctChange(curr: number, prev: number): number | null {
  if (prev === 0) return curr > 0 ? 100 : null;
  return Number((((curr - prev) / Math.abs(prev)) * 100).toFixed(1));
}

@ApiTags('Analytics & KPI Engine')
@ApiBearerAuth()
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly db: DatabaseService) {}

  @Get('overview')
  @RequirePermissions('analytics:read')
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
               s.orders,
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
             GROUP BY b.id ORDER BY revenue DESC`,
            [ctx.tenantId, ctx.allowedBranchIds, range.startDate, range.endDate],
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
               AND (s.transaction_date AT TIME ZONE 'Africa/Nairobi')::DATE BETWEEN $3::date AND $4::date
             GROUP BY 1 ORDER BY total DESC`,
            [ctx.tenantId, effectiveBranch, range.startDate, range.endDate],
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
               (SELECT COUNT(*)::int FROM sales WHERE tenant_id = $1) AS total_sales_rows,
               (SELECT COUNT(*)::int FROM expenses WHERE tenant_id = $1) AS total_expense_rows,
               (SELECT COUNT(*)::int FROM products WHERE tenant_id = $1) AS total_product_rows,
               (SELECT COUNT(*)::int FROM customers WHERE tenant_id = $1) AS total_customer_rows,
               (SELECT ROUND(AVG(quality_score), 1) FROM data_import_jobs WHERE tenant_id = $1 AND quality_score IS NOT NULL) AS avg_import_quality`,
            [ctx.tenantId],
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
      const hasExpenseData = Number(q.total_expense_rows) > 0;
      const hasInventoryData = Number(q.total_product_rows) > 0;
      const hasCustomerData = Number(q.total_customer_rows) > 0;

      const revenue = Number(c.rev);
      const prevRevenue = Number(p.rev);
      const expenses = Number(c.exp);
      const prevExpenses = Number(p.exp);
      const grossProfit = Number(c.gross_profit);
      const prevGrossProfit = Number(p.gross_profit);
      const netProfit = Number(c.net_profit);
      const prevNetProfit = Number(p.net_profit);
      const orderVolume = Number(c.orders);
      const prevOrderVolume = Number(p.orders);
      const aov = Number(c.aov);
      const prevAov = Number(p.aov);

      const canViewFinance = ctx.permissions.includes('finance:read') || ctx.permissions.includes('sales:read');

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
          value: grossProfit,
          previousValue: prevGrossProfit,
          changePct: pctChange(grossProfit, prevGrossProfit),
          available: hasSalesData,
          formula: 'SUM(sales.total_amount - sales.cost_of_goods_sold)',
          source: 'sales, sales_items',
        },
        netProfit: {
          value: hasSalesData && hasExpenseData && canViewFinance ? netProfit : null,
          previousValue: hasSalesData && hasExpenseData && canViewFinance ? prevNetProfit : null,
          changePct: hasSalesData && hasExpenseData && canViewFinance ? pctChange(netProfit, prevNetProfit) : null,
          available: hasSalesData && hasExpenseData && canViewFinance,
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
          grossProfit: Number(r.gross_profit),
          orders: Number(r.orders),
        })),
        topProducts: topProdRes.rows.map((r) => ({
          ...r,
          units_sold: Number(r.units_sold),
          revenue: Number(r.revenue),
          gross_profit: Number(r.gross_profit),
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
          grossProfit: Number(r.gross_profit),
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
        inventorySummary: {
          totalSkus: Number(invRes.rows[0].total_skus),
          stockoutCount: Number(invRes.rows[0].stockout_count),
          lowStockCount: Number(invRes.rows[0].low_stock_count),
          totalInventoryValue: Number(invRes.rows[0].total_inventory_value),
        },
        customerSummary: custAcqRes.rows[0],
        dataQuality: {
          coveragePct,
          hasSalesData,
          hasExpenseData,
          hasInventoryData,
          hasCustomerData,
          avgImportQualityScore: q.avg_import_quality ? Number(q.avg_import_quality) : 100,
          counts: {
            sales: Number(q.total_sales_rows),
            expenses: Number(q.total_expense_rows),
            products: Number(q.total_product_rows),
            customers: Number(q.total_customer_rows),
          },
        },
        recommendations: recsRes.rows,
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
        `SELECT * FROM vw_daily_sales_summary
         WHERE tenant_id = $1
           AND ($2::uuid IS NULL OR branch_id = $2::uuid)
           AND ($3::uuid[] IS NULL OR branch_id = ANY($3::uuid[]))
           AND sale_date BETWEEN $4::date AND $5::date
         ORDER BY sale_date DESC`,
        [ctx.tenantId, effectiveBranch, ctx.allowedBranchIds, range.startDate, range.endDate],
      );
      return { period: range, dailySummary: res.rows };
    });
  }

  @Get('products')
  @RequirePermissions('analytics:read')
  async productAnalytics(@TenantCtx() ctx: TenantAuthContext) {
    return this.db.withTenant(ctx.tenantId, async (client) => {
      const [perf, cats] = await Promise.all([
        client.query(`SELECT * FROM vw_product_performance WHERE tenant_id = $1 ORDER BY gross_profit DESC`, [ctx.tenantId]),
        client.query(`SELECT * FROM product_categories WHERE tenant_id = $1 ORDER BY name ASC`, [ctx.tenantId]),
      ]);
      return { products: perf.rows, categories: cats.rows };
    });
  }

  @Get('customers')
  @RequirePermissions('customers:read')
  async customerAnalytics(@TenantCtx() ctx: TenantAuthContext) {
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
        `SELECT * FROM vw_expense_summary WHERE tenant_id = $1 ORDER BY expense_month DESC, total_amount DESC`,
        [ctx.tenantId],
      );
      return { summary: res.rows };
    });
  }

  @Get('inventory')
  @RequirePermissions('inventory:read')
  async inventoryAnalytics(@TenantCtx() ctx: TenantAuthContext) {
    return this.db.withTenant(ctx.tenantId, async (client) => {
      const res = await client.query(
        `SELECT * FROM vw_inventory_status WHERE tenant_id = $1 ORDER BY stock_status ASC, available_quantity ASC`,
        [ctx.tenantId],
      );
      return { inventory: res.rows };
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
        client.query(
          `SELECT id, sku, name, selling_price FROM products WHERE tenant_id = $1 AND (name ILIKE $2 OR sku ILIKE $2) LIMIT 6`,
          [ctx.tenantId, like],
        ),
        ctx.permissions.includes('customers:read')
          ? client.query(
              `SELECT id, full_name, phone_number, email FROM customers WHERE tenant_id = $1 AND (full_name ILIKE $2 OR phone_number ILIKE $2) LIMIT 6`,
              [ctx.tenantId, like],
            )
          : Promise.resolve({ rows: [] }),
        ctx.permissions.includes('sales:read')
          ? client.query(
              `SELECT id, transaction_ref, total_amount, transaction_date FROM sales WHERE tenant_id = $1 AND transaction_ref ILIKE $2 LIMIT 6`,
              [ctx.tenantId, like],
            )
          : Promise.resolve({ rows: [] }),
      ]);
      return { products: products.rows, customers: customers.rows, sales: sales.rows };
    });
  }
}
