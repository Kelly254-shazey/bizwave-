# BizWave Backup, Recovery & Disaster Continuity Runbook

## 1. Recovery Objectives
- **RPO (Recovery Point Objective)**: `<= 15 minutes` (with PostgreSQL WAL archiving / PITR enabled in production) or `<= 24 hours` (daily logical encrypted backups for starter deployments).
- **RTO (Recovery Time Objective)**: `<= 60 minutes` for full database + application service restoration.

---

## 2. Backup Architecture

| Component | Backup Mechanism | Frequency | Retention | Encryption |
|---|---|---|---|---|
| **PostgreSQL (`bizwave`)** | `infrastructure/scripts/backup-postgres.sh` (`pg_dump --format=custom --compress=9`) + SHA-256 checksum | Daily 02:00 EAT (`Africa/Nairobi`) | 30 days daily, 12 months monthly | GPG / KMS AES-256 |
| **PostgreSQL WAL Logs** | `archive_mode = on` -> S3/GCS encrypted bucket (`pgBackRest` / `WAL-G`) | Continuous (15m max) | 14 days | Server-side KMS |
| **Encryption Master Key** | Cloud KMS / Offline sealed break-glass vault (stored **separately** from DB backups) | On rotation | All active key versions | HSM / KMS |
| **Redis** | AOF persistence (`appendonly yes`); queues are reconstructible from PostgreSQL job tables (`import_jobs`, `forecast_runs`, `scheduled_reports`) | Continuous | 7 days | Disk encryption |

---

## 3. Executing an Ad-Hoc Backup
```bash
export PGHOST=127.0.0.1
export PGUSER=bizwave_owner
export PGPASSWORD="<owner_password>"
export BACKUP_DIR="/var/backups/bizwave"
export BACKUP_GPG_RECIPIENT="ops@bizwave.co.ke" # optional for GPG encryption

./infrastructure/scripts/backup-postgres.sh
```

---

## 4. Restoration & Verification Procedure (Monthly Fire Drill)

1. **Download Backup & Checksum** from off-site encrypted bucket.
2. **Decrypt** (if GPG-encrypted):
   ```bash
   gpg --decrypt bizwave_20261116T020000Z.dump.gpg > bizwave_restore.dump
   ```
3. **Run Restore & Integrity Script** into an isolated staging database first:
   ```bash
   PGUSER=postgres PGPASSWORD="<admin_pw>" \
     ./infrastructure/scripts/restore-postgres.sh bizwave_restore.dump bizwave_restore_verify
   ```
4. **Mandatory Post-Restore Validations**:
   - Confirm `fn_verify_audit_log_chain()` returns `is_valid = true` and expected record count.
   - Verify non-superuser `bizwave_app` still has `NOBYPASSRLS` (`SELECT rolbypassrls FROM pg_roles WHERE rolname = 'bizwave_app'` -> `f`).
   - Run `database/tests/test_database_integrity.sql` as `bizwave_app`.
   - Refresh materialized view: `REFRESH MATERIALIZED VIEW CONCURRENTLY mv_tenant_daily_analytics;`.
5. **Production Cutover**: Put reverse proxy into maintenance mode (`503`), stop NestJS workers, rename databases atomically, start services, and verify `/api/v1/admin/system-health`.
