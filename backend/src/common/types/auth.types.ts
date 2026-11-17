export interface AuthenticatedUser {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  sessionId: string;
  isPlatformAdmin: boolean;
  preferredLanguage: 'en' | 'sw';
}

export interface TenantAuthContext {
  tenantId: string;
  tenantName: string;
  industryCode: string;
  planCode: 'starter' | 'growth' | 'intelligence' | 'enterprise';
  roles: string[];
  permissions: string[];
  allowedBranchIds: string[] | null; // null = unrestricted across tenant branches; string[] = branch-scoped user
  enabledFeatures: string[];
}

export interface RequestWithAuth {
  user?: AuthenticatedUser;
  tenantContext?: TenantAuthContext;
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
}
