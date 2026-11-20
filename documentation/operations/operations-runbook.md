# Operations runbook

## Status and health

Confirm the intended environment before running commands. The API health endpoint is `/api/v1/health`, the intelligence health endpoint is `/health`, and the browser application uses relative `/api` routes. In a Compose deployment inspect `docker compose --env-file .env.production -f docker-compose.prod.yml ps` and service logs. Do not put tokens, customer records or provider credentials into tickets or logs.

Monitor database connections/storage, Redis, API errors/latency, intelligence availability, certificate expiry, migration status, backup jobs and restore tests. Define and test your own alert thresholds and recovery objectives; no production SLA is established here. The process-local rate limits do not provide shared limits across multiple API instances.

## Common incidents

- **Forecast unavailable / insufficient data:** check the user's `predict:*` permissions, permitted branches, intelligence health and recorded history. Cash-flow additionally needs a current KES balance, whole-business finance access, 10 reconciled inflow days and at least one reconciled outflow.
- **Website analysis fails:** verify a public HTTP(S) website and service health. Private/loopback addresses, unsafe redirects, oversized/compressed responses and unsupported pages are rejected. Analysis does not save; importing needs additional permissions.
- **Customer messaging not sent:** expected in this release. Consent checks and provider settings do not implement outbound delivery; do not mark campaigns as sent manually.
- **Billing / password-reset email / report email unavailable:** expected. Online purchases and automated email delivery are not connected. Escalate to the operator; do not fabricate invoices or delivery.
- **Access denied or data missing:** inspect active, unexpired role/permission and branch assignments, current tenant, and whether plan gates have been restored. Do not broaden access merely to clear an error. Legacy AI threads without security scope remain hidden.
- **Audit verification failure:** preserve evidence, restrict access and investigate with security staff. Do not disable immutability triggers or delete audit rows to make checks pass.

## Safe maintenance

Use `scripts/apply-migrations.sh` and review the [deployment](deployment-guide.md) and [backup](backup-and-recovery-runbook.md) notes. Back up before modifying an existing installation. `scripts/bootstrap-sandbox.sh` targets a local `bizwave` database; it is not a recovery reset and must not be run blindly on production. Integration tests create durable fixtures and must use a disposable local database.
