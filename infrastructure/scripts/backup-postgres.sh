#!/usr/bin/env bash
# =============================================================================
# BizWave PostgreSQL Encrypted Logical Backup Script
# Usage: BACKUP_DIR=/var/backups/bizwave PGHOST=127.0.0.1 ./backup-postgres.sh
# =============================================================================
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/tmp/bizwave-backups}"
PGHOST="${PGHOST:-127.0.0.1}"
PGPORT="${PGPORT:-5432}"
PGDATABASE="${PGDATABASE:-bizwave}"
PGUSER="${PGUSER:-bizwave_owner}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"

mkdir -p "$BACKUP_DIR"
DUMP_FILE="${BACKUP_DIR}/bizwave_${TIMESTAMP}.dump"
SHA_FILE="${DUMP_FILE}.sha256"

echo "[$(date -u +%FT%TZ)] Starting compressed pg_dump of ${PGDATABASE}..."
pg_dump \
  --host="$PGHOST" \
  --port="$PGPORT" \
  --username="$PGUSER" \
  --dbname="$PGDATABASE" \
  --format=custom \
  --compress=9 \
  --no-owner \
  --file="$DUMP_FILE"

sha256sum "$DUMP_FILE" > "$SHA_FILE"

if [[ -n "${BACKUP_GPG_RECIPIENT:-}" ]]; then
  echo "[$(date -u +%FT%TZ)] Encrypting backup with GPG key ${BACKUP_GPG_RECIPIENT}..."
  gpg --batch --yes --encrypt --recipient "$BACKUP_GPG_RECIPIENT" --output "${DUMP_FILE}.gpg" "$DUMP_FILE"
  shred -u "$DUMP_FILE"
  sha256sum "${DUMP_FILE}.gpg" > "${DUMP_FILE}.gpg.sha256"
fi

echo "[$(date -u +%FT%TZ)] Pruning backups older than ${RETENTION_DAYS} days..."
find "$BACKUP_DIR" -type f -name "bizwave_*.dump*" -mtime +"$RETENTION_DAYS" -delete

echo "[$(date -u +%FT%TZ)] Backup completed successfully: ${DUMP_FILE}"
