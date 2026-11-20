#!/usr/bin/env bash
# Apply the ordered SQL migrations to a PostgreSQL database without touching
# existing business data. The command supplied as arguments must be a psql
# invocation connected as a migration administrator, for example:
#   ./scripts/apply-migrations.sh psql -h localhost -U postgres -d bizwave
#   ./scripts/apply-migrations.sh docker exec -i bizwave-postgres psql -U postgres -d bizwave
# Each migration, including its registry entry, commits as a single transaction.
set -euo pipefail

if [[ $# -eq 0 ]]; then
  echo "Usage: $0 <psql command and connection arguments>" >&2
  exit 2
fi
PSQL=("$@")
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
shopt -s nullglob
migrations=("${ROOT_DIR}"/database/migrations/[0-9][0-9][0-9]_*.sql)
if [[ ${#migrations[@]} -eq 0 ]]; then
  echo "No versioned migrations found." >&2
  exit 1
fi

# Initialize a fresh registry only in an otherwise empty public schema. The
# pending seed marker survives an interrupted install, but is never inserted
# into an existing registry, so an upgrade does not silently reseed live data.
"${PSQL[@]}" -X -v ON_ERROR_STOP=1 --single-transaction <<'SQL'
SELECT pg_advisory_xact_lock(918273646);
SELECT to_regclass('public.schema_migrations') IS NOT NULL AS has_registry,
       EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
               WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','f')) AS has_objects \gset
\if :has_registry
  \echo Using existing migration registry.
\else
  \if :has_objects
    DO $$ BEGIN RAISE EXCEPTION 'Untracked public schema: back up and review it before migrating'; END $$;
  \else
    CREATE TABLE public.schema_migrations (
      version VARCHAR(64) PRIMARY KEY,
      description TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    INSERT INTO public.schema_migrations (version, description)
    VALUES ('reference_seed_001_pending', 'Fresh-install reference seed pending');
  \endif
\endif
SQL

expected=1
for file in "${migrations[@]}"; do
  name="$(basename "$file")"
  version="${name%%_*}"
  if [[ ! "$version" =~ ^[0-9]{3}$ ]] || (( 10#$version != expected )); then
    echo "Migration files must be numbered consecutively starting at 001: $name" >&2
    exit 1
  fi
  expected=$((expected + 1))
  echo "Checking migration ${version}: ${name}"
  {
    echo 'SELECT pg_advisory_xact_lock(918273646);'
    printf "SELECT EXISTS (SELECT 1 FROM public.schema_migrations WHERE version='%s') AS already_applied \\gset\n" "$version"
    echo '\if :already_applied'
    printf '  \\echo Migration %s already applied.\n' "$version"
    echo '\else'
    cat "$file"
    printf '\nDO $check$ BEGIN IF NOT EXISTS (SELECT 1 FROM public.schema_migrations WHERE version='"'"'%s'"'"') THEN RAISE EXCEPTION '"'"'Migration %s did not record its version'"'"'; END IF; END $check$;\n' "$version" "$version"
    echo '\endif'
  } | "${PSQL[@]}" -X -v ON_ERROR_STOP=1 --single-transaction
 done

# The reference seed and removal of the pending marker commit together. On an
# older, already provisioned database the marker is absent and no seed is run.
{
  echo 'SELECT pg_advisory_xact_lock(918273646);'
  echo "SELECT EXISTS (SELECT 1 FROM public.schema_migrations WHERE version='reference_seed_001_pending') AS seed_pending \gset"
  echo '\if :seed_pending'
  echo '  \echo Installing production reference seed 001.'
  cat "${ROOT_DIR}/database/seeds/001_reference_data_and_plans.sql"
  echo "DELETE FROM public.schema_migrations WHERE version='reference_seed_001_pending';"
  echo "INSERT INTO public.schema_migrations (version, description) VALUES ('reference_seed_001', 'Fresh-install production reference seed 001');"
  echo '\else'
  echo '  \echo Existing installation: reference seed not reapplied.'
  echo '\endif'
} | "${PSQL[@]}" -X -v ON_ERROR_STOP=1 --single-transaction

echo "Database migrations complete."
