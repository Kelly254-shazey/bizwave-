-- BizWave Migration 004: Analytics (8.8), Predictions (8.9), AI (8.10), Communications (8.11), Subscriptions (8.12), Security & Audit (8.13)

-- ===================== ANALYTICS (8.8) =====================
CREATE TABLE IF NOT EXISTS metric_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  code VARCHAR(64) NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  name VARCHAR(140) NOT NULL,
  name_sw VARCHAR(140),
  formula_description TEXT NOT NULL,
  source_tables JSONB NOT NULL DEFAULT '[]'::jsonb,
  unit VARCHAR(32) NOT NULL DEFAULT 'KES',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, code, version)
);

CREATE TABLE IF NOT EXISTS metric_calculations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID,
  metric_definition_id UUID NOT NULL REFERENCES metric_definitions(id) ON DELETE RESTRICT,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  value NUMERIC(18, 4) NOT NULL,
  previous_value NUMERIC(18, 4),
  data_coverage_pct NUMERIC(5, 2) NOT NULL DEFAULT 100.00,
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS analytics_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID,
  snapshot_date DATE NOT NULL,
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  data_quality_score NUMERIC(5, 2) NOT NULL DEFAULT 100.00,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, branch_id, snapshot_date),
  FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS dashboard_configurations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL,
  industry_code VARCHAR(64),
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  layout_config JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, id)
);

CREATE TABLE IF NOT EXISTS dashboard_widgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  dashboard_id UUID NOT NULL,
  widget_type VARCHAR(64) NOT NULL,
  title VARCHAR(140) NOT NULL,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  position_order INTEGER NOT NULL DEFAULT 0,
  is_visible BOOLEAN NOT NULL DEFAULT TRUE,
  FOREIGN KEY (tenant_id, dashboard_id) REFERENCES dashboard_configurations(tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS report_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(160) NOT NULL,
  report_type VARCHAR(48) NOT NULL CHECK (report_type IN ('sales_summary', 'expense_ledger', 'inventory_valuation', 'customer_insights', 'cashflow_statement', 'branch_comparison', 'communications_performance')),
  parameters JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, id)
);

CREATE TABLE IF NOT EXISTS report_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  report_definition_id UUID,
  report_type VARCHAR(48) NOT NULL,
  format VARCHAR(16) NOT NULL DEFAULT 'csv' CHECK (format IN ('csv', 'json', 'xlsx')),
  parameters JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(24) NOT NULL DEFAULT 'completed' CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  row_count INTEGER NOT NULL DEFAULT 0,
  file_path TEXT,
  executed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (tenant_id, report_definition_id) REFERENCES report_definitions(tenant_id, id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS scheduled_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  report_definition_id UUID NOT NULL,
  cron_expression VARCHAR(64) NOT NULL DEFAULT '0 7 * * 1',
  recipients JSONB NOT NULL DEFAULT '[]'::jsonb,
  format VARCHAR(16) NOT NULL DEFAULT 'csv',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (tenant_id, report_definition_id) REFERENCES report_definitions(tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  event_name VARCHAR(96) NOT NULL,
  properties JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ===================== PREDICTION & INTELLIGENCE (8.9) =====================
CREATE TABLE IF NOT EXISTS forecasting_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(64) NOT NULL UNIQUE,
  name VARCHAR(140) NOT NULL,
  domain VARCHAR(32) NOT NULL CHECK (domain IN ('sales', 'demand', 'cashflow', 'churn')),
  algorithm VARCHAR(64) NOT NULL,
  min_history_days INTEGER NOT NULL DEFAULT 14,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS model_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id UUID NOT NULL REFERENCES forecasting_models(id) ON DELETE CASCADE,
  version_tag VARCHAR(48) NOT NULL,
  hyperparameters JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(24) NOT NULL DEFAULT 'active' CHECK (status IN ('staging', 'active', 'deprecated')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (model_id, version_tag)
);

CREATE TABLE IF NOT EXISTS model_training_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  model_version_id UUID NOT NULL REFERENCES model_versions(id) ON DELETE RESTRICT,
  dataset_ref VARCHAR(160) NOT NULL,
  training_start DATE NOT NULL,
  training_end DATE NOT NULL,
  sample_count INTEGER NOT NULL,
  evaluation_metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(24) NOT NULL CHECK (status IN ('completed', 'insufficient_data', 'failed')),
  trained_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS forecast_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID,
  product_id UUID,
  forecast_type VARCHAR(32) NOT NULL CHECK (forecast_type IN ('sales', 'demand', 'cashflow')),
  model_version_id UUID REFERENCES model_versions(id) ON DELETE SET NULL,
  selected_algorithm VARCHAR(64) NOT NULL,
  horizon_days INTEGER NOT NULL CHECK (horizon_days BETWEEN 1 AND 365),
  training_start DATE,
  training_end DATE,
  status VARCHAR(32) NOT NULL CHECK (status IN ('completed', 'insufficient_data', 'failed')),
  status_message TEXT,
  evaluation_metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  requested_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id) ON DELETE SET NULL,
  FOREIGN KEY (tenant_id, product_id) REFERENCES products(tenant_id, id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS forecast_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  forecast_run_id UUID NOT NULL,
  target_date DATE NOT NULL,
  predicted_value NUMERIC(14, 2) NOT NULL,
  lower_bound NUMERIC(14, 2) NOT NULL,
  upper_bound NUMERIC(14, 2) NOT NULL,
  confidence_level NUMERIC(4, 2) NOT NULL DEFAULT 0.90,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (tenant_id, forecast_run_id, target_date),
  FOREIGN KEY (tenant_id, forecast_run_id) REFERENCES forecast_runs(tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS forecast_actuals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  forecast_run_id UUID NOT NULL,
  target_date DATE NOT NULL,
  actual_value NUMERIC(14, 2) NOT NULL,
  absolute_error NUMERIC(14, 2) NOT NULL,
  percentage_error NUMERIC(8, 4),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, forecast_run_id, target_date),
  FOREIGN KEY (tenant_id, forecast_run_id) REFERENCES forecast_runs(tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS anomaly_detections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID,
  detector_name VARCHAR(64) NOT NULL,
  metric_name VARCHAR(64) NOT NULL,
  analyzed_from DATE NOT NULL,
  analyzed_to DATE NOT NULL,
  anomalies_found INTEGER NOT NULL DEFAULT 0,
  run_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS anomaly_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  detection_id UUID,
  branch_id UUID,
  anomaly_type VARCHAR(48) NOT NULL CHECK (anomaly_type IN ('revenue_drop', 'revenue_spike', 'expense_spike', 'inventory_discrepancy', 'churn_surge', 'transaction_pattern')),
  severity VARCHAR(16) NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  event_date DATE NOT NULL,
  metric_name VARCHAR(64) NOT NULL,
  expected_value NUMERIC(14, 2) NOT NULL,
  observed_value NUMERIC(14, 2) NOT NULL,
  deviation_score NUMERIC(8, 4) NOT NULL,
  explanation TEXT NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'investigating', 'resolved', 'dismissed')),
  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (tenant_id, detection_id) REFERENCES anomaly_detections(tenant_id, id) ON DELETE SET NULL,
  FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS prediction_explanations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  forecast_run_id UUID NOT NULL,
  feature_name VARCHAR(96) NOT NULL,
  contribution_weight NUMERIC(8, 4) NOT NULL,
  explanation_text TEXT NOT NULL,
  FOREIGN KEY (tenant_id, forecast_run_id) REFERENCES forecast_runs(tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID,
  category VARCHAR(48) NOT NULL CHECK (category IN ('inventory', 'pricing', 'cashflow', 'marketing', 'operations', 'cost_control')),
  priority VARCHAR(16) NOT NULL CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  title VARCHAR(200) NOT NULL,
  observation TEXT NOT NULL,
  estimate TEXT,
  suggested_action TEXT NOT NULL,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(24) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'accepted', 'completed', 'dismissed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS recommendation_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  recommendation_id UUID NOT NULL,
  action_taken TEXT NOT NULL,
  taken_by UUID REFERENCES users(id) ON DELETE SET NULL,
  taken_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (tenant_id, recommendation_id) REFERENCES recommendations(tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS recommendation_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  recommendation_id UUID NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  helpful BOOLEAN NOT NULL,
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (tenant_id, recommendation_id) REFERENCES recommendations(tenant_id, id) ON DELETE CASCADE
);

-- ===================== AI BUSINESS ASSISTANT (8.10) =====================
CREATE TABLE IF NOT EXISTS ai_prompt_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(64) NOT NULL,
  version INTEGER NOT NULL,
  language VARCHAR(8) NOT NULL DEFAULT 'en',
  system_template TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (code, version, language)
);

CREATE TABLE IF NOT EXISTS ai_knowledge_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  source_name VARCHAR(140) NOT NULL,
  source_type VARCHAR(48) NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  branch_id UUID,
  title VARCHAR(200) NOT NULL DEFAULT 'New Business Inquiry',
  language VARCHAR(8) NOT NULL DEFAULT 'en' CHECK (language IN ('en', 'sw')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS ai_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL,
  role VARCHAR(16) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  language VARCHAR(8) NOT NULL DEFAULT 'en',
  intent VARCHAR(64),
  provenance JSONB NOT NULL DEFAULT '{}'::jsonb,
  supporting_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  follow_up_questions JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, conversation_id) REFERENCES ai_conversations(tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ai_tool_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  message_id UUID NOT NULL,
  tool_name VARCHAR(96) NOT NULL,
  parameters JSONB NOT NULL DEFAULT '{}'::jsonb,
  row_count INTEGER NOT NULL DEFAULT 0,
  execution_ms INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(24) NOT NULL DEFAULT 'success',
  executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (tenant_id, message_id) REFERENCES ai_messages(tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ai_response_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  message_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating SMALLINT NOT NULL CHECK (rating IN (-1, 1)),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, message_id, user_id),
  FOREIGN KEY (tenant_id, message_id) REFERENCES ai_messages(tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ai_usage_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  conversation_id UUID,
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  tools_invoked INTEGER NOT NULL DEFAULT 0,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (tenant_id, conversation_id) REFERENCES ai_conversations(tenant_id, id) ON DELETE SET NULL
);

-- ===================== COMMUNICATIONS (8.11) =====================
CREATE TABLE IF NOT EXISTS communication_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(64) NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL,
  supported_channels JSONB NOT NULL DEFAULT '[]'::jsonb,
  required_env_keys JSONB NOT NULL DEFAULT '[]'::jsonb,
  webhook_signature_header VARCHAR(96),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS communication_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  channel_type VARCHAR(24) NOT NULL CHECK (channel_type IN ('sms', 'whatsapp', 'voice', 'ussd')),
  provider_id UUID NOT NULL REFERENCES communication_providers(id) ON DELETE RESTRICT,
  sender_id VARCHAR(64),
  is_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  rate_limit_per_min INTEGER NOT NULL DEFAULT 60,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, channel_type)
);

CREATE TABLE IF NOT EXISTS communication_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL,
  account_label VARCHAR(120) NOT NULL,
  encrypted_credentials TEXT,
  webhook_secret_encrypted TEXT,
  credential_status VARCHAR(32) NOT NULL DEFAULT 'missing_credentials' CHECK (credential_status IN ('missing_credentials', 'configured', 'verified', 'error')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, channel_id),
  FOREIGN KEY (tenant_id, channel_id) REFERENCES communication_channels(tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS communication_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(140) NOT NULL,
  channel_type VARCHAR(24) NOT NULL CHECK (channel_type IN ('sms', 'whatsapp', 'voice', 'ussd')),
  language VARCHAR(8) NOT NULL DEFAULT 'en' CHECK (language IN ('en', 'sw')),
  purpose VARCHAR(32) NOT NULL DEFAULT 'marketing' CHECK (purpose IN ('marketing', 'transactional', 'service_alerts')),
  body_template TEXT NOT NULL,
  variables JSONB NOT NULL DEFAULT '[]'::jsonb,
  approval_status VARCHAR(24) NOT NULL DEFAULT 'approved' CHECK (approval_status IN ('draft', 'pending_provider', 'approved', 'rejected')),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, name, language)
);

CREATE TABLE IF NOT EXISTS communication_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID,
  name VARCHAR(160) NOT NULL,
  channel_type VARCHAR(24) NOT NULL CHECK (channel_type IN ('sms', 'whatsapp', 'voice', 'ussd')),
  template_id UUID,
  segment_id UUID,
  purpose VARCHAR(32) NOT NULL DEFAULT 'marketing' CHECK (purpose IN ('marketing', 'transactional', 'service_alerts')),
  status VARCHAR(32) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'processing', 'sent', 'blocked_provider_unconfigured', 'completed', 'cancelled')),
  scheduled_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  target_count INTEGER NOT NULL DEFAULT 0,
  consented_count INTEGER NOT NULL DEFAULT 0,
  skipped_no_consent_count INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id) ON DELETE SET NULL,
  FOREIGN KEY (tenant_id, template_id) REFERENCES communication_templates(tenant_id, id) ON DELETE SET NULL,
  FOREIGN KEY (tenant_id, segment_id) REFERENCES customer_segments(tenant_id, id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS communication_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL,
  customer_id UUID NOT NULL,
  destination VARCHAR(64) NOT NULL,
  consent_verified BOOLEAN NOT NULL DEFAULT FALSE,
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  FOREIGN KEY (tenant_id, campaign_id) REFERENCES communication_campaigns(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, customer_id) REFERENCES customers(tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS communication_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  campaign_id UUID,
  customer_id UUID,
  channel_type VARCHAR(24) NOT NULL CHECK (channel_type IN ('sms', 'whatsapp', 'voice', 'ussd')),
  provider_code VARCHAR(64) NOT NULL,
  direction VARCHAR(16) NOT NULL DEFAULT 'outbound' CHECK (direction IN ('inbound', 'outbound')),
  recipient_address VARCHAR(64) NOT NULL,
  body TEXT NOT NULL,
  purpose VARCHAR(32) NOT NULL DEFAULT 'transactional',
  consent_checked BOOLEAN NOT NULL DEFAULT TRUE,
  provider_message_id VARCHAR(160),
  delivery_status VARCHAR(40) NOT NULL DEFAULT 'queued' CHECK (delivery_status IN ('queued', 'provider_unconfigured', 'submitted', 'sent', 'delivered', 'read', 'failed', 'rejected_no_consent')),
  failure_reason TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  cost_kes NUMERIC(10, 4) NOT NULL DEFAULT 0,
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, campaign_id) REFERENCES communication_campaigns(tenant_id, id) ON DELETE SET NULL,
  FOREIGN KEY (tenant_id, customer_id) REFERENCES customers(tenant_id, id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS communication_delivery_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  message_id UUID NOT NULL,
  provider_event_id VARCHAR(160) NOT NULL,
  event_status VARCHAR(40) NOT NULL,
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, provider_event_id),
  FOREIGN KEY (tenant_id, message_id) REFERENCES communication_messages(tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS voice_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id UUID,
  provider_call_id VARCHAR(160) NOT NULL,
  direction VARCHAR(16) NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  caller_number VARCHAR(32) NOT NULL,
  duration_seconds INTEGER NOT NULL DEFAULT 0 CHECK (duration_seconds >= 0),
  call_status VARCHAR(32) NOT NULL,
  recording_url TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, provider_call_id),
  FOREIGN KEY (tenant_id, customer_id) REFERENCES customers(tenant_id, id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS ussd_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id UUID,
  provider_session_id VARCHAR(160) NOT NULL,
  service_code VARCHAR(32) NOT NULL,
  phone_number VARCHAR(32) NOT NULL,
  menu_path TEXT,
  last_input TEXT,
  session_status VARCHAR(24) NOT NULL DEFAULT 'completed',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, provider_session_id),
  FOREIGN KEY (tenant_id, customer_id) REFERENCES customers(tenant_id, id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
  provider_code VARCHAR(64) NOT NULL,
  idempotency_key VARCHAR(160) NOT NULL UNIQUE,
  signature_valid BOOLEAN NOT NULL,
  event_type VARCHAR(64) NOT NULL,
  payload JSONB NOT NULL,
  processed_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS communication_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  channel_type VARCHAR(24) NOT NULL,
  billing_month DATE NOT NULL,
  units_used INTEGER NOT NULL DEFAULT 0,
  estimated_cost_kes NUMERIC(14, 2) NOT NULL DEFAULT 0,
  UNIQUE (tenant_id, channel_type, billing_month)
);

CREATE TABLE IF NOT EXISTS communication_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL,
  channel_type VARCHAR(24) NOT NULL CHECK (channel_type IN ('sms', 'whatsapp', 'voice', 'ussd')),
  opted_in BOOLEAN NOT NULL,
  opt_out_keyword VARCHAR(32),
  proof_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, customer_id, channel_type),
  FOREIGN KEY (tenant_id, customer_id) REFERENCES customers(tenant_id, id) ON DELETE CASCADE
);

-- ===================== SUBSCRIPTIONS & BILLING (8.12) =====================
CREATE TABLE IF NOT EXISTS subscription_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(32) NOT NULL UNIQUE CHECK (code IN ('starter', 'growth', 'intelligence', 'enterprise')),
  name VARCHAR(80) NOT NULL,
  description TEXT NOT NULL,
  monthly_price_kes NUMERIC(14, 2) NOT NULL CHECK (monthly_price_kes >= 0),
  price_range_label VARCHAR(80) NOT NULL,
  currency_code CHAR(3) NOT NULL DEFAULT 'KES',
  sort_order SMALLINT NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS plan_features (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES subscription_plans(id) ON DELETE CASCADE,
  feature_code VARCHAR(64) NOT NULL,
  feature_label VARCHAR(140) NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (plan_id, feature_code)
);

CREATE TABLE IF NOT EXISTS plan_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES subscription_plans(id) ON DELETE CASCADE,
  metric_code VARCHAR(64) NOT NULL,
  monthly_limit INTEGER NOT NULL,
  UNIQUE (plan_id, metric_code)
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES subscription_plans(id) ON DELETE RESTRICT,
  status VARCHAR(24) NOT NULL DEFAULT 'active' CHECK (status IN ('trialing', 'active', 'past_due', 'cancelled')),
  billing_cycle VARCHAR(16) NOT NULL DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly', 'annual')),
  current_period_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  current_period_end TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  auto_renew BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, id)
);

CREATE TABLE IF NOT EXISTS subscription_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  subscription_id UUID NOT NULL,
  invoice_number VARCHAR(64) NOT NULL UNIQUE,
  amount_kes NUMERIC(14, 2) NOT NULL CHECK (amount_kes >= 0),
  tax_kes NUMERIC(14, 2) NOT NULL DEFAULT 0,
  total_kes NUMERIC(14, 2) NOT NULL CHECK (total_kes >= 0),
  status VARCHAR(24) NOT NULL DEFAULT 'paid' CHECK (status IN ('draft', 'open', 'paid', 'void', 'overdue')),
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  due_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '14 days'),
  paid_at TIMESTAMPTZ,
  FOREIGN KEY (tenant_id, subscription_id) REFERENCES subscriptions(tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS billing_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES subscription_invoices(id) ON DELETE CASCADE,
  payment_channel VARCHAR(32) NOT NULL DEFAULT 'mpesa',
  provider_reference VARCHAR(120),
  amount_kes NUMERIC(14, 2) NOT NULL CHECK (amount_kes > 0),
  status VARCHAR(24) NOT NULL DEFAULT 'completed',
  transacted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS usage_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  metric_code VARCHAR(64) NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  billing_period DATE NOT NULL DEFAULT DATE_TRUNC('month', NOW())::DATE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS usage_quotas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  metric_code VARCHAR(64) NOT NULL,
  quota_limit INTEGER NOT NULL,
  current_usage INTEGER NOT NULL DEFAULT 0,
  period_start DATE NOT NULL DEFAULT DATE_TRUNC('month', NOW())::DATE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, metric_code, period_start)
);

CREATE TABLE IF NOT EXISTS add_on_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(64) NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL,
  unit_label VARCHAR(48) NOT NULL,
  unit_price_kes NUMERIC(10, 2) NOT NULL CHECK (unit_price_kes >= 0),
  description TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS tenant_add_ons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  add_on_id UUID NOT NULL REFERENCES add_on_services(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  status VARCHAR(24) NOT NULL DEFAULT 'active',
  activated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, add_on_id)
);

-- ===================== SECURITY & AUDITING (8.13) =====================
-- Immutable SHA-256 hash-chained audit trail
CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  event_uuid UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_email VARCHAR(255),
  action VARCHAR(96) NOT NULL,
  resource_type VARCHAR(64) NOT NULL,
  resource_id VARCHAR(128),
  ip_address INET,
  user_agent TEXT,
  changes JSONB NOT NULL DEFAULT '{}'::jsonb,
  previous_hash CHAR(64) NOT NULL,
  record_hash CHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS security_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  event_type VARCHAR(64) NOT NULL,
  severity VARCHAR(16) NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  ip_address INET,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS data_access_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  resource_type VARCHAR(64) NOT NULL,
  query_scope JSONB NOT NULL DEFAULT '{}'::jsonb,
  rows_returned INTEGER NOT NULL DEFAULT 0,
  accessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL,
  key_prefix VARCHAR(16) NOT NULL,
  key_hash CHAR(64) NOT NULL UNIQUE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, id)
);

CREATE TABLE IF NOT EXISTS api_key_permissions (
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  api_key_id UUID NOT NULL,
  permission_code VARCHAR(96) NOT NULL,
  PRIMARY KEY (tenant_id, api_key_id, permission_code),
  FOREIGN KEY (tenant_id, api_key_id) REFERENCES api_keys(tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS consent_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  subject_type VARCHAR(32) NOT NULL CHECK (subject_type IN ('user', 'customer')),
  subject_id UUID NOT NULL,
  consent_type VARCHAR(64) NOT NULL,
  granted BOOLEAN NOT NULL,
  policy_version VARCHAR(32) NOT NULL DEFAULT 'dpa-ke-2019-v1',
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS data_retention_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  data_domain VARCHAR(64) NOT NULL,
  retention_days INTEGER NOT NULL CHECK (retention_days >= 30),
  legal_hold BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, data_domain)
);

CREATE TABLE IF NOT EXISTS export_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  requested_by UUID REFERENCES users(id) ON DELETE SET NULL,
  export_scope VARCHAR(48) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'completed',
  record_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS deletion_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  subject_type VARCHAR(32) NOT NULL,
  subject_id UUID NOT NULL,
  reason TEXT NOT NULL,
  legal_retention_note TEXT,
  status VARCHAR(24) NOT NULL DEFAULT 'pending_review' CHECK (status IN ('pending_review', 'approved_anonymized', 'retained_legal_obligation', 'rejected')),
  requested_by UUID REFERENCES users(id) ON DELETE SET NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

-- Public website contact enquiries (with basic spam metadata)
CREATE TABLE IF NOT EXISTS contact_enquiries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name VARCHAR(160) NOT NULL,
  email VARCHAR(255) NOT NULL,
  phone_number VARCHAR(32),
  company_name VARCHAR(160),
  category VARCHAR(32) NOT NULL CHECK (category IN ('business', 'partnership', 'sales', 'support')),
  message TEXT NOT NULL,
  ip_address INET,
  status VARCHAR(24) NOT NULL DEFAULT 'new',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO schema_migrations (version, description)
VALUES ('004', 'Analytics, predictions, AI, communications, subscriptions and security/audit tables')
ON CONFLICT (version) DO NOTHING;
