-- BizWave Migration 002: Organization Tables (8.2) & Data Integration Tables (8.3)
-- Enforces composite tenant-aware foreign keys (tenant_id, id) to prevent cross-tenant linking

CREATE TABLE IF NOT EXISTS business_industries (
  code VARCHAR(64) PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  name_sw VARCHAR(120) NOT NULL,
  description TEXT NOT NULL,
  default_widgets JSONB NOT NULL DEFAULT '[]'::jsonb,
  default_kpis JSONB NOT NULL DEFAULT '[]'::jsonb,
  recommended_mappings JSONB NOT NULL DEFAULT '{}'::jsonb,
  recommended_reports JSONB NOT NULL DEFAULT '[]'::jsonb,
  suggested_questions_en JSONB NOT NULL DEFAULT '[]'::jsonb,
  suggested_questions_sw JSONB NOT NULL DEFAULT '[]'::jsonb,
  forecast_defaults JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS business_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  industry_code VARCHAR(64) NOT NULL REFERENCES business_industries(code) ON DELETE CASCADE,
  code VARCHAR(64) NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL,
  description TEXT
);

CREATE TABLE IF NOT EXISTS branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code VARCHAR(32) NOT NULL,
  name VARCHAR(160) NOT NULL,
  city VARCHAR(100) NOT NULL DEFAULT 'Nairobi',
  county VARCHAR(100) NOT NULL DEFAULT 'Nairobi',
  address TEXT,
  phone_number VARCHAR(32),
  is_headquarters BOOLEAN NOT NULL DEFAULT FALSE,
  status VARCHAR(24) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, code)
);

-- Branch-scoped access assignments (Section 8.1)
CREATE TABLE IF NOT EXISTS user_branch_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL,
  access_level VARCHAR(24) NOT NULL DEFAULT 'member' CHECK (access_level IN ('manager', 'member', 'auditor')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, user_id, branch_id),
  FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID,
  name VARCHAR(120) NOT NULL,
  code VARCHAR(32) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, code),
  FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS business_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  setting_key VARCHAR(96) NOT NULL,
  setting_value JSONB NOT NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, setting_key)
);

CREATE TABLE IF NOT EXISTS business_operating_hours (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL,
  day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  open_time TIME,
  close_time TIME,
  is_closed BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (tenant_id, branch_id, day_of_week),
  FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS business_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL,
  latitude NUMERIC(10, 7),
  longitude NUMERIC(10, 7),
  postal_code VARCHAR(32),
  neighborhood VARCHAR(120),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id) ON DELETE CASCADE
);

-- Data Integration Tables (Section 8.3)
CREATE TABLE IF NOT EXISTS integration_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(64) NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL,
  category VARCHAR(48) NOT NULL CHECK (category IN ('spreadsheet', 'pos', 'accounting', 'payments', 'communications', 'ecommerce')),
  required_credentials JSONB NOT NULL DEFAULT '[]'::jsonb,
  documentation_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS data_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID,
  provider_id UUID REFERENCES integration_providers(id) ON DELETE SET NULL,
  name VARCHAR(160) NOT NULL,
  source_type VARCHAR(48) NOT NULL CHECK (source_type IN ('csv_upload', 'xlsx_upload', 'json_api', 'pos', 'accounting', 'mpesa_statement')),
  status VARCHAR(24) NOT NULL DEFAULT 'configured' CHECK (status IN ('configured', 'active', 'paused', 'error', 'disconnected')),
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_synced_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id) ON DELETE SET NULL
);

-- Encrypted credentials only (AES-256-GCM ciphertext + IV + auth tag)
CREATE TABLE IF NOT EXISTS data_source_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  data_source_id UUID NOT NULL,
  credential_key VARCHAR(64) NOT NULL,
  encrypted_value TEXT NOT NULL,
  key_version INTEGER NOT NULL DEFAULT 1,
  rotated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, data_source_id, credential_key),
  FOREIGN KEY (tenant_id, data_source_id) REFERENCES data_sources(tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS integration_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider_id UUID NOT NULL REFERENCES integration_providers(id) ON DELETE RESTRICT,
  data_source_id UUID,
  status VARCHAR(24) NOT NULL DEFAULT 'pending_credentials' CHECK (status IN ('pending_credentials', 'connected', 'degraded', 'disconnected')),
  external_account_ref VARCHAR(160),
  last_health_check_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, data_source_id) REFERENCES data_sources(tenant_id, id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS integration_sync_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  records_processed INTEGER NOT NULL DEFAULT 0,
  records_failed INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (tenant_id, connection_id) REFERENCES integration_connections(tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS integration_sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  sync_job_id UUID NOT NULL REFERENCES integration_sync_jobs(id) ON DELETE CASCADE,
  log_level VARCHAR(16) NOT NULL CHECK (log_level IN ('info', 'warn', 'error')),
  message TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS uploaded_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  original_filename VARCHAR(255) NOT NULL,
  stored_path TEXT NOT NULL,
  mime_type VARCHAR(120) NOT NULL,
  file_size_bytes BIGINT NOT NULL CHECK (file_size_bytes > 0),
  sha256_checksum CHAR(64) NOT NULL,
  security_scan_status VARCHAR(24) NOT NULL DEFAULT 'passed' CHECK (security_scan_status IN ('pending', 'passed', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, id)
);

CREATE TABLE IF NOT EXISTS import_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(160) NOT NULL,
  dataset_type VARCHAR(32) NOT NULL CHECK (dataset_type IN ('sales', 'expenses', 'products', 'customers', 'mpesa')),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, id)
);

CREATE TABLE IF NOT EXISTS import_mapping_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  mapping_id UUID NOT NULL,
  source_column VARCHAR(160) NOT NULL,
  target_field VARCHAR(96) NOT NULL,
  transform_rule VARCHAR(64),
  is_required BOOLEAN NOT NULL DEFAULT FALSE,
  FOREIGN KEY (tenant_id, mapping_id) REFERENCES import_mappings(tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS data_import_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID,
  data_source_id UUID,
  uploaded_file_id UUID,
  mapping_id UUID,
  dataset_type VARCHAR(32) NOT NULL CHECK (dataset_type IN ('sales', 'expenses', 'products', 'customers', 'mpesa')),
  idempotency_key VARCHAR(128),
  status VARCHAR(32) NOT NULL DEFAULT 'uploaded' CHECK (status IN ('uploaded', 'mapped', 'validated', 'committing', 'completed', 'completed_with_errors', 'failed')),
  detected_columns JSONB NOT NULL DEFAULT '[]'::jsonb,
  column_mapping JSONB NOT NULL DEFAULT '{}'::jsonb,
  preview_rows JSONB NOT NULL DEFAULT '[]'::jsonb,
  total_records INTEGER NOT NULL DEFAULT 0,
  accepted_records INTEGER NOT NULL DEFAULT 0,
  rejected_records INTEGER NOT NULL DEFAULT 0,
  duplicate_records INTEGER NOT NULL DEFAULT 0,
  quality_score NUMERIC(5,2),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  validated_at TIMESTAMPTZ,
  committed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, idempotency_key),
  FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id) ON DELETE SET NULL,
  FOREIGN KEY (tenant_id, data_source_id) REFERENCES data_sources(tenant_id, id) ON DELETE SET NULL,
  FOREIGN KEY (tenant_id, uploaded_file_id) REFERENCES uploaded_files(tenant_id, id) ON DELETE SET NULL,
  FOREIGN KEY (tenant_id, mapping_id) REFERENCES import_mappings(tenant_id, id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS import_validation_errors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  import_job_id UUID NOT NULL,
  row_number INTEGER NOT NULL CHECK (row_number >= 1),
  column_name VARCHAR(120),
  error_code VARCHAR(64) NOT NULL,
  error_message TEXT NOT NULL,
  raw_value TEXT,
  raw_row JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (tenant_id, import_job_id) REFERENCES data_import_jobs(tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ingestion_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  import_job_id UUID,
  event_type VARCHAR(64) NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (tenant_id, import_job_id) REFERENCES data_import_jobs(tenant_id, id) ON DELETE SET NULL
);

INSERT INTO schema_migrations (version, description)
VALUES ('002', 'Organization and data integration tables')
ON CONFLICT (version) DO NOTHING;
