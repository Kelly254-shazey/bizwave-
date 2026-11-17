# BizWave PostgreSQL Data Dictionary

All schema objects are provisioned via explicit, versioned SQL migrations (`database/migrations/001`–`006`). Financial values strictly use `NUMERIC(14,2)` (never floating-point `FLOAT`/`DOUBLE PRECISION`), timestamps use `TIMESTAMPTZ` (default session timezone `Africa/Nairobi`), and currencies default to `KES`.

---

## Group 1: Identity, Authentication, Sessions & RBAC (`001_extensions_and_identity.sql`)

| Table | Purpose | Key Columns & Constraints | RLS |
|---|---|---|---|
| `users` | Global user identities (may belong to multiple SME organizations) | `id UUID PK`, `email CITEXT UNIQUE`, `password_hash TEXT` (Argon2id PHC), `preferred_language CHECK ('en','sw')`, `mfa_enabled BOOLEAN`, `failed_login_attempts`, `locked_until` | App-scoped |
| `user_sessions` | Rotating refresh token sessions with revocation & theft detection | `id UUID PK`, `user_id FK`, `refresh_token_hash TEXT UNIQUE` (SHA-256), `expires_at`, `revoked_at`, `replaced_by_session_id` | App-scoped |
| `user_mfa_methods` | RFC 6238 TOTP secrets encrypted with AES-256-GCM | `id UUID PK`, `user_id FK`, `method_type ('totp')`, `encrypted_secret TEXT`, `verified_at` | App-scoped |
| `password_reset_tokens` | Single-use hashed password reset tokens | `id UUID PK`, `user_id FK`, `token_hash UNIQUE`, `expires_at`, `used_at` | App-scoped |
| `roles` | 6 platform roles + 8 SME business roles | `id UUID PK`, `code TEXT UNIQUE`, `scope CHECK ('platform','business')`, `name`, `description` | Reference |
| `permissions` | 30 granular action permissions (`analytics:read`, `sales:return`, etc.) | `id UUID PK`, `code TEXT UNIQUE`, `module`, `description` | Reference |
| `role_permissions` | Many-to-many role-to-permission grants (175 seeded mappings) | `PRIMARY KEY (role_id, permission_id)` | Reference |
| `tenants` | Multi-tenant SME organization accounts | `id UUID PK`, `slug UNIQUE`, `legal_name`, `display_name`, `kra_pin`, `industry_code`, `currency_code DEFAULT 'KES'`, `timezone DEFAULT 'Africa/Nairobi'`, `brand_color`, `logo_url`, `onboarding_completed` | Tenant RLS |
| `user_tenant_memberships` | Authorized user membership inside a specific tenant | `id UUID PK`, `user_id FK`, `tenant_id FK`, `UNIQUE(user_id, tenant_id)`, `status` | Tenant RLS |
| `user_role_assignments` | Role assignment(s) per tenant membership | `id UUID PK`, `tenant_id`, `membership_id`, `role_id` | Tenant RLS |

---

## Group 2 & 3: Industry Templates, Branches & Data Sources (`002_tenants_branches_and_imports.sql`)

| Table | Purpose | Key Columns & Constraints | RLS |
|---|---|---|---|
| `industry_templates` | Configurable templates for Retail, Restaurants, Wholesale, Salons, Professional Services, General SME | `code TEXT PK`, `name_en`, `name_sw`, `default_kpis JSONB`, `default_categories JSONB`, `onboarding_checklist JSONB`, `terminology JSONB` | Reference |
| `branches` | Physical shops, depots, restaurants, or service offices per tenant | `id UUID PK`, `tenant_id`, `code`, `name`, `city DEFAULT 'Nairobi'`, `is_headquarters`, `UNIQUE(tenant_id, id)`, `UNIQUE(tenant_id, code)` | Tenant RLS |
| `user_branch_access` | Optional branch-level scope restriction (e.g., `branch_manager` restricted to Kilimani) | `tenant_id`, `membership_id`, `branch_id`, composite FK to `branches(tenant_id, id)` | Tenant RLS |
| `data_sources` | Configured POS, accounting, spreadsheet, M-Pesa, or API ingestion channels | `id UUID PK`, `tenant_id`, `source_type`, `encrypted_config TEXT` (AES-256-GCM), `field_mapping JSONB`, `sync_status` | Tenant RLS |
| `import_jobs` | Full provenance ledger for every CSV/XLSX/JSON/API import | `id UUID PK`, `tenant_id`, `data_source_id`, `target_entity`, `file_name`, `file_sha256`, `status ('uploaded','validating','validated','committing','completed','failed')`, `total_rows`, `valid_rows`, `error_rows`, `duplicate_rows` | Tenant RLS |
| `import_records_staging` | Raw parsed rows persisted prior to validation & commit | `id BIGSERIAL PK`, `tenant_id`, `import_job_id`, `row_number`, `raw_payload JSONB`, `normalized_payload JSONB`, `row_status`, `dedup_hash` | Tenant RLS |
| `import_job_errors` | Row-level validation, mapping & duplicate diagnostics (never silently dropped) | `id BIGSERIAL PK`, `tenant_id`, `import_job_id`, `row_number`, `field_name`, `error_code`, `error_message`, `raw_value` | Tenant RLS |

---

## Group 5, 6, 7 & 8: CRM, Catalog, Immutable Inventory, Sales & Finance (`003_operations_sales_inventory_finance.sql`)

| Table | Purpose | Key Columns & Constraints | RLS |
|---|---|---|---|
| `customers` | SME customer directory with anonymized/erasure support | `id UUID PK`, `tenant_id`, `full_name`, `phone_e164`, `email`, `loyalty_tier`, `total_spend NUMERIC(14,2)`, `order_count`, `anonymized_at` | Tenant RLS |
| `customer_consents` | Kenya DPA 2019 per-channel opt-in/opt-out ledger | `tenant_id`, `customer_id`, `channel CHECK ('sms','whatsapp','voice','ussd','email')`, `status ('granted','revoked','pending')`, `consent_source`, `captured_at`, `revoked_at` | Tenant RLS |
| `product_categories` & `suppliers` | Hierarchical product taxonomy & vendor master | `UNIQUE(tenant_id, id)`, `name`, `kra_pin`, `payment_terms_days` | Tenant RLS |
| `products` | SKU catalog with exact unit prices & reorder thresholds | `id UUID PK`, `tenant_id`, `sku`, `name`, `unit_price NUMERIC(14,2) >= 0`, `cost_price NUMERIC(14,2) >= 0`, `reorder_level NUMERIC(12,3)`, `lead_time_days` | Tenant RLS |
| `inventory_movements` | **Append-only immutable stock ledger** (blocks UPDATE/DELETE via trigger) | `id UUID PK`, `tenant_id`, `branch_id`, `product_id`, `movement_type ('opening_stock','purchase','sale','return','transfer_in','transfer_out','adjustment','wastage')`, `quantity_delta NUMERIC(12,3) CHECK (quantity_delta <> 0)`, `unit_cost NUMERIC(14,2)`, `reason` | Tenant RLS |
| `inventory_alerts` | Reorder & stockout notifications | `tenant_id`, `branch_id`, `product_id`, `alert_type`, `current_qty`, `reorder_level`, `status` | Tenant RLS |
| `sales_transactions` | **Immutable sales & return headers** (returns reference `original_sale_id`) | `id UUID PK`, `tenant_id`, `branch_id`, `receipt_number`, `transaction_type ('sale','return','void_reversal')`, `original_sale_id`, `subtotal_amount NUMERIC(14,2)`, `tax_amount NUMERIC(14,2)`, `discount_amount NUMERIC(14,2)`, `total_amount NUMERIC(14,2)`, `cost_of_goods_sold NUMERIC(14,2)`, `source_import_job_id` | Tenant RLS |
| `sales_transaction_items` | Line-level SKU sales & cost attribution | `tenant_id`, `sale_id`, `product_id`, `quantity NUMERIC(12,3)`, `unit_price NUMERIC(14,2)`, `unit_cost NUMERIC(14,2)`, `line_total NUMERIC(14,2)` | Tenant RLS |
| `sales_payments` | Multi-tender payment breakdown (M-Pesa, Cash, Card, Bank, Credit) | `tenant_id`, `sale_id`, `payment_method`, `amount NUMERIC(14,2)`, `mpesa_receipt_no` | Tenant RLS |
| `expense_categories` & `expenses` | Operating expenses (Rent, Utilities, Payroll, Stock, Transport) | `amount NUMERIC(14,2) > 0`, `expense_date`, `vendor_name`, `payment_method`, `status` | Tenant RLS |
| `cash_accounts` & `cash_transactions` | M-Pesa Till/Paybill, Bank & Petty Cash ledgers + reconciliation status | `account_type ('mpesa_till','mpesa_paybill','bank','cash_drawer')`, `mpesa_receipt_no`, `direction ('inflow','outflow')`, `amount NUMERIC(14,2)`, `reconciliation_status ('unreconciled','matched','discrepancy')`, `matched_sale_id` | Tenant RLS |
| `payables_receivables` | Confirmed supplier bills & customer invoices for cash-flow forecasting | `entry_type ('payable','receivable')`, `counterparty_name`, `amount_due NUMERIC(14,2)`, `due_date`, `status` | Tenant RLS |

---

## Group 9–13: Analytics, Predict, AI, Connect, Billing, Audit & DPA (`004_analytics_predict_ai_connect_billing_audit.sql`)

| Table | Purpose | Key Columns & Constraints | RLS |
|---|---|---|---|
| `kpi_definitions` | Versioned KPI catalog with human-readable formulas | `code TEXT PK`, `name_en`, `name_sw`, `formula_description`, `unit` | Reference |
| `report_templates`, `scheduled_reports`, `report_executions` | Custom report specs, weekly/monthly schedules & generated snapshots | `report_type`, `cadence`, `recipient_emails JSONB`, `result_summary JSONB` | Tenant RLS |
| `forecast_models`, `forecast_runs`, `forecast_points` | Model governance, backtest metrics (`MAE`, `MAPE`, `RMSE`), explicit `insufficient_data` status, 80% & 95% confidence bounds | `forecast_type ('sales','demand','cash_flow')`, `status`, `lower_80`, `upper_80`, `lower_95`, `upper_95`, `confirmed_component`, `estimated_component` | Tenant RLS |
| `anomaly_alerts` | Z-score / MAD statistical outlier alerts | `metric_name`, `metric_date`, `observed_value`, `expected_value`, `z_score`, `severity` | Tenant RLS |
| `ai_conversations`, `ai_messages`, `ai_tool_executions`, `ai_feedback` | EN/SW grounded assistant history, provenance JSONB, whitelisted tool audit trail & thumbs feedback | `language ('en','sw')`, `provenance JSONB`, `supporting_charts JSONB`, `recommendations JSONB`, `tool_name`, `rating CHECK (-1, 1)` | Tenant RLS |
| `communication_providers`, `tenant_communication_channels` | Adapter metadata + AES-256-GCM encrypted provider credentials (Africa's Talking, Meta WhatsApp, SMTP) | `provider_code`, `channel`, `encrypted_credentials TEXT`, `config_status ('unconfigured','configured','verified','error')` | Tenant RLS |
| `message_templates`, `campaigns`, `messages`, `message_delivery_events` | EN/SW templates, consent-filtered campaigns, honest delivery status & idempotent webhook events (`UNIQUE(provider_code, provider_event_id)`) | `status ('queued','pending_provider_config','sent','delivered','failed','blocked_no_consent')`, `provider_message_id` | Tenant RLS |
| `subscription_plans`, `plan_features`, `tenant_subscriptions`, `add_ons`, `tenant_add_ons`, `usage_records`, `invoices` | Configurable KES subscription tiers, backend-enforced feature/quota limits, usage add-ons & billing records | `monthly_price_kes NUMERIC(14,2)`, `feature_code`, `limit_value`, `metric_code` | Mixed (Ref / Tenant RLS) |
| `audit_logs` | **Append-only SHA-256 hash-chained audit ledger** | `id BIGSERIAL PK`, `prev_hash TEXT`, `record_hash TEXT`, `actor_user_id`, `action`, `resource_type`, `changes JSONB` | Tenant RLS (read) |
| `data_subject_requests` & `contact_enquiries` | Kenya DPA 2019 access/correction/export/deletion workflow & public website enquiries | `request_type ('access','correction','erasure','export')`, `retention_override_note`, `status` | Tenant / Platform |
