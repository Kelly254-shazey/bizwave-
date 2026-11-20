# Deployment overview

For the intended VPS workflow, start with [Production VPS deployment](production-vps-deployment-guide.md). Docker/Compose deployment has **not** been run in the local verification environment; treat the scripts as a deployment candidate and test them on staging before using real data.

## Minimum requirements

- Review security, legal, privacy, monitoring, backups and provider limitations. Do not expose a live site before HTTPS is active and tested.
- Use PostgreSQL 17 and Redis, Node.js 20 for builds, and Python 3.12 for the intelligence service. The production Compose file builds all three applications.
- Back up any existing database, audit logs, uploads and encryption keys. The migration runner applies ordered pending migrations transactionally; it refuses an untracked public schema and does not reseed an existing installation. Migration 007 adds cost provenance and backfills qualifying legacy POS rows; review this before upgrade.
- Only `bizwave_app` should be used by the running API. The migration/backup owner has elevated cross-tenant access; it is not a runtime credential. Apply `infrastructure/postgres/grant-runtime-access.sql` after migrations.
- The present source has no connected online billing, outbound messaging, live M-Pesa sync, automated reset email or automatic report delivery. Legal text is draft. Enabling provider fields is not equivalent to integrating providers.

For local development see the root `README.md`. `docker-compose.yml` is a development stack with exposed ports; `docker-compose.prod.yml` and the VPS scripts are the intended separate production configuration. Neither has been end-to-end validated here.
