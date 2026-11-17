#!/usr/bin/env bash
# =============================================================================
# BizWave PostgreSQL Restore & Integrity Verification Script
# Usage: ./restore-postgres.sh /path/to/bizwave_TIMESTAMP.dump [target_db]
# =============================================================================
set -euo pipefail

DUMP_FILE="${1:?Usage: $0 <dump_file> [target_db]}"
TARGET_DB="${2:-bizwave_restore_verify}"
PGHOST="${PGHOST:-127.0.0.1}"
PGPORT="${PGPORT:-5432}"
PGUSER="${PGUSER:-postgres}"

if [[ -f "${DUMP_FILE}.sha256" ]]; then
  echo "[$(date -u +%FT%TZ)] Verifying SHA-256 checksum..."
  sha256sum -c "${DUMP_FILE}.sha256"
fi

echo "[$(date -u +%FT%TZ)] Creating clean target database ${TARGET_DB}..."
psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d postgres -c "DROP DATABASE IF EXISTS ${TARGET_DB};"
psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d postgres -c "CREATE DATABASE ${TARGET_DB};"

echo "[$(date -u +%FT%TZ)] Restoring dump into ${TARGET_DB}..."
pg_restore \
  --host="$PGHOST" \
  --port="$PGPORT" \
  --username="$PGUSER" \
  --dbname="$TARGET_DB" \
  --no-owner \
  --no-comments \
  --exit-on-error \
  --single-transaction \
  "$DUMP_FILE"

echo "[$(date -u +%FT%TZ)] Running audit log SHA-256 hash chain verification..."
psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$TARGET_DB" -c "SELECT * FROM fn_verify_audit_chain();"
echo "[$(date -u +%FT%TZ)] Restore and verification completed for ${TARGET_DB}."
