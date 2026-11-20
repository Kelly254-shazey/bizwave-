#!/usr/bin/env bash
# Restore a logical backup into a NEW isolated database. Never drop/overwrite
# an existing database. After review, apply runtime grants and use an explicit
# operator-managed cutover procedure. Usage:
#   PGHOST=... PGUSER=postgres ./restore-postgres.sh /path/to/backup.dump new_restore_db
set -euo pipefail

DUMP_FILE="${1:?Usage: $0 <dump_file> [new_target_db]}"
TARGET_DB="${2:-bizwave_restore_verify}"
PGHOST="${PGHOST:-127.0.0.1}"
PGPORT="${PGPORT:-5432}"
PGUSER="${PGUSER:-postgres}"

if [[ ! -f "$DUMP_FILE" ]]; then
  echo "Backup file not found: $DUMP_FILE" >&2
  exit 2
fi
# A strict simple identifier both prevents SQL injection and makes it obvious
# which database will be created. Quoting also preserves capitalization.
if [[ ! "$TARGET_DB" =~ ^[A-Za-z_][A-Za-z0-9_]{0,62}$ ]]; then
  echo "Target database must be a simple PostgreSQL identifier (1–63 characters)." >&2
  exit 2
fi
if [[ -f "${DUMP_FILE}.sha256" ]]; then
  echo "[$(date -u +%FT%TZ)] Verifying SHA-256 checksum..."
  (cd "$(dirname "$DUMP_FILE")" && sha256sum -c "$(basename "${DUMP_FILE}.sha256")")
else
  echo "Warning: checksum file not found; verify the backup by another trusted method." >&2
fi

echo "[$(date -u +%FT%TZ)] Creating NEW target database ${TARGET_DB} (existing databases are never replaced)..."
# CREATE DATABASE fails if it already exists, including on a concurrent create.
# No DROP, --clean, or --if-exists options are used anywhere in this script.
psql -X -v ON_ERROR_STOP=1 -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d postgres \
  -c "CREATE DATABASE \"${TARGET_DB}\";"

echo "[$(date -u +%FT%TZ)] Restoring into ${TARGET_DB}..."
pg_restore --host="$PGHOST" --port="$PGPORT" --username="$PGUSER" --dbname="$TARGET_DB" \
  --no-owner --no-comments --exit-on-error --single-transaction "$DUMP_FILE"

echo "[$(date -u +%FT%TZ)] Checking restored audit chain..."
psql -X -v ON_ERROR_STOP=1 -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$TARGET_DB" <<'SQL'
DO $$
DECLARE result RECORD;
BEGIN
  SELECT * INTO result FROM fn_verify_audit_chain();
  IF result.is_valid IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Audit chain invalid, broken at %', result.broken_at_id;
  END IF;
  RAISE NOTICE 'Audit chain verified: % records', result.checked_records;
END $$;
SQL

echo "[$(date -u +%FT%TZ)] Restore verified in ${TARGET_DB}; configure grants and review before any cutover."
