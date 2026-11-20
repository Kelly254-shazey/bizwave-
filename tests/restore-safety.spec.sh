#!/usr/bin/env bash
# Fast mocked-psql regression: restore must never drop or overwrite a database.
# This complements (but does not replace) a real isolated restore drill.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/bin"
export CALLS="$TMP/calls"
: > "$CALLS"
printf 'mock archive\n' > "$TMP/backup.dump"
(cd "$TMP" && sha256sum backup.dump > backup.dump.sha256)
cat > "$TMP/bin/psql" <<'SH'
#!/usr/bin/env bash
printf 'psql %s\n' "$*" >> "$CALLS"
case "$*" in *'CREATE DATABASE "existing";'*) echo 'database already exists' >&2; exit 1;; esac
# Consume the audit-check heredoc when supplied and ensure failure is explicit.
if [[ "$*" != *' -c '* ]]; then
  script=$(cat)
  [[ "$script" == *'IS DISTINCT FROM TRUE'* && "$script" == *'RAISE EXCEPTION'* ]]
fi
SH
cat > "$TMP/bin/pg_restore" <<'SH'
#!/usr/bin/env bash
printf 'pg_restore %s\n' "$*" >> "$CALLS"
SH
chmod +x "$TMP/bin/psql" "$TMP/bin/pg_restore"
export PATH="$TMP/bin:$PATH"

if "$ROOT/infrastructure/scripts/restore-postgres.sh" "$TMP/backup.dump" existing >/dev/null 2>&1; then
  echo 'FAIL: existing target accepted' >&2; exit 1
fi
! grep -q '^pg_restore ' "$CALLS" || { echo 'FAIL: attempted restore into existing DB' >&2; exit 1; }
if "$ROOT/infrastructure/scripts/restore-postgres.sh" "$TMP/backup.dump" 'bad;DROP DATABASE bizwave' >/dev/null 2>&1; then
  echo 'FAIL: unsafe target accepted' >&2; exit 1
fi
"$ROOT/infrastructure/scripts/restore-postgres.sh" "$TMP/backup.dump" fresh_restore >/dev/null
! grep -qiE 'DROP DATABASE|--clean|--if-exists' "$CALLS" || { echo 'FAIL: destructive restore command detected' >&2; exit 1; }
grep -q '^pg_restore ' "$CALLS" || { echo 'FAIL: fresh restore not attempted' >&2; exit 1; }
echo 'PASS: restore refuses existing/invalid names, checks audit, and never drops a database (mocked commands)'
