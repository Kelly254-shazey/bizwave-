# Backup and recovery runbook

Backups, offsite storage, encryption, WAL archiving, retention schedules and restoration drills are **operator responsibilities**. No recovery-point or recovery-time objective has been demonstrated by this release. Back up PostgreSQL, uploaded files and configuration/secrets, particularly `APP_ENCRYPTION_KEY` (stored separately from data). Restrict cross-tenant backup access. Test restores regularly.

## Logical PostgreSQL backup

`infrastructure/scripts/backup-postgres.sh` uses `pg_dump` in custom format and creates a SHA-256 checksum. Files default to owner-only permissions. **The dump is plaintext unless `BACKUP_GPG_RECIPIENT` is set**; with GPG it is encrypted after an intermediate plaintext dump. Handle temporary files, secure storage and the GPG key appropriately. The script's local age-based pruning is not an offsite backup policy. The backup DB role must have the rights to capture all required tenant rows.

```bash
export PGHOST=127.0.0.1 PGDATABASE=bizwave PGUSER=bizwave_owner
export BACKUP_DIR=/secure/backups/bizwave
# Supply PGPASSWORD securely, or use a protected PostgreSQL password file.
# Optional: BACKUP_GPG_RECIPIENT=your-backup-key-id
./infrastructure/scripts/backup-postgres.sh
```

The production Compose database is internal, so arrange an approved container/host access method and verify it before relying on these generic host commands. Separately back up the uploads volume and encryption secrets.

## Restore safely into a new isolated database

1. Verify the backup checksum; for a GPG-encrypted backup verify the encrypted file's checksum first, then decrypt to a protected temporary file. Keep the key separate.
2. Choose a **new** database name. The restore script validates the name and runs `CREATE DATABASE`; it refuses existing targets and never drops or overwrites them. It restores with `--single-transaction` and fails if `fn_verify_audit_chain()` is invalid. A failed attempt may leave its newly created database for diagnosis.

   ```bash
   PGUSER=postgres PGHOST=127.0.0.1 \
     ./infrastructure/scripts/restore-postgres.sh /secure/backup/bizwave_....dump bizwave_restore_review_001
   ```

3. Compare tenant, sales, upload and audit counts with the source backup; review data and restore logs. The backup uses `--no-owner`, so provision the appropriate roles and apply `infrastructure/postgres/grant-runtime-access.sql` to the restored target before testing the restricted app role. Validate RLS, branch access and application health in an isolated environment.
4. Plan an operator-approved production cutover, including maintenance, connection draining, correct credentials, uploads, DNS, rollback and post-cutover checks. Do not run restore or integration fixture tests against an existing live database.

The local sandbox verification exercised a logical dump, refusal of an existing and invalid target, restore to a separate new database and audit-chain verification. This is not a tested offsite, encrypted or full Docker disaster-recovery exercise.
