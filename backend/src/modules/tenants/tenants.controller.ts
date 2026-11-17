import { BadRequestException, Controller, Get, Param, Patch, Post, Body, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { DatabaseService } from '../../database/database.service';
import {
  CurrentUser,
  Public,
  RequirePermissions,
  SkipTenant,
  TenantCtx,
} from '../../common/decorators/auth.decorators';
import { AuthenticatedUser, TenantAuthContext } from '../../common/types/auth.types';

const UpdateOrgSchema = z.object({
  displayName: z.string().min(2).max(160).optional(),
  industryCode: z
    .enum(['retail', 'restaurant', 'wholesale', 'salon', 'professional_services', 'general_sme'])
    .optional(),
  businessSize: z.enum(['micro', 'small', 'medium', 'enterprise']).optional(),
  currencyCode: z.string().length(3).optional(),
  timezone: z.string().min(3).max(64).optional(),
  preferredLanguage: z.enum(['en', 'sw']).optional(),
  brandColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  logoUrl: z.string().max(500).nullable().optional(),
  phoneNumber: z.string().max(32).nullable().optional(),
  onboardingStep: z.number().int().min(1).max(11).optional(),
  onboardingCompleted: z.boolean().optional(),
  enabledKpis: z.array(z.string()).optional(),
  dashboardLayout: z.array(z.string()).optional(),
  notificationPreferences: z.record(z.any()).optional(),
  reportingPreferences: z.record(z.any()).optional(),
});

@ApiTags('Organizations')
@ApiBearerAuth()
@Controller('organizations')
export class TenantsController {
  constructor(private readonly db: DatabaseService) {}

  @Public()
  @Get('industry-templates')
  async getIndustryTemplates() {
    const res = await this.db.query(`SELECT * FROM business_industries ORDER BY code ASC`);
    return { templates: res.rows };
  }

  @SkipTenant()
  @Get()
  async listUserOrganizations(@CurrentUser() user: AuthenticatedUser) {
    const res = await this.db.query(
      `SELECT t.*, ARRAY_AGG(DISTINCT r.code) AS roles
       FROM user_roles ur
       JOIN roles r ON r.id = ur.role_id
       JOIN tenants t ON t.id = ur.tenant_id
       WHERE ur.user_id = $1 AND ur.is_active = TRUE
       GROUP BY t.id
       ORDER BY t.created_at ASC`,
      [user.userId],
    );
    return { organizations: res.rows };
  }

  @Get('current')
  @RequirePermissions('org:read')
  async getCurrentOrg(@TenantCtx() ctx: TenantAuthContext) {
    return this.db.withTenant(ctx.tenantId, async (client) => {
      const [orgRes, settingsRes, tplRes, branchesRes] = await Promise.all([
        client.query(`SELECT * FROM tenants WHERE id = $1`, [ctx.tenantId]),
        client.query(`SELECT * FROM tenant_settings WHERE tenant_id = $1`, [ctx.tenantId]),
        client.query(`SELECT * FROM business_industries WHERE code = $1`, [ctx.industryCode]),
        client.query(`SELECT * FROM branches WHERE tenant_id = $1 AND status = 'active' ORDER BY is_headquarters DESC, name ASC`, [
          ctx.tenantId,
        ]),
      ]);
      const branches =
        ctx.allowedBranchIds === null
          ? branchesRes.rows
          : branchesRes.rows.filter((b) => ctx.allowedBranchIds!.includes(b.id));
      return {
        organization: orgRes.rows[0],
        settings: settingsRes.rows[0] || {},
        industryTemplate: tplRes.rows[0] || null,
        branches,
        context: ctx,
      };
    });
  }

  @Get(':id')
  @RequirePermissions('org:read')
  async getById(@Param('id') id: string, @TenantCtx() ctx: TenantAuthContext) {
    if (id !== ctx.tenantId) {
      throw new BadRequestException('Requested organization does not match active authorized tenant context.');
    }
    return this.getCurrentOrg(ctx);
  }

  @Patch(':id')
  @RequirePermissions('org:manage')
  async updateOrg(
    @Param('id') id: string,
    @Body() body: unknown,
    @TenantCtx() ctx: TenantAuthContext,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: any,
  ) {
    if (id !== ctx.tenantId) {
      throw new BadRequestException('Cannot update an organization outside your active authorized context.');
    }
    const parsed = UpdateOrgSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ message: 'Invalid organization settings', errors: parsed.error.flatten() });
    }
    const d = parsed.data;

    const updated = await this.db.withTenant(ctx.tenantId, async (client) => {
      const res = await client.query(
        `UPDATE tenants SET
           display_name = COALESCE($2, display_name),
           industry_code = COALESCE($3, industry_code),
           business_size = COALESCE($4, business_size),
           currency_code = COALESCE($5, currency_code),
           timezone = COALESCE($6, timezone),
           preferred_language = COALESCE($7, preferred_language),
           brand_color = COALESCE($8, brand_color),
           logo_url = CASE WHEN $9::boolean THEN $10 ELSE logo_url END,
           phone_number = COALESCE($11, phone_number),
           onboarding_step = COALESCE($12, onboarding_step),
           onboarding_completed = COALESCE($13, onboarding_completed)
         WHERE id = $1 RETURNING *`,
        [
          ctx.tenantId,
          d.displayName ?? null,
          d.industryCode ?? null,
          d.businessSize ?? null,
          d.currencyCode ?? null,
          d.timezone ?? null,
          d.preferredLanguage ?? null,
          d.brandColor ?? null,
          d.logoUrl !== undefined,
          d.logoUrl ?? null,
          d.phoneNumber ?? null,
          d.onboardingStep ?? null,
          d.onboardingCompleted ?? null,
        ],
      );

      if (d.enabledKpis || d.dashboardLayout || d.notificationPreferences || d.reportingPreferences) {
        await client.query(
          `INSERT INTO tenant_settings (tenant_id) VALUES ($1) ON CONFLICT (tenant_id) DO NOTHING`,
          [ctx.tenantId],
        );
        await client.query(
          `UPDATE tenant_settings SET
             enabled_kpis = COALESCE($2::jsonb, enabled_kpis),
             dashboard_layout = COALESCE($3::jsonb, dashboard_layout),
             notification_preferences = COALESCE($4::jsonb, notification_preferences),
             reporting_preferences = COALESCE($5::jsonb, reporting_preferences)
           WHERE tenant_id = $1`,
          [
            ctx.tenantId,
            d.enabledKpis ? JSON.stringify(d.enabledKpis) : null,
            d.dashboardLayout ? JSON.stringify(d.dashboardLayout) : null,
            d.notificationPreferences ? JSON.stringify(d.notificationPreferences) : null,
            d.reportingPreferences ? JSON.stringify(d.reportingPreferences) : null,
          ],
        );
      }

      return res.rows[0];
    });

    await this.db.appendAuditLog({
      tenantId: ctx.tenantId,
      actorUserId: user.userId,
      actorEmail: user.email,
      action: 'organization.updated',
      resourceType: 'tenant',
      resourceId: ctx.tenantId,
      ipAddress: req.ip,
      changes: d,
    });

    return { organization: updated };
  }
}
