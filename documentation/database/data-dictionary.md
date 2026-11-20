# Database dictionary — key objects

The migrations `001`–`008` are the source of truth for full column names, constraints, defaults, policies and indexes. Most tenant-owned operational tables include `tenant_id`; many cross-table relationships use composite tenant keys. Reference tables and global identity objects have different policies; do not assume all tables have identical isolation rules.

| Objects | Purpose and cautions |
|---|---|
| `tenants`, `branches`, `users`, `user_roles`, `role_permissions`, `user_branch_assignments` | Organization identity, roles, permissions and scope; inactive/expired roles do not grant access. |
| `products`, `inventory`, `inventory_movements`, `sales`, `sales_items`, `sales_payments` | Catalog, branch stock, immutable movements and recorded sales. `sales.cost_basis` distinguishes `unknown`, `actual`, `estimated`; zero is not evidence of a known cost. |
| `cash_accounts`, `cash_transactions`, `expenses`, `payables`, `receivables` | Recorded financial history and obligations. Cash-flow estimates use entered current balance plus reconciled KES movements and eligible future obligations. |
| `customers`, `customer_consents`, `customer_interactions` | Customer data and per-channel/purpose consent records. Deletion requests are reviewed, not automatically fulfilled. |
| `business_directory_profiles` | One optional profile per tenant. Published fields can be read by authorized directory users; private profiles remain tenant-owned. |
| `data_sources`, `data_import_jobs`, `website_catalog_links` | Import sources/jobs and source-owned website catalog mappings. A preview creates none of these; an explicit eligible import persists them. |
| `forecast_runs`, `forecast_values`, `prediction_explanations` | Forecast results and provenance, including insufficient-data status. Forecasts do not replace source transactions. |
| `ai_conversations`, `ai_messages`, `ai_usage_records` | Assistant history, usage and creation-time `security_scope`. Legacy unscoped threads are hidden, not deleted. |
| `communication_channels`, `communication_accounts`, `communication_templates`, `communication_campaigns`, `communication_messages` | Provider metadata, encrypted credentials, drafts and consent-check logs. No outbound delivery is implemented. |
| `subscription_plans`, `plan_features`, `plan_limits`, `subscriptions`, `tenant_add_ons`, `subscription_invoices` | Reference catalog, entitlements and historical billing data. Online purchases are disabled. |
| `audit_logs`, `schema_migrations` | Append-only audit chain and migration registry. The runtime cannot mutate the migration registry. |
| `mv_tenant_daily_analytics` | Cross-tenant materialized cache, not directly readable by the runtime app role; materialized views do not enforce RLS. |

Use `information_schema` and the SQL migrations for exact numeric precision and time-zone behavior rather than assuming a uniform precision or default across every column. Run privileged cross-tenant queries only under authorized operational procedures.
