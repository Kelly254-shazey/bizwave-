-- BizWave Migration 001: Extensions, Schema Migrations Tracker, Identity & Access Tables (Section 8.1)
-- PostgreSQL 17 | Multi-tenant SaaS with composite tenant-aware keys & strict constraints

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Migration registry
CREATE TABLE IF NOT EXISTS schema_migrations (
  version VARCHAR(64) PRIMARY KEY,
  description TEXT NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Core Tenants (Organizations)
CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(160) NOT NULL,
  slug VARCHAR(120) NOT NULL UNIQUE,
  display_name VARCHAR(160) NOT NULL,
  industry_code VARCHAR(64) NOT NULL DEFAULT 'general_sme',
  business_size VARCHAR(32) NOT NULL DEFAULT 'micro' CHECK (business_size IN ('micro', 'small', 'medium', 'enterprise')),
  country_code CHAR(2) NOT NULL DEFAULT 'KE',
  currency_code CHAR(3) NOT NULL DEFAULT 'KES',
  timezone VARCHAR(64) NOT NULL DEFAULT 'Africa/Nairobi',
  preferred_language VARCHAR(8) NOT NULL DEFAULT 'en' CHECK (preferred_language IN ('en', 'sw')),
  business_email VARCHAR(255) NOT NULL,
  phone_number VARCHAR(32),
  registration_number VARCHAR(64),
  kra_pin VARCHAR(32),
  logo_url TEXT,
  brand_color VARCHAR(7) NOT NULL DEFAULT '#0D9488' CHECK (brand_color ~ '^#[0-9A-Fa-f]{6}$'),
  onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE,
  onboarding_step INTEGER NOT NULL DEFAULT 1 CHECK (onboarding_step BETWEEN 1 AND 11),
  status VARCHAR(24) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tenant_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
  default_branch_id UUID,
  dashboard_layout JSONB NOT NULL DEFAULT '[]'::jsonb,
  enabled_kpis JSONB NOT NULL DEFAULT '[]'::jsonb,
  reporting_preferences JSONB NOT NULL DEFAULT '{"frequency":"weekly","format":"csv","day_of_week":1}'::jsonb,
  notification_preferences JSONB NOT NULL DEFAULT '{"low_stock":true,"anomalies":true,"daily_summary":false,"sms_alerts":false}'::jsonb,
  workspace_template_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  custom_domain VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Users & Profiles
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  phone_number VARCHAR(32),
  preferred_language VARCHAR(8) NOT NULL DEFAULT 'en' CHECK (preferred_language IN ('en', 'sw')),
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  email_verified_at TIMESTAMPTZ,
  mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  is_platform_admin BOOLEAN NOT NULL DEFAULT FALSE,
  status VARCHAR(24) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'invited', 'suspended', 'locked')),
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  job_title VARCHAR(120),
  avatar_url TEXT,
  timezone VARCHAR(64) NOT NULL DEFAULT 'Africa/Nairobi',
  bio TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Sessions & Tokens
CREATE TABLE IF NOT EXISTS user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  active_tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
  ip_address INET,
  user_agent TEXT,
  device_label VARCHAR(120),
  revoked_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES user_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash CHAR(64) NOT NULL UNIQUE,
  token_family UUID NOT NULL,
  replaced_by UUID REFERENCES refresh_tokens(id) ON DELETE SET NULL,
  revoked_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RBAC: Roles & Permissions
CREATE TABLE IF NOT EXISTS roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  code VARCHAR(64) NOT NULL,
  name VARCHAR(120) NOT NULL,
  scope VARCHAR(24) NOT NULL CHECK (scope IN ('platform', 'business')),
  description TEXT,
  parent_role_id UUID REFERENCES roles(id) ON DELETE SET NULL,
  is_system BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, code)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_roles_system_code ON roles(code) WHERE tenant_id IS NULL;

CREATE TABLE IF NOT EXISTS permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(96) NOT NULL UNIQUE,
  module VARCHAR(64) NOT NULL,
  action VARCHAR(48) NOT NULL,
  description TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  delegated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, user_id, role_id)
);

CREATE TABLE IF NOT EXISTS login_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ip_address INET,
  user_agent TEXT,
  succeeded BOOLEAN NOT NULL,
  failure_reason VARCHAR(96),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mfa_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  method_type VARCHAR(24) NOT NULL CHECK (method_type IN ('totp', 'sms', 'recovery_codes')),
  secret_encrypted TEXT NOT NULL,
  is_verified BOOLEAN NOT NULL DEFAULT FALSE,
  is_primary BOOLEAN NOT NULL DEFAULT TRUE,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, method_type)
);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO schema_migrations (version, description)
VALUES ('001', 'Extensions and core identity/access tables')
ON CONFLICT (version) DO NOTHING;
