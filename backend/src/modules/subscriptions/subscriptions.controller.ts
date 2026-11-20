import { Controller, Get, Post, ServiceUnavailableException } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { DatabaseService } from '../../database/database.service';
import { Public, RequirePermissions, TenantCtx } from '../../common/decorators/auth.decorators';
import { TenantAuthContext } from '../../common/types/auth.types';

// Reference catalog labels must describe what this release actually exposes,
// including on existing databases seeded before those limitations were clear.
// This presentation mapping does not modify subscriptions or feature gates.
const DISPLAY_FEATURES: Record<string, string> = {
  analytics_core: 'Sales, expenses and business analytics',
  manual_imports: 'CSV and Excel imports',
  monthly_reports: 'Exportable business reports',
  inventory_insights: 'Inventory and stock insights',
  weekly_reports: 'Exportable reports (automatic delivery not connected)',
  predict_basic: 'Sales and demand forecasts where data is sufficient',
  predict_advanced: 'Cash-flow estimates, anomalies and segmentation where data is sufficient',
  ai_assistant: 'Business assistant in English and Kiswahili',
  connect_core: 'Business directory and consent records (no outbound delivery)',
};
const REFERENCE_PLAN_DESCRIPTIONS: Record<string, string> = {
  starter: 'Essential business analytics and manual imports.',
  growth: 'Business analytics, manual imports and forecasting.',
  intelligence: 'Business analytics, forecasting and AI assistance.',
  enterprise: 'Multi-branch analytics and role-based team access.',
};

@ApiTags('Subscriptions & Billing')
@ApiBearerAuth()
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly db: DatabaseService) {}

  @Public()
  @Get('plans')
  async publicPlans() {
    const plansRes = await this.db.query(
      `SELECT sp.*,
              COALESCE(
                (SELECT jsonb_agg(jsonb_build_object('code', pf.feature_code, 'label', pf.feature_label) ORDER BY pf.feature_code)
                 FROM plan_features pf WHERE pf.plan_id = sp.id AND pf.is_enabled = TRUE), '[]'::jsonb
              ) AS features,
              COALESCE(
                (SELECT jsonb_object_agg(pl.metric_code, pl.monthly_limit)
                 FROM plan_limits pl WHERE pl.plan_id = sp.id), '{}'::jsonb
              ) AS limits
       FROM subscription_plans sp WHERE sp.is_active = TRUE ORDER BY sp.sort_order ASC`,
    );
    const addonsRes = await this.db.query(`SELECT * FROM add_on_services WHERE is_active = TRUE ORDER BY unit_price_kes ASC`);
    return {
      plans: plansRes.rows.map((plan) => ({
        ...plan,
        description: REFERENCE_PLAN_DESCRIPTIONS[plan.code] || 'Plan information is provided for reference.',
        // Unknown/unsupported catalog features (e.g. live sync, white-label)
        // are not presented as available capabilities.
        features: (Array.isArray(plan.features) ? plan.features : [])
          .filter((f: { code: string }) => Object.prototype.hasOwnProperty.call(DISPLAY_FEATURES, f.code))
          .map((f: { code: string }) => ({ ...f, label: DISPLAY_FEATURES[f.code] })),
      })),
      addOns: addonsRes.rows.map((addon) => ({
        ...addon,
        description: 'Listed for reference only. Online purchases are not available in this release.',
      })),
    };
  }

  @Get()
  @RequirePermissions('billing:read')
  async currentSubscription(@TenantCtx() ctx: TenantAuthContext) {
    return this.db.withTenant(ctx.tenantId, async (client) => {
      const [sub, invoices, activeAddOns, allPlans] = await Promise.all([
        client.query(
          `SELECT s.*, sp.code AS plan_code, sp.name AS plan_name, sp.monthly_price_kes, sp.price_range_label, sp.description
           FROM subscriptions s
           JOIN subscription_plans sp ON sp.id = s.plan_id
           WHERE s.tenant_id = $1 ORDER BY s.created_at DESC LIMIT 1`,
          [ctx.tenantId],
        ),
        client.query(
          `SELECT * FROM subscription_invoices WHERE tenant_id = $1 ORDER BY issued_at DESC LIMIT 12`,
          [ctx.tenantId],
        ),
        client.query(
          `SELECT ta.*, a.code, a.name, a.unit_label, a.unit_price_kes
           FROM tenant_add_ons ta JOIN add_on_services a ON a.id = ta.add_on_id
           WHERE ta.tenant_id = $1 AND ta.status = 'active'`,
          [ctx.tenantId],
        ),
        this.publicPlans(),
      ]);

      return {
        subscription: sub.rows[0]
          ? { ...sub.rows[0], description: REFERENCE_PLAN_DESCRIPTIONS[sub.rows[0].plan_code] || 'Plan information is provided for reference.' }
          : null,
        enabledFeatures: ctx.enabledFeatures,
        invoices: invoices.rows,
        activeAddOns: activeAddOns.rows,
        availablePlans: allPlans.plans,
        availableAddOns: allPlans.addOns,
      };
    });
  }

  @Get('usage')
  @RequirePermissions('billing:read')
  async usage(@TenantCtx() ctx: TenantAuthContext) {
    return this.db.withTenant(ctx.tenantId, async (client) => {
      const [branches, users, imports, aiQueries, messages, limits] = await Promise.all([
        client.query(`SELECT COUNT(*)::int AS cnt FROM branches WHERE tenant_id = $1 AND status = 'active'`, [ctx.tenantId]),
        client.query(`SELECT COUNT(DISTINCT user_id)::int AS cnt FROM user_roles WHERE tenant_id = $1 AND is_active = TRUE`, [ctx.tenantId]),
        client.query(`SELECT COUNT(*)::int AS cnt FROM data_import_jobs WHERE tenant_id = $1 AND created_at >= DATE_TRUNC('month', NOW())`, [ctx.tenantId]),
        client.query(`SELECT COUNT(*)::int AS cnt FROM ai_usage_records WHERE tenant_id = $1 AND recorded_at >= DATE_TRUNC('month', NOW())`, [ctx.tenantId]),
        client.query(`SELECT COUNT(*)::int AS cnt FROM communication_messages WHERE tenant_id = $1 AND created_at >= DATE_TRUNC('month', NOW())`, [ctx.tenantId]),
        client.query(
          `SELECT pl.metric_code, pl.monthly_limit
           FROM subscriptions s JOIN plan_limits pl ON pl.plan_id = s.plan_id
           WHERE s.tenant_id = $1 AND s.status IN ('active','trialing')`,
          [ctx.tenantId],
        ),
      ]);
      const limitMap: Record<string, number> = {};
      limits.rows.forEach((r) => (limitMap[r.metric_code] = Number(r.monthly_limit)));

      return {
        planCode: ctx.planCode,
        metrics: [
          { code: 'max_branches', label: 'Active Branches', used: branches.rows[0].cnt, limit: limitMap.max_branches ?? 1 },
          { code: 'max_users', label: 'Team Users', used: users.rows[0].cnt, limit: limitMap.max_users ?? 3 },
          { code: 'imports_per_month', label: 'Monthly Data Imports', used: imports.rows[0].cnt, limit: limitMap.imports_per_month ?? 15 },
          { code: 'ai_queries_per_month', label: 'BizWave AI Queries', used: aiQueries.rows[0].cnt, limit: limitMap.ai_queries_per_month ?? 0 },
          { code: 'sms_included', label: 'Monthly Messages', used: messages.rows[0].cnt, limit: limitMap.sms_included ?? 0 },
        ],
      };
    });
  }

  // No payment provider or verified payment reconciliation exists in this
  // release. Never fabricate paid invoices or grant paid add-ons on a click.
  @Post()
  @RequirePermissions('billing:manage')
  async changePlan() {
    throw new ServiceUnavailableException('Online plan changes are not available yet. No payment has been taken.');
  }

  @Post('add-ons')
  @RequirePermissions('billing:manage')
  async toggleAddOn() {
    throw new ServiceUnavailableException('Online add-on purchases are not available yet. No payment has been taken.');
  }
}
