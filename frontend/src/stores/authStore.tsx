import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { apiRequest, getAccessToken, getActiveTenantId, setActiveTenantHeader, setAuthTokens } from '../services/api';
import { Branch, Language, OrganizationMembership, UserSummary } from '../types';

interface AuthContextValue {
  user: UserSummary | null;
  organizations: OrganizationMembership[];
  activeOrg: OrganizationMembership | null;
  branches: Branch[];
  selectedBranchId: string;
  language: Language;
  loading: boolean;
  setLanguage: (lang: Language) => void;
  setSelectedBranchId: (branchId: string) => void;
  selectOrganization: (tenantId: string) => Promise<void>;
  refreshSession: () => Promise<void>;
  loginSuccess: (payload: {
    accessToken: string;
    refreshToken: string;
    user: UserSummary;
    organizations: OrganizationMembership[];
    activeTenantId?: string | null;
  }) => Promise<void>;
  logout: () => Promise<void>;
  hasPermission: (perm: string) => boolean;
  hasFeature: (feature: string) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserSummary | null>(null);
  const [organizations, setOrganizations] = useState<OrganizationMembership[]>([]);
  const [activeOrg, setActiveOrg] = useState<OrganizationMembership | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string>('all');
  const [language, setLanguageState] = useState<Language>(
    (localStorage.getItem('bw_lang') as Language) || 'en',
  );
  const [loading, setLoading] = useState(true);

  const applyBrandColor = (hex?: string) => {
    document.documentElement.style.setProperty('--brand-primary', hex || '#0D9488');
  };

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem('bw_lang', lang);
  };

  const loadBranchesForOrg = useCallback(async (tenantId: string) => {
    try {
      const res = await apiRequest<{ branches: Branch[] }>('/branches', { tenantIdOverride: tenantId });
      setBranches(res.branches || []);
      setSelectedBranchId(res.branches?.length === 1 ? res.branches[0].id : 'all');
    } catch {
      setBranches([]);
    }
  }, []);

  const refreshSession = useCallback(async () => {
    if (!getAccessToken()) {
      setLoading(false);
      return;
    }
    try {
      const data = await apiRequest<{ user: UserSummary; organizations: OrganizationMembership[] }>('/auth/me');
      setUser(data.user);
      setOrganizations(data.organizations || []);
      const storedTid = getActiveTenantId();
      const matched =
        data.organizations.find((o) => o.id === storedTid) || data.organizations[0] || null;
      if (matched) {
        setActiveTenantHeader(matched.id);
        setActiveOrg(matched);
        applyBrandColor(matched.brand_color);
        await loadBranchesForOrg(matched.id);
      }
    } catch {
      setAuthTokens(null, null);
      setActiveTenantHeader(null);
      setUser(null);
      setOrganizations([]);
      setActiveOrg(null);
    } finally {
      setLoading(false);
    }
  }, [loadBranchesForOrg]);

  useEffect(() => {
    refreshSession();
  }, [refreshSession]);

  const selectOrganization = async (tenantId: string) => {
    const found = organizations.find((o) => o.id === tenantId);
    if (!found) return;
    setActiveTenantHeader(found.id);
    setActiveOrg(found);
    applyBrandColor(found.brand_color);
    await loadBranchesForOrg(found.id);
  };

  const loginSuccess = async (payload: {
    accessToken: string;
    refreshToken: string;
    user: UserSummary;
    organizations: OrganizationMembership[];
    activeTenantId?: string | null;
  }) => {
    setAuthTokens(payload.accessToken, payload.refreshToken);
    setUser(payload.user);
    setOrganizations(payload.organizations || []);
    const target =
      payload.organizations.find((o) => o.id === payload.activeTenantId) ||
      payload.organizations[0] ||
      null;
    if (target) {
      setActiveTenantHeader(target.id);
      setActiveOrg(target);
      applyBrandColor(target.brand_color);
      await loadBranchesForOrg(target.id);
    }
  };

  const logout = async () => {
    try {
      await apiRequest('/auth/logout', { method: 'POST' });
    } catch {
      // ignore logout network errors
    }
    setAuthTokens(null, null);
    setActiveTenantHeader(null);
    setUser(null);
    setOrganizations([]);
    setActiveOrg(null);
    setBranches([]);
    applyBrandColor('#0D9488');
  };

  const hasPermission = (perm: string) => Boolean(activeOrg?.permissions?.includes(perm));
  const hasFeature = (feature: string) => Boolean(activeOrg?.enabledFeatures?.includes(feature));

  return (
    <AuthContext.Provider
      value={{
        user,
        organizations,
        activeOrg,
        branches,
        selectedBranchId,
        language,
        loading,
        setLanguage,
        setSelectedBranchId,
        selectOrganization,
        refreshSession,
        loginSuccess,
        logout,
        hasPermission,
        hasFeature,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
