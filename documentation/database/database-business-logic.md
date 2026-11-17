# BizWave Database Business Logic, Views, Functions, Triggers & RLS

All database-layer business logic lives in versioned SQL migrations (`database/migrations/005_indexes_views_functions_triggers.sql` and `006_row_level_security.sql`) and is continuously verified by `database/tests/test_database_integrity.sql`.

---

## 1. Multi-Tenant Row-Level Security (RLS)

- **Context Function**: `app_current_tenant_id() RETURNS UUID` reads `current_setting('app.tenant_id', true)` and safely casts valid UUID strings (returning `NULL` if unset).
- **Platform Admin Bypass**: `app_is_platform_admin() RETURNS BOOLEAN` returns `TRUE` only when an explicitly audited platform administrator transaction sets `app.platform_admin = 'true'`.
- **Enforcement**: Every tenant-owned table enables `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` and `ALTER TABLE ... FORCE ROW LEVEL SECURITY` with policy:
  ```sql
  USING (tenant_id = app_current_tenant_id() OR app_is_platform_admin())
  WITH CHECK (tenant_id = app_current_tenant_id() OR app_is_platform_admin())
  ```
- **Least-Privilege Runtime Role**: The NestJS API connects exclusively as `bizwave_app` (`NOSUPERUSER NOBYPASSRLS`), preventing any accidental bypass of RLS.

---

## 2. Immutability & Financial Integrity Triggers

1. **`fn_block_immutable_ledger_mutation()`**:
   - Attached `BEFORE UPDATE OR DELETE` on `sales_transactions`, `sales_transaction_items`, `inventory_movements`, and `audit_logs`.
   - Raises `SQLSTATE '42501'` (`Immutable ledger rows cannot be modified or deleted. Record a reversing or adjusting entry instead.`).
   - Guarantees compliance with Kenyan financial accounting standards (KRA auditability) and prevents silent tampering with sales history, inventory movements, or audit logs.
2. **`fn_touch_updated_at()`**:
   - Automatically updates `updated_at = NOW()` on mutable master tables (`tenants`, `branches`, `products`, `customers`, `expenses`, `tenant_subscriptions`, `campaigns`).

---

## 3. Tamper-Evident SHA-256 Audit Hash Chain

- **`fn_append_audit_log(...)`**:
  - Serializes appends using `pg_advisory_xact_lock(hashtext('bizwave_audit_chain'))` to ensure strictly linear sequence ordering under concurrency.
  - Fetches the latest `record_hash` (or `'GENESIS'` for row 1).
  - Computes `SHA-256(prev_hash || '|' || COALESCE(tenant_id::text,'SYSTEM') || '|' || COALESCE(actor_user_id::text,'SYSTEM') || '|' || action || '|' || resource_type || '|' || COALESCE(resource_id,'') || '|' || changes::text || '|' || created_at_iso)` via `pgcrypto::digest(..., 'sha256')`.
- **`fn_verify_audit_log_chain()`**:
  - Recomputes the hash chain sequentially over all rows and returns `(is_valid BOOLEAN, checked_records BIGINT, broken_at_id BIGINT)`. Exposed live in `/api/v1/admin/audit-logs` and verified in CI.

---

## 4. Analytical Views & Materialized View (All `security_invoker = true`)

Because PostgreSQL views execute as the view owner by default unless configured otherwise, **every analytical view in BizWave declares `WITH (security_invoker = true)`** so RLS policies of `bizwave_app` always apply!

| View Name | Purpose |
|---|---|
| `v_current_inventory_levels` | Aggregates `inventory_movements` per `(tenant_id, branch_id, product_id)` into `on_hand_qty`, `inventory_value_cost`, `stock_status` (`out_of_stock`, `low_stock`, `healthy`), and `days_since_last_movement`. |
| `v_daily_sales_summary` | Daily net revenue, gross profit, order volume, return volume, and average order value per `(tenant_id, branch_id, sale_date)` using exact `NUMERIC` arithmetic. |
| `v_monthly_revenue_expenses` | Monthly revenue vs operating expense vs net profit rollup per tenant. |
| `v_product_performance` | Per-SKU revenue, units sold, COGS, gross profit, and gross margin % across branches. |
| `v_branch_performance` | Side-by-side branch KPI comparison (revenue, gross profit, orders, AOV). |
| `v_customer_rfm_metrics` | Recency (days since last order), Frequency (order count), Monetary (`NUMERIC(14,2)` total spend), and consent summary per customer for Predict segmentation. |
| `v_mpesa_reconciliation_summary` | Aggregates M-Pesa & cash account inflows/outflows by `reconciliation_status` (`matched`, `unreconciled`, `discrepancy`). |
| `v_communication_campaign_metrics` | Delivery rate, failure rate, and blocked-no-consent counts per BizWave Connect campaign. |
| `v_tenant_usage_summary` | Real-time branch, user, import, AI query, and message counts per tenant for subscription quota enforcement. |
| `v_data_quality_summary` | Tracks total sales/expense/SKU counts, distinct active sales days, and unresolved import errors to power Data Coverage % indicators. |
| `mv_tenant_daily_analytics` | Materialized view of daily sales & expenses with unique composite index `(tenant_id, branch_id, metric_date)` supporting concurrent refresh (`REFRESH MATERIALIZED VIEW CONCURRENTLY`). |

---

## 5. Analytical Stored Functions

- **`fn_calculate_business_kpis(p_tenant_id UUID, p_start DATE, p_end DATE, p_branch_id UUID DEFAULT NULL)`**:
  - Computes exact `NUMERIC(14,2)` Total Revenue, COGS, Gross Profit, Gross Margin %, Operating Expenses, Net Profit, Order Volume, Return Count, and Average Order Value for any date range and optional branch filter.
  - Used identically by the Executive Dashboard, BizWave AI grounded tools, and PDF/CSV Report Engine so KPI numbers never drift across modules.

---

## 6. Indexing Strategy

- **Tenant-first composite B-tree indexes** (`(tenant_id, transaction_date DESC)`, `(tenant_id, branch_id, product_id)`, `(tenant_id, status)`) ensure index-only/index-range scans within every tenant partition.
- **Trigram GIN indexes** (`pg_trgm` on `products.name`, `customers.full_name`, `customers.phone_e164`) accelerate fast partial-match search across `/api/v1/analytics/search`.
- **Idempotency unique indexes**: `(tenant_id, receipt_number)` on `sales_transactions`, `(provider_code, provider_event_id)` on `message_delivery_events`, and `(tenant_id, import_job_id, dedup_hash)` on `import_records_staging`.
