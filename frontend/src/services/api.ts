const API_BASE = '/api/v1';

const safeStorage = {
  get(key: string): string | null {
    try {
      return typeof globalThis !== 'undefined' && 'localStorage' in globalThis && globalThis.localStorage
        ? globalThis.localStorage.getItem(key)
        : null;
    } catch {
      return null;
    }
  },
  set(key: string, val: string) {
    try {
      if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis && globalThis.localStorage) {
        globalThis.localStorage.setItem(key, val);
      }
    } catch {
      // Ignore storage quota or private-mode exceptions gracefully
    }
  },
  remove(key: string) {
    try {
      if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis && globalThis.localStorage) {
        globalThis.localStorage.removeItem(key);
      }
    } catch {
      // Ignore restricted-mode exceptions gracefully
    }
  },
};

let accessTokenMem: string | null = safeStorage.get('bw_access_token');
let refreshTokenMem: string | null = safeStorage.get('bw_refresh_token');
let activeTenantMem: string | null = safeStorage.get('bw_tenant_id');
let learnerTokenMem: string | null = safeStorage.get('bw_learner_token');

export function setAuthTokens(access: string | null, refresh: string | null) {
  accessTokenMem = access;
  refreshTokenMem = refresh;
  if (access) safeStorage.set('bw_access_token', access);
  else safeStorage.remove('bw_access_token');
  if (refresh) safeStorage.set('bw_refresh_token', refresh);
  else safeStorage.remove('bw_refresh_token');
}

export function setActiveTenantHeader(tenantId: string | null) {
  activeTenantMem = tenantId;
  if (tenantId) safeStorage.set('bw_tenant_id', tenantId);
  else safeStorage.remove('bw_tenant_id');
}

export function setLearnerToken(token: string | null) {
  learnerTokenMem = token;
  if (token) safeStorage.set('bw_learner_token', token);
  else safeStorage.remove('bw_learner_token');
}

export function getLearnerToken() {
  return learnerTokenMem;
}

export function getAccessToken() {
  return accessTokenMem;
}

export function getActiveTenantId() {
  return activeTenantMem;
}

async function tryRefresh(): Promise<boolean> {
  if (!refreshTokenMem) return false;
  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: refreshTokenMem }),
    });
    if (!res.ok) {
      setAuthTokens(null, null);
      return false;
    }
    const data = await res.json();
    setAuthTokens(data.accessToken, data.refreshToken);
    return true;
  } catch {
    return false;
  }
}

export class ApiError extends Error {
  status: number;
  details: any;
  constructor(message: string, status: number, details?: any) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export async function apiRequest<T = any>(
  path: string,
  options: {
    method?: string;
    body?: any;
    isFormData?: boolean;
    tenantIdOverride?: string;
    skipAuth?: boolean;
    includeLearnerToken?: boolean;
  } = {},
): Promise<T> {
  const buildHeaders = () => {
    const headers: Record<string, string> = {};
    if (!options.skipAuth && accessTokenMem) {
      headers['Authorization'] = `Bearer ${accessTokenMem}`;
    }
    const tid = options.tenantIdOverride ?? activeTenantMem;
    if (!options.skipAuth && tid) headers['X-Tenant-Id'] = tid;
    if (options.includeLearnerToken && learnerTokenMem) {
      headers['X-Learner-Token'] = learnerTokenMem;
    }
    if (!options.isFormData && options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }
    return headers;
  };

  const execute = () =>
    fetch(`${API_BASE}${path}`, {
      method: options.method || 'GET',
      headers: buildHeaders(),
      body:
        options.body === undefined
          ? undefined
          : options.isFormData
            ? options.body
            : JSON.stringify(options.body),
    });

  let res = await execute();
  if (res.status === 401 && !options.skipAuth && refreshTokenMem) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      res = await execute();
    }
  }

  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!res.ok) {
    const msg =
      (typeof data === 'object' && data?.message && (Array.isArray(data.message) ? data.message.join(', ') : data.message)) ||
      `Request failed (${res.status})`;
    throw new ApiError(msg, res.status, data);
  }

  if (options.includeLearnerToken && data && typeof data === 'object' && typeof data.learnerToken === 'string') {
    setLearnerToken(data.learnerToken);
  }

  return data as T;
}

export async function downloadCsvReport(reportType: string, days = 30) {
  const headers: Record<string, string> = {};
  if (accessTokenMem) headers['Authorization'] = `Bearer ${accessTokenMem}`;
  if (activeTenantMem) headers['X-Tenant-Id'] = activeTenantMem;
  const res = await fetch(`${API_BASE}/reports/export?reportType=${encodeURIComponent(reportType)}&days=${days}`, {
    headers,
  });
  if (!res.ok) throw new Error('Report export failed');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `bizwave-${reportType}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
