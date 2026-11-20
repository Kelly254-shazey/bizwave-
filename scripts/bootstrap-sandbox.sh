#!/usr/bin/env bash
# =============================================================================
# BizWave Repeatable Full-Stack Sandbox Bootstrap Script
# Re-provisions PostgreSQL, Redis, Python FastAPI Intelligence, NestJS API,
# and React Vite Frontend from persisted source files under /home/user/bizwave.
# =============================================================================
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
echo "=== [1/5] Ensuring PostgreSQL 17 and Redis are running ==="
sudo service postgresql start || true
sudo service redis-server start || true

echo "=== [2/5] Provisioning PostgreSQL database, roles, migrations & seeds ==="
sudo -u postgres psql -d postgres -tc "SELECT 1 FROM pg_database WHERE datname = 'bizwave'" | grep -q 1 || \
  sudo -u postgres psql -d postgres -c "CREATE DATABASE bizwave;"

sudo -u postgres psql -d bizwave < "${ROOT_DIR}/infrastructure/postgres/init-roles.sql"

"${ROOT_DIR}/scripts/apply-migrations.sh" sudo -u postgres psql -d bizwave

sudo -u postgres psql -d bizwave -v ON_ERROR_STOP=1 \
  < "${ROOT_DIR}/infrastructure/postgres/grant-runtime-access.sql"
sudo -u postgres psql -d bizwave -v ON_ERROR_STOP=1 -c 'ALTER DATABASE bizwave OWNER TO bizwave_owner;'

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
