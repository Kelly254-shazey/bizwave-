import { BadRequestException, Body, Controller, ForbiddenException, Get, Param, Patch, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import * as crypto from 'crypto';
import { z } from 'zod';
import { DatabaseService } from '../../database/database.service';
import { hashPassword } from '../../database/crypto.util';
import { CurrentUser, RequirePermissions, TenantCtx } from '../../common/decorators/auth.decorators';
import { AuthenticatedUser, TenantAuthContext } from '../../common/types/auth.types';

const InviteUserSchema = z.object({
  email: z.string().email(),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  roleCode: z.string().min(2),
  branchIds: z.array(z.string().uuid()).optional(),
  temporaryPassword: z.string().min(12).optional(),
});

@ApiTags('Team & Roles')
@ApiBearerAuth()
@Controller('admin')
export class UsersRolesController {
  constructor(private readonly db: DatabaseService) {}

  @Get('users')
  @RequirePermissions('users:read')
  async listUsers(@TenantCtx() ctx: TenantAuthContext) {
    const res = await this.db.query(
      `SELECT u.id, u.email, u.first_name, u.last_name, u.phone_number, u.status, u.mfa_enabled, u.last_login_at,
              up.job_title,
              ARRAY_AGG(DISTINCT r.code) AS role_codes,
              ARRAY_AGG(DISTINCT r.name) AS role_names,
              COALESCE(
                (SELECT ARRAY_AGG(b.name) FROM user_branch_assignments uba
                 JOIN branches b ON b.tenant_id = uba.tenant_id AND b.id = uba.branch_id
                 WHERE uba.tenant_id = $1 AND uba.user_id = u.id), '{}'
              ) AS assigned_branches
       FROM user_roles ur
       JOIN users u ON u.id = ur.user_id
       JOIN roles r ON r.id = ur.role_id
       LEFT JOIN user_profiles up ON up.user_id = u.id
       WHERE ur.tenant_id = $1 AND ur.is_active = TRUE
       GROUP BY u.id, up.job_title
       ORDER BY u.created_at ASC`,
      [ctx.tenantId],
    );
    return { users: res.rows };
  }

  @Get('roles')
  @RequirePermissions('users:read')
  async listRoles() {
    const res = await this.db.query(
      `SELECT r.id, r.code, r.name, r.scope, r.description,
              COALESCE(ARRAY_AGG(p.code ORDER BY p.code) FILTER (WHERE p.code IS NOT NULL), '{}') AS permissions
       FROM roles r
       LEFT JOIN role_permissions rp ON rp.role_id = r.id
       LEFT JOIN permissions p ON p.id = rp.permission_id
       WHERE r.tenant_id IS NULL
       GROUP BY r.id
       ORDER BY r.scope DESC, r.name ASC`,
    );
    return { roles: res.rows };
  }

  @Post('users/invite')
  @RequirePermissions('users:manage')
  async inviteUser(
    @Body() body: unknown,
    @TenantCtx() ctx: TenantAuthContext,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: any,
  ) {
    const parsed = InviteUserSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ message: 'Invalid user invite details', errors: parsed.error.flatten() });
    }
    const d = parsed.data;
    const roleRes = await this.db.query(
      `SELECT id, scope FROM roles WHERE code = $1 AND tenant_id IS NULL LIMIT 1`,
      [d.roleCode],
    );
    if (roleRes.rowCount === 0) throw new BadRequestException('Unknown role code');
    if (roleRes.rows[0].scope === 'platform' && !actor.isPlatformAdmin) {
      throw new ForbiddenException('Business administrators cannot assign platform-level roles.');
    }

    const email = d.email.trim().toLowerCase();
    const generatedTempPassword = d.temporaryPassword || `Bw!${crypto.randomBytes(12).toString('base64url')}`;
    let createdNewUser = false;
    const result = await this.db.withSystemTransaction(async (client) => {
      let userId: string;
      const existing = await client.query(`SELECT id FROM users WHERE LOWER(email) = $1`, [email]);
      if (existing.rowCount && existing.rowCount > 0) {
        userId = existing.rows[0].id;
      } else {
        createdNewUser = true;
        const hash = await hashPassword(generatedTempPassword);
        const ins = await client.query(
          `INSERT INTO users (email, password_hash, first_name, last_name, status, email_verified)
           VALUES ($1, $2, $3, $4, 'active', TRUE) RETURNING id`,
          [email, hash, d.firstName, d.lastName],
        );
        userId = ins.rows[0].id;
        await client.query(`INSERT INTO user_profiles (user_id, job_title) VALUES ($1, $2)`, [
          userId,
          d.roleCode.replace(/_/g, ' '),
        ]);
      }

      await client.query(
        `INSERT INTO user_roles (tenant_id, user_id, role_id, delegated_by, is_active)
         VALUES ($1, $2, $3, $4, TRUE)
         ON CONFLICT (tenant_id, user_id, role_id) DO UPDATE SET is_active = TRUE`,
        [ctx.tenantId, userId, roleRes.rows[0].id, actor.userId],
      );

      if (d.branchIds && d.branchIds.length > 0) {
        for (const bid of d.branchIds) {
          await client.query(
            `INSERT INTO user_branch_assignments (tenant_id, user_id, branch_id, access_level)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (tenant_id, user_id, branch_id) DO NOTHING`,
            [ctx.tenantId, userId, bid, d.roleCode === 'branch_manager' ? 'manager' : 'member'],
          );
        }
      }
      return {
        userId,
        email,
        roleCode: d.roleCode,
        ...(createdNewUser ? { temporaryPassword: generatedTempPassword } : {}),
      };
    });

    await this.db.appendAuditLog({
      tenantId: ctx.tenantId,
      actorUserId: actor.userId,
      actorEmail: actor.email,
      action: 'user.invited',
      resourceType: 'user',
      resourceId: result.userId,
      ipAddress: req.ip,
      changes: { email, roleCode: d.roleCode, branchIds: d.branchIds || [] },
    });

    return { invited: result };
  }

  @Patch('users/:userId/role')
  @RequirePermissions('users:manage')
  async updateRole(
    @Param('userId') userId: string,
    @Body() body: { roleCode: string; branchIds?: string[] },
    @TenantCtx() ctx: TenantAuthContext,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: any,
  ) {
    const roleRes = await this.db.query(
      `SELECT id, scope FROM roles WHERE code = $1 AND tenant_id IS NULL LIMIT 1`,
      [body.roleCode],
    );
    if (roleRes.rowCount === 0) throw new BadRequestException('Unknown role code');
    if (roleRes.rows[0].scope === 'platform' && !actor.isPlatformAdmin) {
      throw new ForbiddenException('Cannot elevate user to platform role.');
    }

    await this.db.withSystemTransaction(async (client) => {
      await client.query(`DELETE FROM user_roles WHERE tenant_id = $1 AND user_id = $2`, [
        ctx.tenantId,
        userId,
      ]);
      await client.query(
        `INSERT INTO user_roles (tenant_id, user_id, role_id, delegated_by) VALUES ($1, $2, $3, $4)`,
        [ctx.tenantId, userId, roleRes.rows[0].id, actor.userId],
      );
      if (body.branchIds) {
        await client.query(`DELETE FROM user_branch_assignments WHERE tenant_id = $1 AND user_id = $2`, [
          ctx.tenantId,
          userId,
        ]);
        for (const bid of body.branchIds) {
          await client.query(
            `INSERT INTO user_branch_assignments (tenant_id, user_id, branch_id, access_level)
             VALUES ($1, $2, $3, 'manager')`,
            [ctx.tenantId, userId, bid],
          );
        }
      }
    });

    await this.db.appendAuditLog({
      tenantId: ctx.tenantId,
      actorUserId: actor.userId,
      actorEmail: actor.email,
      action: 'user.role_changed',
      resourceType: 'user',
      resourceId: userId,
      ipAddress: req.ip,
      changes: body,
    });

    return { updated: true };
  }
}
