-- BizWave Migration 006: PostgreSQL Row-Level Security (RLS) for Strict Multi-Tenant Isolation (Section 5)
-- Enforced on ALL tenant-owned tables for the non-superuser application role (bizwave_app).
-- Every tenant-scoped request MUST execute inside a transaction with:
--   SET LOCAL app.tenant_id = '<authorized-tenant-uuid>';
-- Cross-tenant platform admin queries must explicitly set:
--   SET LOCAL app.is_platform_admin = 'true';

CREATE OR REPLACE FUNCTION app_current_tenant_id() RETURNS UUID AS $$
  SELECT NULLIF(current_setting('app.tenant_id', true), '')::UUID;
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION app_is_platform_admin() RETURNS BOOLEAN AS $$
  SELECT COALESCE(NULLIF(current_setting('app.is_platform_admin', true), ''), 'false')::BOOLEAN;
$$ LANGUAGE sql STABLE;

DO $$
DECLARE
  tbl TEXT;
  tenant_tables TEXT[] := ARRAY[
    'tenant_settings', 'branches', 'user_branch_assignments', 'departments',
    'business_settings', 'business_operating_hours', 'business_locations',
    'data_sources', 'data_source_credentials', 'integration_connections',
    'integration_sync_jobs', 'integration_sync_logs', 'uploaded_files',
    'import_mappings', 'import_mapping_fields', 'data_import_jobs',
    'import_validation_errors', 'ingestion_events',
    'customers', 'customer_contacts', 'customer_addresses', 'customer_segments',
    'customer_segment_members', 'customer_interactions', 'customer_feedback',
    'customer_consents', 'customer_tags', 'customer_tag_assignments',
    'product_categories', 'product_units', 'suppliers', 'products',
    'product_variants', 'inventory', 'inventory_movements', 'stock_adjustments',
    'purchase_orders', 'purchase_order_items', 'goods_receipts', 'reorder_rules',
    'stock_alerts', 'sales_channels', 'sales', 'sales_items', 'sales_payments',
    'sales_returns', 'sales_return_items', 'sales_tax_records',
    'payment_methods', 'expense_categories', 'expenses', 'expense_transactions',
    'cash_accounts', 'cash_transactions', 'receivables', 'payables',
    'financial_periods', 'budgets', 'budget_items',
    'metric_calculations', 'analytics_snapshots', 'dashboard_configurations',
    'dashboard_widgets', 'report_definitions', 'report_executions',
    'scheduled_reports', 'analytics_events',
    'model_training_runs', 'forecast_runs', 'forecast_values', 'forecast_actuals',
    'anomaly_detections', 'anomaly_events', 'prediction_explanations',
    'recommendations', 'recommendation_actions', 'recommendation_feedback',
    'ai_knowledge_sources', 'ai_conversations', 'ai_messages', 'ai_tool_executions',
    'ai_response_feedback', 'ai_usage_records',
    'communication_channels', 'communication_accounts', 'communication_templates',
    'communication_campaigns', 'communication_recipients', 'communication_messages',
    'communication_delivery_events', 'voice_sessions', 'ussd_sessions',
    'communication_usage', 'communication_consents',
    'subscriptions', 'subscription_invoices', 'billing_transactions',
    'usage_records', 'usage_quotas', 'tenant_add_ons',
    'data_access_logs', 'api_keys', 'api_key_permissions', 'consent_records',
    'data_retention_policies', 'export_jobs', 'deletion_requests'
  ];
BEGIN
  FOREACH tbl IN ARRAY tenant_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', tbl);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', tbl);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_policy ON %I;', tbl);
    EXECUTE format(
      'CREATE POLICY tenant_isolation_policy ON %I USING (tenant_id = app_current_tenant_id() OR app_is_platform_admin()) WITH CHECK (tenant_id = app_current_tenant_id() OR app_is_platform_admin());',
      tbl
    );
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION fn_refresh_analytics_views() RETURNS VOID AS $$
BEGIN
  REFRESH MATERIALIZED VIEW mv_tenant_daily_analytics;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

INSERT INTO schema_migrations (version, description)
VALUES ('006', 'Row-Level Security policies enforced on all tenant-owned tables')
ON CONFLICT (version) DO NOTHING;
