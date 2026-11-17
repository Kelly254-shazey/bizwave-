import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Param, Patch, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { DatabaseService } from '../../database/database.service';
import { CurrentUser, RequirePermissions, TenantCtx } from '../../common/decorators/auth.decorators';
import { AuthenticatedUser, TenantAuthContext } from '../../common/types/auth.types';

const BranchSchema = z.object({
  code: z.string().min(2).max(32),
  name: z.string().min(2).max(160),
  city: z.string().default('Nairobi'),
  county: z.string().default('Nairobi'),
  address: z.string().optional(),
  phoneNumber: z.string().optional(),
});

@ApiTags('Branches')
@ApiBearerAuth()
@Controller('branches')
export class BranchesController {
  constructor(private readonly db: DatabaseService) {}

  @Get()
  @RequirePermissions('branches:read')
  async list(@TenantCtx() ctx: TenantAuthContext) {
    return this.db.withTenant(ctx.tenantId, async (client) => {
      const res = await client.query(
        `SELECT * FROM branches WHERE tenant_id = $1 AND status <> 'closed' ORDER BY is_headquarters DESC, name ASC`,
        [ctx.tenantId],
      );
      const branches =
        ctx.allowedBranchIds === null
          ? res.rows
          : res.rows.filter((b) => ctx.allowedBranchIds!.includes(b.id));
      return { branches };
    });
  }

  @Post()
  @RequirePermissions('branches:manage')
  async create(
    @Body() body: unknown,
    @TenantCtx() ctx: TenantAuthContext,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: any,
  ) {
    const parsed = BranchSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ message: 'Invalid branch details', errors: parsed.error.flatten() });
    }
    const d = parsed.data;

    const branch = await this.db.withTenant(ctx.tenantId, async (client) => {
      // Enforce subscription branch limit on backend!
      const countRes = await client.query(
        `SELECT COUNT(*)::int AS cnt FROM branches WHERE tenant_id = $1 AND status = 'active'`,
        [ctx.tenantId],
      );
      const limitRes = await client.query(
        `SELECT pl.monthly_limit FROM subscriptions s
         JOIN plan_limits pl ON pl.plan_id = s.plan_id
         WHERE s.tenant_id = $1 AND s.status IN ('active','trialing') AND pl.metric_code = 'max_branches'
         LIMIT 1`,
        [ctx.tenantId],
      );
      const maxBranches = limitRes.rows[0]?.monthly_limit ?? 1;
      if (countRes.rows[0].cnt >= maxBranches) {
        throw new ForbiddenException(
          `Branch limit reached (${maxBranches}) for your ${ctx.planCode.toUpperCase()} plan. Upgrade or add an Additional Branch Seat in Billing.`,
        );
      }

      const ins = await client.query(
        `INSERT INTO branches (tenant_id, code, name, city, county, address, phone_number)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [ctx.tenantId, d.code.toUpperCase(), d.name, d.city, d.county, d.address || null, d.phoneNumber || null],
      );
      return ins.rows[0];
    });

    await this.db.appendAuditLog({
      tenantId: ctx.tenantId,
      actorUserId: user.userId,
      actorEmail: user.email,
      action: 'branch.created',
      resourceType: 'branch',
      resourceId: branch.id,
      ipAddress: req.ip,
      changes: d,
    });

    return { branch };
  }

  @Patch(':id')
  @RequirePermissions('branches:manage')
  async update(
    @Param('id') id: string,
    @Body() body: Partial<z.infer<typeof BranchSchema>>,
    @TenantCtx() ctx: TenantAuthContext,
  ) {
    return this.db.withTenant(ctx.tenantId, async (client) => {
      const res = await client.query(
        `UPDATE branches SET
           name = COALESCE($3, name),
           city = COALESCE($4, city),
           county = COALESCE($5, county),
           address = COALESCE($6, address),
           phone_number = COALESCE($7, phone_number)
         WHERE tenant_id = $1 AND id = $2 RETURNING *`,
        [ctx.tenantId, id, body.name ?? null, body.city ?? null, body.county ?? null, body.address ?? null, body.phoneNumber ?? null],
      );
      if (res.rowCount === 0) throw new BadRequestException('Branch not found');
      return { branch: res.rows[0] };
    });
  }

  @Delete(':id')
  @RequirePermissions('branches:manage')
  async archive(
    @Param('id') id: string,
    @TenantCtx() ctx: TenantAuthContext,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.db.withTenant(ctx.tenantId, async (client) => {
      const check = await client.query(
        `SELECT is_headquarters FROM branches WHERE tenant_id = $1 AND id = $2`,
        [ctx.tenantId, id],
      );
      if (check.rowCount === 0) throw new BadRequestException('Branch not found');
      if (check.rows[0].is_headquarters) {
        throw new BadRequestException('Cannot archive the headquarters branch.');
      }
      await client.query(`UPDATE branches SET status = 'closed' WHERE tenant_id = $1 AND id = $2`, [
        ctx.tenantId,
        id,
      ]);
    });
    await this.db.appendAuditLog({
      tenantId: ctx.tenantId,
      actorUserId: user.userId,
      actorEmail: user.email,
      action: 'branch.archived',
      resourceType: 'branch',
      resourceId: id,
    });
    return { archived: true };
  }
}
