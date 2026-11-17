import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { AuthenticatedUser, TenantAuthContext } from '../types/auth.types';

export const IS_PUBLIC_KEY = 'isPublic';
export const REQUIRE_PERMISSIONS_KEY = 'requirePermissions';
export const REQUIRE_FEATURE_KEY = 'requireFeature';
export const SKIP_TENANT_KEY = 'skipTenant';

export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
export const SkipTenant = () => SetMetadata(SKIP_TENANT_KEY, true);
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(REQUIRE_PERMISSIONS_KEY, permissions);
export const RequireFeature = (featureCode: string) =>
  SetMetadata(REQUIRE_FEATURE_KEY, featureCode);

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const req = ctx.switchToHttp().getRequest();
    return req.user;
  },
);

export const TenantCtx = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): TenantAuthContext => {
    const req = ctx.switchToHttp().getRequest();
    return req.tenantContext;
  },
);
