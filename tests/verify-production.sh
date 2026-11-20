#!/usr/bin/env bash
# Readiness checks for built bundles, an explicitly selected clean test DB, and
# running services. This is not a substitute for deploying the Docker stack.
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERIFY_DB="${BIZWAVE_VERIFY_DB:-bizwave}"
API_BASE="${BIZWAVE_VERIFY_API_BASE:-http://127.0.0.1:4000}"
INTELLIGENCE_BASE="${BIZWAVE_VERIFY_INTELLIGENCE_BASE:-http://127.0.0.1:8001}"
FRONTEND_BASE="${BIZWAVE_VERIFY_FRONTEND_BASE:-http://127.0.0.1:5173}"
PASS=0
FAIL=0
ok()   { echo "  [PASS] $1"; PASS=$((PASS+1)); }
fail() { echo "  [FAIL] $1"; FAIL=$((FAIL+1)); }

echo "=== BizWave built-code and clean-database verification ==="
echo "Database check: ${VERIFY_DB}; API: ${API_BASE} (ensure they are the intended test instances)."

if [[ ! -d "${ROOT_DIR}/frontend/dist" || ! -d "${ROOT_DIR}/backend/dist" ]]; then
  fail 'Build bundles are missing; build backend and frontend first'
elif grep -rEi 'BizWave2026|PILOT_ACCOUNTS|Savannah Urban Mart|Kijiji Flame|salesWeek_18|PITCH_RESTAURANT_CSV|SAMPLE_SALES_CSV|CommunityLearnPage|Buyer Guide' \
    "${ROOT_DIR}/frontend/dist" "${ROOT_DIR}/backend/dist" >/dev/null 2>&1; then
  fail 'Demo or removed Learn strings found in compiled bundles'
else
  ok 'Compiled bundles contain no checked demo or removed Learn strings'
fi
if [[ -f "${ROOT_DIR}/frontend/dist/images/hero-nairobi-sme.jpg" && -f "${ROOT_DIR}/frontend/dist/images/solution-data-wave.jpg" && -f "${ROOT_DIR}/frontend/dist/images/who-we-serve-sme.jpg" ]]; then
  ok 'Editorial images are included in the frontend bundle'
else
  fail 'Editorial images missing from frontend bundle'
fi
GUARD_OUT="$(env -u JWT_SECRET -u APP_ENCRYPTION_KEY -u WEBHOOK_SIGNING_SECRET -u DATABASE_URL NODE_ENV=production \
  node -e "require('${ROOT_DIR}/backend/dist/config/env.config').assertProductionConfig()" 2>&1 || true)"
if echo "$GUARD_OUT" | grep -q 'PRODUCTION SECURITY CONFIG FAILURE'; then
  ok 'Production secret guard fails closed when secrets are absent'
else
  fail 'Production secret guard did not fail closed'
fi
DB_CHECK="$(sudo -u postgres psql -d "$VERIFY_DB" -tAc "SELECT (SELECT COUNT(*) FROM tenants) || ',' || (SELECT COUNT(*) FROM users) || ',' || (SELECT COUNT(*) FROM subscription_plans) || ',' || (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'learn%');" 2>/dev/null || true)"
if [[ "$DB_CHECK" == '0,0,4,0' ]]; then
  ok 'Selected test DB: zero tenants/users, four plans and no Learn tables'
else
  fail "Selected DB is not a clean reference install (tenants,users,plans,learn_tables: ${DB_CHECK:-unavailable})"
fi

curl -sf "$API_BASE/api/v1/health" | grep -q '"status":"ok"' \
  && ok 'API health reports OK' || fail 'API health failed'
curl -sf "$INTELLIGENCE_BASE/health" | grep -q '"status":"healthy"' \
  && ok 'Intelligence health reports healthy' || fail 'Intelligence health failed'
[[ "$(curl -s -o /dev/null -w '%{http_code}' "$FRONTEND_BASE/" || true)" == '200' ]] \
  && ok 'Frontend responds with HTTP 200' || fail 'Frontend failed'
[[ "$(curl -s -o /dev/null -w '%{http_code}' "$API_BASE/api/v1/learn/catalog" || true)" == '404' ]] \
  && ok 'Removed Learn catalog responds with HTTP 404' || fail 'Removed Learn route check failed'
[[ "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API_BASE/api/v1/auth/login" -H 'Content-Type: application/json' -d '{"email":"grace@savannahmart.co.ke","password":"BizWave2026!"}' || true)" == '401' ]] \
  && ok 'Old demo credentials are rejected' || fail 'Old demo login was not rejected'
curl -sf "$API_BASE/api/v1/subscriptions/plans" | grep -q 'Multi-Branch / Enterprise' \
  && ok 'Reference plan catalog is available' || fail 'Plan catalog check failed'
curl -sf -X POST "$INTELLIGENCE_BASE/v1/advisor/simulate" -H 'Content-Type: application/json' \
  -d '{"monthly_revenue":500000,"monthly_cogs":300000,"monthly_expenses":120000,"price_change_pct":5,"expense_change_pct":-10}' \
  | grep -q 'annualized_profit_delta' \
  && ok 'Intelligence what-if simulation responds' || fail 'Intelligence simulation failed'

(cd "${ROOT_DIR}/backend" && npm run test:unit >/dev/null) && ok 'Backend unit suite' || fail 'Backend unit suite'
(cd "${ROOT_DIR}/frontend" && npm run test:unit >/dev/null) && ok 'Frontend unit suite' || fail 'Frontend unit suite'
(cd "${ROOT_DIR}/intelligence" && PYTHONPATH=. pytest -q >/dev/null) && ok 'Intelligence pytest suite' || fail 'Intelligence pytest suite'
bash -n "${ROOT_DIR}/scripts/deploy-vps.sh" "${ROOT_DIR}/scripts/apply-migrations.sh" \
  "${ROOT_DIR}/scripts/bootstrap-sandbox.sh" "${ROOT_DIR}/scripts/setup-https.sh" \
  && ok 'Deployment scripts pass shell syntax checks' || fail 'Deployment shell syntax check failed'

echo "=== Verification: ${PASS} passed, ${FAIL} failed ==="
[[ "$FAIL" -eq 0 ]]
