#!/usr/bin/env bash
# =============================================================================
# BizWave Repeatable Full-Stack Sandbox Bootstrap Script
# Re-provisions PostgreSQL, Redis, Python FastAPI Intelligence, NestJS API,
# and React Vite Frontend from persisted source files under /home/user/bizwave.
# =============================================================================
set -euo pipefail

ROOT_DIR="/home/user/bizwave"
echo "=== [1/5] Ensuring PostgreSQL 17 and Redis are running ==="
sudo service postgresql start || true
sudo service redis-server start || true

echo "=== [2/5] Provisioning PostgreSQL database, roles, migrations & seeds ==="
sudo -u postgres psql -d postgres -tc "SELECT 1 FROM pg_database WHERE datname = 'bizwave'" | grep -q 1 || \
  sudo -u postgres psql -d postgres -c "CREATE DATABASE bizwave;"

sudo -u postgres psql -d bizwave < "${ROOT_DIR}/infrastructure/postgres/init-roles.sql"

TABLE_COUNT=$(sudo -u postgres psql -d bizwave -tAc "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='tenants';")
if [[ "${TABLE_COUNT}" == "0" ]]; then
  for f in "${ROOT_DIR}"/database/migrations/00*.sql; do
    echo "Applying migration: $(basename "$f")"
    sudo -u postgres psql -d bizwave -v ON_ERROR_STOP=1 < "$f"
  done
  sudo -u postgres psql -d bizwave -v ON_ERROR_STOP=1 < "${ROOT_DIR}/database/seeds/001_reference_data_and_plans.sql"
  sudo -u postgres psql -d bizwave -v ON_ERROR_STOP=1 < "${ROOT_DIR}/database/seeds/002_kenyan_sme_demo_tenants.sql"
  sudo -u postgres psql -d bizwave -v ON_ERROR_STOP=1 < "${ROOT_DIR}/database/seeds/003_community_literacy_curriculum.sql"
fi

sudo -u postgres psql -d bizwave -v ON_ERROR_STOP=1 <<'SQL'
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I OWNER TO bizwave_owner;', r.tablename);
  END LOOP;
  FOR r IN SELECT sequencename FROM pg_sequences WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER SEQUENCE public.%I OWNER TO bizwave_owner;', r.sequencename);
  END LOOP;
  FOR r IN SELECT viewname FROM pg_views WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER VIEW public.%I OWNER TO bizwave_owner;', r.viewname);
  END LOOP;
  FOR r IN SELECT matviewname FROM pg_matviews WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER MATERIALIZED VIEW public.%I OWNER TO bizwave_owner;', r.matviewname);
  END LOOP;
  FOR r IN
    SELECT p.oid::regprocedure AS fn
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND (p.proname LIKE 'fn_%' OR p.proname LIKE 'app_%')
  LOOP
    EXECUTE format('ALTER FUNCTION %s OWNER TO bizwave_owner;', r.fn);
  END LOOP;
END $$;
ALTER DATABASE bizwave OWNER TO bizwave_owner;
ALTER SCHEMA public OWNER TO bizwave_owner;
GRANT USAGE ON SCHEMA public TO bizwave_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO bizwave_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO bizwave_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO bizwave_app;
SQL

echo "=== [3/5] Installing Python Intelligence dependencies ==="
pip install --quiet -r "${ROOT_DIR}/intelligence/requirements.txt"

echo "=== [4/5] Installing & building NestJS Backend ==="
(cd "${ROOT_DIR}/backend" && npm install --silent && npm run build)

echo "=== [5/5] Installing & building React Frontend ==="
(cd "${ROOT_DIR}/frontend" && npm install --silent && npm run build)

echo "=== Bootstrap complete! Start services with: ==="
echo "  1) Intelligence: (cd ${ROOT_DIR}/intelligence && uvicorn app.main:app --host 127.0.0.1 --port 8001)"
echo "  2) Backend API:  (cd ${ROOT_DIR}/backend && node dist/main.js)"
echo "  3) Frontend App: (cd ${ROOT_DIR}/frontend && npm run dev -- --host 0.0.0.0 --port 5173)"
