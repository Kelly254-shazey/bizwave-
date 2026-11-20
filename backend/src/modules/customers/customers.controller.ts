import { BadRequestException, Body, Controller, ForbiddenException, Get, Param, Patch, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { DatabaseService } from '../../database/database.service';
import { CurrentUser, RequirePermissions, TenantCtx } from '../../common/decorators/auth.decorators';
import { AuthenticatedUser, TenantAuthContext } from '../../common/types/auth.types';

const CreateCustomerSchema = z.object({
  fullName: z.string().min(2).max(180),
  phoneNumber: z.string().min(7).max(32).optional(),
  email: z.string().email().optional().or(z.literal('')),
  preferredLanguage: z.enum(['en', 'sw']).default('en'),
  preferredChannel: z.enum(['sms', 'whatsapp', 'voice', 'ussd', 'email']).default('sms'),
  marketingOptIn: z.boolean().default(false),
  branchId: z.string().uuid().optional(),
});

@ApiTags('Customers and consent records')
@ApiBearerAuth()
@Controller('customers')
export class CustomersController {
  constructor(private readonly db: DatabaseService) {}

  @Get()
  @RequirePermissions('customers:read')
  async list(@TenantCtx() ctx: TenantAuthContext) {
    return this.db.withTenant(ctx.tenantId, async (client) => {
      const res = await client.query(
        `SELECT c.tenant_id, c.id AS customer_id, c.full_name, c.phone_number, c.email, c.preferred_channel,
                c.marketing_opt_in, c.preferred_language, c.status,
                CASE WHEN $3::boolean THEN COALESCE(p.total_orders, 0) END AS total_orders,
                CASE WHEN $3::boolean THEN COALESCE(p.lifetime_value, 0) END AS lifetime_value,
                CASE WHEN $3::boolean THEN p.last_purchase_at END AS last_purchase_at,
                CASE WHEN $3::boolean THEN EXTRACT(DAY FROM (NOW() - p.last_purchase_at))::integer END AS days_since_last_purchase,
                COALESCE((SELECT jsonb_agg(jsonb_build_object('channel', cc.channel, 'purpose', cc.purpose, 'status', cc.status))
                          FROM customer_consents cc WHERE cc.tenant_id=c.tenant_id AND cc.customer_id=c.id), '[]'::jsonb) AS consents
         FROM customers c
         LEFT JOIN LATERAL (SELECT COUNT(*)::bigint AS total_orders, SUM(s.total_amount)::numeric(14,2) AS lifetime_value,
                            MAX(s.transaction_date) AS last_purchase_at FROM sales s
                            WHERE s.tenant_id=c.tenant_id AND s.customer_id=c.id AND s.payment_status NOT IN ('reversed','refunded')
                              AND ($2::uuid[] IS NULL OR s.branch_id = ANY($2::uuid[]))) p ON TRUE
         WHERE c.tenant_id=$1 AND ($2::uuid[] IS NULL OR c.branch_id = ANY($2::uuid[]))
         ORDER BY c.full_name`,
        [ctx.tenantId, ctx.allowedBranchIds, ctx.permissions.includes('sales:read')],
      );
      return { customers: res.rows };
    });
  }

  @Post()
  @RequirePermissions('customers:write')
  async create(
    @Body() body: unknown,
    @TenantCtx() ctx: TenantAuthContext,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: any,
  ) {
    const parsed = CreateCustomerSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ message: 'Invalid customer data', errors: parsed.error.flatten() });
    }
    const d = parsed.data;
    let branchId = d.branchId || null;
    if (ctx.allowedBranchIds !== null) {
      if (branchId && !ctx.allowedBranchIds.includes(branchId)) throw new ForbiddenException('Branch access denied.');
      if (!branchId && ctx.allowedBranchIds.length === 1) branchId = ctx.allowedBranchIds[0];
      if (!branchId) throw new BadRequestException('Choose an assigned branch for this customer.');
    }
    const customer = await this.db.withTenant(ctx.tenantId, async (client) => {
      const ins = await client.query(
        `INSERT INTO customers (tenant_id, branch_id, full_name, phone_number, email, preferred_language, preferred_channel, marketing_opt_in)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [ctx.tenantId, branchId, d.fullName, d.phoneNumber || null, d.email || null, d.preferredLanguage, d.preferredChannel, d.marketingOptIn],
      );
      const cust = ins.rows[0];
      await client.query(
        `INSERT INTO customer_consents (tenant_id, customer_id, channel, purpose, status, source)
         VALUES ($1, $2, $3, 'marketing', $4, 'portal_entry'),
                ($1, $2, $3, 'transactional', 'granted', 'portal_entry')`,
        [ctx.tenantId, cust.id, d.preferredChannel, d.marketingOptIn ? 'granted' : 'revoked'],
      );
      return cust;
    });

    await this.db.appendAuditLog({
      tenantId: ctx.tenantId,
      actorUserId: user.userId,
      actorEmail: user.email,
      action: 'customer.created',
      resourceType: 'customer',
      resourceId: customer.id,
      ipAddress: req.ip,
      changes: { marketingOptIn: d.marketingOptIn },
    });

    return { customer };
  }

  @Patch(':id/consents')
  @RequirePermissions('customers:write')
  async updateConsent(
    @Param('id') id: string,
    @Body() body: { channel: 'sms' | 'whatsapp' | 'voice' | 'ussd' | 'email'; purpose: 'marketing' | 'transactional' | 'service_alerts'; status: 'granted' | 'revoked' },
    @TenantCtx() ctx: TenantAuthContext,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: any,
  ) {
    if (!['sms', 'whatsapp', 'voice', 'ussd', 'email'].includes(body?.channel)) {
      throw new BadRequestException('Invalid consent channel.');
    }
    if (!['marketing', 'transactional', 'service_alerts'].includes(body?.purpose)) {
      throw new BadRequestException('Invalid consent purpose.');
    }
    if (!['granted', 'revoked'].includes(body?.status)) {
      throw new BadRequestException('Invalid consent status.');
    }

    const res = await this.db.withTenant(ctx.tenantId, async (client) => {
      const allowed = await client.query(`SELECT id FROM customers WHERE tenant_id=$1 AND id=$2 AND ($3::uuid[] IS NULL OR branch_id=ANY($3::uuid[]))`, [ctx.tenantId, id, ctx.allowedBranchIds]);
      if (!allowed.rowCount) throw new BadRequestException('Customer not found.');
      const up = await client.query(
        `INSERT INTO customer_consents (tenant_id, customer_id, channel, purpose, status, source, revoked_at)
         VALUES ($1,$2,$3,$4,$5::varchar,'portal_consent_manager', CASE WHEN $5::varchar = 'revoked' THEN NOW() ELSE NULL END)
         ON CONFLICT (tenant_id, customer_id, channel, purpose)
         DO UPDATE SET status = EXCLUDED.status, recorded_at = NOW(), revoked_at = EXCLUDED.revoked_at
         RETURNING *`,
        [ctx.tenantId, id, body.channel, body.purpose, body.status],
      );
      if (body.purpose === 'marketing') {
        await client.query(
          `UPDATE customers SET marketing_opt_in = $3 WHERE tenant_id = $1 AND id = $2`,
          [ctx.tenantId, id, body.status === 'granted'],
        );
      }
      return up.rows[0];
    });

    await this.db.appendAuditLog({
      tenantId: ctx.tenantId,
      actorUserId: user.userId,
      actorEmail: user.email,
      action: 'customer.consent_updated',
      resourceType: 'customer_consent',
      resourceId: id,
      ipAddress: req.ip,
      changes: body,
    });

    return { consent: res };
  }

  /**
   * Kenya Data Protection Act, 2019 — Data Subject Access Export
   */
  @Get(':id/dpa-export')
  @RequirePermissions('customers:read')
  async dpaExport(
    @Param('id') id: string,
    @TenantCtx() ctx: TenantAuthContext,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    // A complete data-subject export includes all branches and transaction history.
    if (ctx.allowedBranchIds !== null || !ctx.permissions.includes('sales:read')) throw new ForbiddenException('A complete customer export requires whole-business customer and sales access.');
    return this.db.withTenant(ctx.tenantId, async (client) => {
      const [cust, consents, interactions, sales] = await Promise.all([
        client.query(`SELECT id, full_name, email, phone_number, preferred_language, preferred_channel, created_at FROM customers WHERE tenant_id = $1 AND id = $2`, [ctx.tenantId, id]),
        client.query(`SELECT channel, purpose, status, legal_basis, recorded_at, revoked_at FROM customer_consents WHERE tenant_id = $1 AND customer_id = $2`, [ctx.tenantId, id]),
        client.query(`SELECT channel, direction, summary, occurred_at FROM customer_interactions WHERE tenant_id = $1 AND customer_id = $2`, [ctx.tenantId, id]),
        client.query(`SELECT transaction_ref, transaction_date, total_amount, currency_code FROM sales WHERE tenant_id = $1 AND customer_id = $2 ORDER BY transaction_date DESC`, [ctx.tenantId, id]),
      ]);
      if (cust.rowCount === 0) throw new BadRequestException('Customer not found');
      await client.query(
        `INSERT INTO export_jobs (tenant_id, requested_by, export_scope, status, record_count) VALUES ($1,$2,'dpa_subject_access','completed',$3)`,
        [ctx.tenantId, user.userId, 1 + consents.rows.length + sales.rows.length],
      );
      return {
        legalFramework: 'Kenya Data Protection Act, 2019 — Right of Access',
        exportedAt: new Date().toISOString(),
        customer: cust.rows[0],
        consents: consents.rows,
        interactions: interactions.rows,
        transactions: sales.rows,
      };
    });
  }

  /**
   * Kenya DPA 2019 Deletion Request (anonymizes PII while preserving legally required financial tax records)
   */
  @Post(':id/deletion-request')
  @RequirePermissions('customers:write')
  async requestDeletion(
    @Param('id') id: string,
    @Body() body: { reason: string },
    @TenantCtx() ctx: TenantAuthContext,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.db.withTenant(ctx.tenantId, async (client) => {
      const allowed = await client.query(`SELECT id FROM customers WHERE tenant_id=$1 AND id=$2 AND ($3::uuid[] IS NULL OR branch_id=ANY($3::uuid[]))`, [ctx.tenantId, id, ctx.allowedBranchIds]);
      if (!allowed.rowCount) throw new BadRequestException('Customer not found.');
      const ins = await client.query(
        `INSERT INTO deletion_requests (tenant_id, subject_type, subject_id, reason, legal_retention_note, status, requested_by)
         VALUES ($1, 'customer', $2, $3, 'Financial transaction totals retained in anonymized form for 7 years per Kenya Tax Procedures Act.', 'pending_review', $4)
         RETURNING *`,
        [ctx.tenantId, id, body?.reason || 'Data subject erasure request', user.userId],
      );
      return { deletionRequest: ins.rows[0] };
    });
  }
}
