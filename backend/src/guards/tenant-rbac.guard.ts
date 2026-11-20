import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  IS_PUBLIC_KEY,
  REQUIRE_FEATURE_KEY,
  REQUIRE_PERMISSIONS_KEY,
  SKIP_TENANT_KEY,
} from '../common/decorators/auth.decorators';
import { DatabaseService } from '../database/database.service';
import { AuthenticatedUser, TenantAuthContext } from '../common/types/auth.types';
import { effectivePortalFeatures } from '../common/portal-features';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class TenantRbacGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly db: DatabaseService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const skipTenant = this.reflector.getAllAndOverride<boolean>(SKIP_TENANT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skipTenant) return true;

    const req = context.switchToHttp().getRequest();
    const user: AuthenticatedUser | undefined = req.user;
    if (!user) return false;

    const headerTenant = (req.headers['x-tenant-id'] as string | undefined)?.trim();

    // NEVER trust a frontend-supplied tenant ID without verifying user authorization in PostgreSQL!
    let targetTenantId = headerTenant;
    if (targetTenantId && !UUID_REGEX.test(targetTenantId)) {
      throw new BadRequestException('Malformed X-Tenant-Id header');
    }

    // Resolve user's authorized tenant memberships
    const membershipRes = await this.db.query(
      `SELECT DISTINCT t.id AS tenant_id, t.name AS tenant_name, t.industry_code, t.status AS tenant_status,
              r.code AS role_code
       FROM user_roles ur
       JOIN roles r ON r.id = ur.role_id
       JOIN tenants t ON t.id = ur.tenant_id
       WHERE ur.user_id = $1
         AND ur.is_active = TRUE
         AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
         AND ($2::uuid IS NULL OR ur.tenant_id = $2::uuid)`,
      [user.userId, targetTenantId || null],
    );

    if (membershipRes.rowCount === 0) {
      if (targetTenantId) {
        await this.db.appendAuditLog({
          tenantId: targetTenantId,
          actorUserId: user.userId,
          actorEmail: user.email,
          action: 'security.cross_tenant_denied',
          resourceType: 'tenant',
          resourceId: targetTenantId,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          changes: { reason: 'User has no active role assignment in requested tenant' },
        });
      }
      throw new ForbiddenException(
        'Access denied: you are not authorized to access the requested organization.',
      );
    }

    if (!targetTenantId) {
      targetTenantId = membershipRes.rows[0].tenant_id;
    }

    const tenantRows = membershipRes.rows.filter((r) => r.tenant_id === targetTenantId);
    if (tenantRows.length === 0 || tenantRows[0].tenant_status !== 'active') {
      throw new ForbiddenException('Organization access denied or suspended.');
    }

    const roles = [...new Set(tenantRows.map((r) => r.role_code as string))];

    // Resolve permissions for these roles
    const permRes = await this.db.query(
      `SELECT DISTINCT p.code
       FROM user_roles ur
       JOIN role_permissions rp ON rp.role_id = ur.role_id
       JOIN permissions p ON p.id = rp.permission_id
       WHERE ur.user_id = $1 AND ur.tenant_id = $2 AND ur.is_active = TRUE AND (ur.expires_at IS NULL OR ur.expires_at > NOW())`,
      [user.userId, targetTenantId],
    );
    const permissions = permRes.rows.map((r) => r.code as string);

    // Resolve branch scoping (strictly applied to branch_manager & staff_member unless owner/admin)
    const isTenantWide = roles.some((r) =>
      [
        'business_owner',
        'business_admin',
        'business_manager',
        'finance_officer',
        'inventory_manager',
        'sales_manager',
        'marketing_officer',
        'customer_service_agent',
        'read_only_auditor',
        'platform_super_admin',
      ].includes(r),
    );

    let allowedBranchIds: string[] | null = null;
    if (!isTenantWide) {
      const brRes = await this.db.withTenant(targetTenantId!, (client) =>
        client.query(
          `SELECT branch_id FROM user_branch_assignments WHERE tenant_id = $1 AND user_id = $2`,
          [targetTenantId, user.userId],
        ),
      );
      allowedBranchIds = brRes.rows.map((r) => r.branch_id as string);
    }

    // Resolve active subscription plan & enabled feature entitlements
    const subRes = await this.db.withTenant(targetTenantId!, (client) =>
      client.query(
        `SELECT sp.code AS plan_code,
                COALESCE(ARRAY_AGG(pf.feature_code) FILTER (WHERE pf.is_enabled), '{}') AS features
         FROM subscriptions s
         JOIN subscription_plans sp ON sp.id = s.plan_id
         LEFT JOIN plan_features pf ON pf.plan_id = sp.id
         WHERE s.tenant_id = $1 AND s.status IN ('active', 'trialing')
         GROUP BY sp.code, s.created_at
         ORDER BY s.created_at DESC
         LIMIT 1`,
        [targetTenantId],
      ),
    );

    const planCode = (subRes.rows[0]?.plan_code || 'starter') as TenantAuthContext['planCode'];
    const enabledFeatures = effectivePortalFeatures(subRes.rows[0]?.features || ['analytics_core', 'manual_imports']);

    const tenantCtx: TenantAuthContext = {
      tenantId: targetTenantId!,
      tenantName: tenantRows[0].tenant_name,
      industryCode: tenantRows[0].industry_code,
      planCode,
      roles,
      permissions,
      allowedBranchIds,
      enabledFeatures,
    };
    req.tenantContext = tenantCtx;

    // 1. Check required RBAC permissions
    const requiredPerms =
      this.reflector.getAllAndOverride<string[]>(REQUIRE_PERMISSIONS_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) || [];

    for (const perm of requiredPerms) {
      if (!permissions.includes(perm)) {
        throw new ForbiddenException(
          `Missing required permission '${perm}' for your role (${roles.join(', ')}).`,
        );
      }
    }

    // 2. Check required subscription feature entitlement (NEVER rely solely on frontend hiding!)
    const requiredFeature = this.reflector.getAllAndOverride<string | undefined>(
      REQUIRE_FEATURE_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (requiredFeature && !enabledFeatures.includes(requiredFeature)) {
      throw new ForbiddenException(
        `Your current subscription plan (${planCode.toUpperCase()}) does not include '${requiredFeature}'. Please upgrade in Billing.`,
      );
    }

    // 3. Enforce branch scoping if query/body asks for a branchId outside allowedBranchIds
    const requestedBranchId = (req.query?.branchId || req.body?.branchId) as string | undefined;
    if (
      requestedBranchId &&
      requestedBranchId !== 'all' &&
      allowedBranchIds !== null &&
      !allowedBranchIds.includes(requestedBranchId)
    ) {
      throw new ForbiddenException(
        'Branch access denied: your role is restricted to your assigned branch(es).',
      );
    }

    return true;
  }
}
