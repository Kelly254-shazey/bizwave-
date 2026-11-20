# Database business logic and migrations

## Migration and role handling

Use `scripts/apply-migrations.sh` against the intended database with an authorized PostgreSQL administrator. It applies consecutive `001`–`008` scripts with transaction-scoped advisory locks and a migration registry; each migration and registry entry commit together. A fresh install receives reference seed 001 once, including recovery after an interrupted seed. Existing registered databases are not automatically reseeded; an untracked public schema is refused for operator review. Back up first and test an upgrade on a copy.

After migrations, run `infrastructure/postgres/grant-runtime-access.sql` as administrator. It assigns the owner role and grants the restricted runtime role access, while revoking mutation of the migration registry and direct access to the cross-tenant `mv_tenant_daily_analytics` cache. Runtime must use `bizwave_app` without ownership or `BYPASSRLS`; the migration/backup owner has broader rights and is never the API identity.

## Integrity controls

- Tenant-scoped tables use PostgreSQL row-level security; application transactions set tenant context. Individual controllers enforce additional role and branch constraints. The directory deliberately allows reads of published profile fields across tenants but limits writes to the owning tenant.
- Composite tenant foreign keys prevent representative cross-tenant links. `inventory_movements` and `audit_logs` have mutation-prevention triggers. `fn_append_audit_log` appends a chained record and `fn_verify_audit_chain()` verifies the sequence. Do not disable protections to clean up test data.
- Migration 007 adds the opt-in directory and cost provenance; it backfills `actual` for qualifying prior `portal_pos` sales with positive stored costs, leaving uncertain costs unknown. Migration 008 adds AI security scope and source-owned website/product links while preserving old records.
- Reporting views in migration 005 use `security_invoker` where defined. The materialized view does not provide RLS and must not be granted directly to the runtime. The current application does not directly query that cache.
- Forecasts, reports and AI responses are derived records. They do not prove actual cash, delivery or payment; cash-flow provenance and assumptions must be reviewed by a user.

`database/tests/test_database_integrity.sql` creates fixtures within a transaction and rolls it back; it tests representative restricted-role RLS, directory, cost, composite FK and immutable/audit behavior. `tests/migration-regression.sh` uses randomly named disposable databases for fresh, repeat, upgrade, failure and recovery checks and removes those disposable databases afterward. Neither is a complete formal proof of isolation.
