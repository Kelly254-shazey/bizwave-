export type Language = 'en' | 'sw';

export interface UserSummary {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  preferredLanguage: Language;
  isPlatformAdmin: boolean;
  mfaEnabled: boolean;
}

export interface OrganizationMembership {
  id: string;
  name: string;
  slug: string;
  display_name: string;
  industry_code: string;
  business_size: string;
  currency_code: string;
  timezone: string;
  preferred_language: Language;
  logo_url?: string | null;
  brand_color: string;
  onboarding_completed: boolean;
  onboarding_step: number;
  roles: string[];
  permissions: string[];
  enabledFeatures: string[];
  plan_code: 'starter' | 'growth' | 'intelligence' | 'enterprise';
}

export interface Branch {
  id: string;
  code: string;
  name: string;
  city: string;
  county: string;
  address?: string;
  phone_number?: string;
  is_headquarters: boolean;
  status: string;
}

export interface KpiMetric {
  value: number | null;
  previousValue: number | null;
  changePct: number | null;
  available: boolean;
  formula: string;
  source: string;
}
