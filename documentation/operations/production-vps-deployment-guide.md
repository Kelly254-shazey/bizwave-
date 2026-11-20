# Production VPS deployment candidate

**Status:** Docker image builds, Compose startup, TLS issuance/renewal and an actual VPS deployment were not tested in the sandbox. Stage and independently review before treating this as production-ready. Billing, outbound communications, password-reset email and report delivery are not connected; legal/privacy text needs approval. See [security](../security/security-and-dpa-2019.md) and [providers](../integrations/integrations-and-providers.md).

## Before deployment

1. Obtain an approved domain, DNS, firewall, Docker Engine/Compose and reliable offsite backups. Take and verify a backup of any existing database, uploads and application encryption keys. Never run against an unreviewed or untracked schema.
2. Review `docker-compose.prod.yml`, `scripts/deploy-vps.sh`, the database migrations, retention and recovery plan on a staging machine. Arrange qualified security and legal review.
3. Decide whether the temporary preview (`PORTAL_FEATURE_GATING_ENABLED=false`) remains appropriate. It opens four feature gates across plans but does not grant permissions or override scope; set `true` if plan gates should apply.
4. Restrict access to the host during bootstrap. The initial Nginx configuration serves **plain HTTP**, including the app, until TLS is configured. Do not use real credentials or data during this phase. Open the port to Let's Encrypt as needed; keep the app otherwise inaccessible until HTTPS works.

## Intended deployment commands

```bash
# Run from the reviewed release source on the staging/target server.
./scripts/deploy-vps.sh app.example.co.ke
./scripts/setup-https.sh app.example.co.ke operator@example.co.ke
```

The first script generates `.env.production` with mode 600 on a fresh install, starts PostgreSQL/Redis, creates a restricted runtime role, applies pending migrations via `scripts/apply-migrations.sh`, grants runtime access and starts the stack. It seeds reference data only on a fresh install; it does not deliberately remove existing business data. It refuses an untracked public schema. It does **not** load demo tenants. Treat the generated file, database passwords, JWT/encryption/webhook secrets and backups as sensitive.

On an existing installation the script uses the existing `.env.production`, checks the requested domain and does not rotate its secrets automatically. `CORS_ORIGINS` must now contain explicit **HTTPS origins only**; remove any old HTTP origin before restarting. Use URL-safe database/Redis passwords as required by the script. Back up before migration; verify both access grants and the audit chain after.

The second script validates that its hostname matches the configured `DOMAIN`, obtains a certificate and installs the HTTPS Nginx configuration. Configure and monitor certificate renewal; the script prints an example cron command. Verify certificate validity, HTTP-to-HTTPS redirect, health endpoints, registration/login, tenant/branch isolation and application behavior on staging before enabling real use.

## Operational cautions

- Production startup rejects weak/default secrets, missing production database credentials and non-HTTPS CORS origins. Supply appropriate unique secrets and keep them out of Git.
- `APP_ENCRYPTION_KEY` must remain available to decrypt previously stored integration credentials. Back it up separately and plan rotations; replacing it without migration can make existing encrypted data unreadable.
- Verify backups, restore to a **new** database, compare audit records, and check runtime privileges before any cutover. The restore script refuses to replace an existing target.
- Monitor API, intelligence, PostgreSQL, Redis, disk, certificate expiry and backups. Set your own service objectives; none are guaranteed by this repository.
- A successful container health check is not proof of provider functionality, legal compliance, application security, disaster recovery or production readiness.
