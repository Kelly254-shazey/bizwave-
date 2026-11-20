#!/usr/bin/env bash
# Creates only randomly named disposable databases; never targets the live DB.
# Usage: ./tests/migration-regression.sh [psql admin command and options]
# Example: ./tests/migration-regression.sh psql -h 127.0.0.1 -U postgres
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ $# -eq 0 ]]; then PSQL=(sudo -u postgres psql); else PSQL=("$@"); fi
run_sql() { "${PSQL[@]}" -X -v ON_ERROR_STOP=1 "$@"; }
query() { run_sql -d "$1" -tAc "$2"; }
created=()
tmp_dir="$(mktemp -d)"
cleanup() {
  for db in "${created[@]}"; do
    run_sql -d postgres -c "DROP DATABASE \"${db}\" WITH (FORCE);" >/dev/null || true
  done
  rm -rf "$tmp_dir"
}
trap cleanup EXIT
make_db() {
  run_sql -d postgres -c "CREATE DATABASE \"$1\";" >/dev/null
  created+=("$1")
}
check_eq() {
  local expected="$1" actual="$2" message="$3"
  if [[ "$expected" != "$actual" ]]; then
    echo "FAIL: $message: expected '$expected', got '$actual'" >&2
    exit 1
  fi
  echo "PASS: $message"
}

suffix="${RANDOM}_$$"
fresh="bw_mig_fresh_${suffix}"
upgrade="bw_mig_upgrade_${suffix}"
resume="bw_mig_resume_${suffix}"
untracked="bw_mig_untracked_${suffix}"

make_db "$fresh"
"${ROOT_DIR}/scripts/apply-migrations.sh" "${PSQL[@]}" -d "$fresh" >"$tmp_dir/fresh.log" 2>&1 || { cat "$tmp_dir/fresh.log"; exit 1; }
check_eq '8,4,0,0,6' "$(query "$fresh" "SELECT (SELECT count(*) FROM schema_migrations WHERE version ~ '^[0-9]{3}$') || ',' || (SELECT count(*) FROM subscription_plans) || ',' || (SELECT count(*) FROM tenants) || ',' || (SELECT count(*) FROM users) || ',' || (SELECT count(*) FROM metric_definitions)")" 'Fresh migrations and reference-only seed'
"${ROOT_DIR}/scripts/apply-migrations.sh" "${PSQL[@]}" -d "$fresh" >"$tmp_dir/repeat.log" 2>&1 || { cat "$tmp_dir/repeat.log"; exit 1; }
check_eq '8,6,0' "$(query "$fresh" "SELECT (SELECT count(*) FROM schema_migrations WHERE version ~ '^[0-9]{3}$') || ',' || (SELECT count(*) FROM metric_definitions) || ',' || (SELECT count(*) FROM schema_migrations WHERE version='reference_seed_001_pending')")" 'Rerunning does not duplicate seed data'

# Simulate a real version-006 installation with a sale and an audit record.
make_db "$upgrade"
for f in "${ROOT_DIR}"/database/migrations/00[1-6]_*.sql; do
  run_sql -d "$upgrade" --single-transaction < "$f" > /dev/null 2>&1
done
run_sql -d "$upgrade" --single-transaction < "${ROOT_DIR}/database/seeds/001_reference_data_and_plans.sql" >/dev/null
run_sql -d "$upgrade" <<'SQL' >/dev/null
INSERT INTO tenants (id,name,slug,display_name,business_email)
VALUES ('aaaaaaaa-1111-4111-8111-111111111111','Upgrade fixture','upgrade-fixture','Upgrade fixture','upgrade@example.test');
INSERT INTO branches (id,tenant_id,code,name) VALUES
('bbbbbbbb-1111-4111-8111-111111111111','aaaaaaaa-1111-4111-8111-111111111111','HQ','Headquarters');
INSERT INTO sales (tenant_id,branch_id,transaction_ref,source_system,transaction_date,subtotal,total_amount,cost_of_goods_sold)
VALUES ('aaaaaaaa-1111-4111-8111-111111111111','bbbbbbbb-1111-4111-8111-111111111111','UPGRADE-FIXTURE','portal_pos',NOW(),100,100,40);
SELECT fn_append_audit_log('aaaaaaaa-1111-4111-8111-111111111111',NULL,'upgrade@example.test','fixture.created','test','1',NULL,NULL,'{}');
SQL
"${ROOT_DIR}/scripts/apply-migrations.sh" "${PSQL[@]}" -d "$upgrade" >"$tmp_dir/upgrade.log" 2>&1 || { cat "$tmp_dir/upgrade.log"; exit 1; }
check_eq '8,1,actual,6,true' "$(query "$upgrade" "SELECT (SELECT count(*) FROM schema_migrations WHERE version ~ '^[0-9]{3}$') || ',' || (SELECT count(*) FROM tenants) || ',' || (SELECT cost_basis FROM sales WHERE transaction_ref='UPGRADE-FIXTURE') || ',' || (SELECT count(*) FROM metric_definitions) || ',' || (SELECT is_valid FROM fn_verify_audit_chain())")" 'Upgrade applies 007/008 and preserves tenant, sale, seed and audit chain'
check_eq 'true,true,true' "$(query "$upgrade" "SELECT (to_regclass('public.business_directory_profiles') IS NOT NULL) || ',' || (to_regclass('public.website_catalog_links') IS NOT NULL) || ',' || EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='ai_conversations' AND column_name='security_scope')")" 'Upgrade adds directory, catalog links and AI scope'

# Exercise an interrupted fresh seed and a failed migration using a private copy.
mkdir -p "$tmp_dir/project/scripts" "$tmp_dir/project/database/migrations" "$tmp_dir/project/database/seeds"
cp "${ROOT_DIR}/scripts/apply-migrations.sh" "$tmp_dir/project/scripts/"
cp "${ROOT_DIR}"/database/migrations/[0-9][0-9][0-9]_*.sql "$tmp_dir/project/database/migrations/"
printf 'SELECT 1/0;\n' > "$tmp_dir/project/database/seeds/001_reference_data_and_plans.sql"
make_db "$resume"
if "$tmp_dir/project/scripts/apply-migrations.sh" "${PSQL[@]}" -d "$resume" >"$tmp_dir/badseed.log" 2>&1; then
  echo 'FAIL: invalid reference seed unexpectedly succeeded' >&2; exit 1
fi
check_eq '8,1,0' "$(query "$resume" "SELECT (SELECT count(*) FROM schema_migrations WHERE version ~ '^[0-9]{3}$') || ',' || (SELECT count(*) FROM schema_migrations WHERE version='reference_seed_001_pending') || ',' || (SELECT count(*) FROM subscription_plans)")" 'Failed seed rolls back and leaves resumable marker'
cp "${ROOT_DIR}/database/seeds/001_reference_data_and_plans.sql" "$tmp_dir/project/database/seeds/"
"$tmp_dir/project/scripts/apply-migrations.sh" "${PSQL[@]}" -d "$resume" >"$tmp_dir/resume.log" 2>&1 || { cat "$tmp_dir/resume.log"; exit 1; }
check_eq '4,0' "$(query "$resume" "SELECT (SELECT count(*) FROM subscription_plans) || ',' || (SELECT count(*) FROM schema_migrations WHERE version='reference_seed_001_pending')")" 'Interrupted fresh install resumes and seeds once'
cat > "$tmp_dir/project/database/migrations/009_atomic_test.sql" <<'SQL'
CREATE TABLE atomic_test_table (id INTEGER);
SELECT 1/0;
INSERT INTO schema_migrations (version,description) VALUES ('009','test');
SQL
if "$tmp_dir/project/scripts/apply-migrations.sh" "${PSQL[@]}" -d "$resume" >"$tmp_dir/bad-migration.log" 2>&1; then
  echo 'FAIL: invalid migration unexpectedly succeeded' >&2; exit 1
fi
check_eq 'false,0' "$(query "$resume" "SELECT (to_regclass('public.atomic_test_table') IS NOT NULL) || ',' || (SELECT count(*) FROM schema_migrations WHERE version='009')")" 'A failed migration rolls back DDL and registry entry'

make_db "$untracked"
run_sql -d "$untracked" -c 'CREATE TABLE public.untracked_data (id int);' >/dev/null
if "${ROOT_DIR}/scripts/apply-migrations.sh" "${PSQL[@]}" -d "$untracked" >"$tmp_dir/untracked.log" 2>&1; then
  echo 'FAIL: migration accepted an untracked schema' >&2; exit 1
fi
check_eq 'true,false' "$(query "$untracked" "SELECT (to_regclass('public.untracked_data') IS NOT NULL) || ',' || (to_regclass('public.schema_migrations') IS NOT NULL)")" 'Untracked existing schema is refused without alteration'

echo 'Migration regression checks passed; disposable databases removed.'
