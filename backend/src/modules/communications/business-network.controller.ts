import { BadRequestException, Body, Controller, Get, Put, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { CurrentUser, RequirePermissions, TenantCtx } from '../../common/decorators/auth.decorators';
import { AuthenticatedUser, TenantAuthContext } from '../../common/types/auth.types';
import { DatabaseService } from '../../database/database.service';

const ProfileSchema = z.object({
  displayName: z.string().trim().min(2).max(160),
  sector: z.string().trim().max(100),
  county: z.string().trim().max(100),
  description: z.string().trim().max(600),
  contactEmail: z.union([z.literal(''), z.string().trim().email().max(255)]),
  website: z.string().trim().max(500),
  isPublished: z.boolean(),
}).superRefine((data, ctx) => {
  if (data.isPublished && (!data.sector || !data.county)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Add a sector and county before publishing.' });
  }
  if (data.website) {
    try {
      const url = new URL(data.website);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error();
    } catch {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['website'], message: 'Use a valid http or https website address.' });
    }
  }
});

@ApiTags('Business network')
@ApiBearerAuth()
@Controller('business-network')
export class BusinessNetworkController {
  constructor(private readonly db: DatabaseService) {}

  // This directory is opt-in, authenticated, and intentionally limited to
  // public profile fields. It never queries another tenant's business records.
  @Get('businesses')
  @RequirePermissions('connect:read')
  async businesses(@Query('q') query: string | undefined, @Query('county') county: string | undefined, @TenantCtx() ctx: TenantAuthContext) {
    const q = String(query || '').trim().slice(0, 100);
    const place = String(county || '').trim().slice(0, 100);
    const result = await this.db.withTenant(ctx.tenantId, (client) => client.query(
      `SELECT id, display_name, sector, county, description, contact_email, website,
              COUNT(*) OVER()::int AS match_count
       FROM business_directory_profiles
       WHERE is_published = TRUE AND tenant_id <> $1
         AND ($2 = '' OR position(lower($2) in lower(concat_ws(' ', display_name, sector, description))) > 0)
         AND ($3 = '' OR position(lower($3) in lower(county)) > 0)
       ORDER BY lower(display_name), id LIMIT 50`,
      [ctx.tenantId, q, place],
    ));
    return { businesses: result.rows.map(({ match_count: _count, ...profile }) => profile), total: result.rows[0]?.match_count || 0, limit: 50 };
  }

  @Get('profile')
  @RequirePermissions('org:read')
  async profile(@TenantCtx() ctx: TenantAuthContext) {
    const result = await this.db.withTenant(ctx.tenantId, (client) => client.query(
      `SELECT display_name, sector, county, description, contact_email, website, is_published
       FROM business_directory_profiles WHERE tenant_id = $1`, [ctx.tenantId],
    ));
    return { profile: result.rows[0] || null };
  }

  @Put('profile')
  @RequirePermissions('org:manage')
  async saveProfile(@Body() body: unknown, @TenantCtx() ctx: TenantAuthContext, @CurrentUser() user: AuthenticatedUser, @Req() req: any) {
    const parsed = ProfileSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ message: parsed.error.issues[0]?.message || 'Please check the business profile.' });
    }
    const d = parsed.data;
    const result = await this.db.withTenant(ctx.tenantId, (client) => client.query(
      `INSERT INTO business_directory_profiles
       (tenant_id, display_name, sector, county, description, contact_email, website, is_published)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (tenant_id) DO UPDATE SET
         display_name=EXCLUDED.display_name, sector=EXCLUDED.sector, county=EXCLUDED.county,
         description=EXCLUDED.description, contact_email=EXCLUDED.contact_email,
         website=EXCLUDED.website, is_published=EXCLUDED.is_published, updated_at=NOW()
       RETURNING display_name, sector, county, description, contact_email, website, is_published`,
      [ctx.tenantId, d.displayName, d.sector, d.county, d.description, d.contactEmail || null, d.website || null, d.isPublished],
    ));
    await this.db.appendAuditLog({ tenantId: ctx.tenantId, actorUserId: user.userId, actorEmail: user.email,
      action: d.isPublished ? 'business_network.profile_published' : 'business_network.profile_unpublished',
      resourceType: 'business_directory_profile', ipAddress: req.ip, changes: { isPublished: d.isPublished } });
    return { profile: result.rows[0] };
  }
}
