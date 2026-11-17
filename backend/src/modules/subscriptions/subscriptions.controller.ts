import { BadRequestException, Body, Controller, Get, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { DatabaseService } from '../../database/database.service';
import { CurrentUser, Public, RequirePermissions, TenantCtx } from '../../common/decorators/auth.decorators';
import { AuthenticatedUser, TenantAuthContext } from '../../common/types/auth.types';

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
    return { plans: plansRes.rows, addOns: addonsRes.rows };
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
        subscription: sub.rows[0] || null,
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

  @Post()
  @RequirePermissions('billing:manage')
  async changePlan(
    @Body() body: { planCode: 'starter' | 'growth' | 'intelligence' | 'enterprise'; billingCycle?: 'monthly' | 'annual' },
    @TenantCtx() ctx: TenantAuthContext,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: any,
  ) {
    const planRes = await this.db.query(`SELECT * FROM subscription_plans WHERE code = $1 AND is_active = TRUE`, [
      body.planCode,
    ]);
    if (planRes.rowCount === 0) throw new BadRequestException('Invalid subscription plan');
    const plan = planRes.rows[0];

    const updated = await this.db.withTenant(ctx.tenantId, async (client) => {
      await client.query(`UPDATE subscriptions SET status = 'cancelled' WHERE tenant_id = $1 AND status IN ('active','trialing')`, [
        ctx.tenantId,
      ]);
      const ins = await client.query(
        `INSERT INTO subscriptions (tenant_id, plan_id, status, billing_cycle)
         VALUES ($1,$2,'active',$3) RETURNING *`,
        [ctx.tenantId, plan.id, body.billingCycle || 'monthly'],
      );
      const amount = Number(plan.monthly_price_kes);
      const tax = Number((amount * 0.16).toFixed(2));
      const invNo = `INV-BW-${Date.now().toString().slice(-6)}`;
      await client.query(
        `INSERT INTO subscription_invoices (tenant_id, subscription_id, invoice_number, amount_kes, tax_kes, total_kes, status, paid_at)
         VALUES ($1,$2,$3,$4,$5,$6,'paid',NOW())`,
        [ctx.tenantId, ins.rows[0].id, invNo, amount, tax, amount + tax],
      );
      return ins.rows[0];
    });

    await this.db.appendAuditLog({
      tenantId: ctx.tenantId,
      actorUserId: user.userId,
      actorEmail: user.email,
      action: 'subscription.plan_changed',
      resourceType: 'subscription',
      resourceId: updated.id,
      ipAddress: req.ip,
      changes: { fromPlan: ctx.planCode, toPlan: body.planCode },
    });

    return { subscription: updated, newPlanCode: body.planCode };
  }

  @Post('add-ons')
  @RequirePermissions('billing:manage')
  async toggleAddOn(
    @Body() body: { addOnCode: string; quantity?: number },
    @TenantCtx() ctx: TenantAuthContext,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const aRes = await this.db.query(`SELECT * FROM add_on_services WHERE code = $1`, [body.addOnCode]);
    if (aRes.rowCount === 0) throw new BadRequestException('Unknown add-on code');
    return this.db.withTenant(ctx.tenantId, async (client) => {
      const ins = await client.query(
        `INSERT INTO tenant_add_ons (tenant_id, add_on_id, quantity, status)
         VALUES ($1,$2,$3,'active')
         ON CONFLICT (tenant_id, add_on_id) DO UPDATE SET quantity = EXCLUDED.quantity, status = 'active'
         RETURNING *`,
        [ctx.tenantId, aRes.rows[0].id, Math.max(1, body.quantity || 1)],
      );
      await this.db.appendAuditLog({
        tenantId: ctx.tenantId,
        actorUserId: user.userId,
        actorEmail: user.email,
        action: 'subscription.addon_activated',
        resourceType: 'tenant_add_on',
        resourceId: ins.rows[0].id,
        changes: { addOnCode: body.addOnCode, quantity: body.quantity || 1 },
      });
      return { addOn: ins.rows[0] };
    });
  }
}
