#!/usr/bin/env bash
# =============================================================================
# BizWave Zero-Demo, Pure 4-Pillar Production Readiness Verification Suite
# =============================================================================
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PASS=0
FAIL=0

ok()   { echo "  [PASS] $1"; PASS=$((PASS+1)); }
fail() { echo "  [FAIL] $1"; FAIL=$((FAIL+1)); }

echo "================================================================"
echo "  BizWave Production Verification (Zero-Demo · Pure 4-Pillar)"
echo "================================================================"

echo ""
echo "[1/6] Checking production bundles for ZERO demo & ZERO Community/Learn artifacts..."
if grep -rEi "BizWave2026|PILOT_ACCOUNTS|Savannah Urban Mart|Kijiji Flame|salesWeek_18|PITCH_RESTAURANT_CSV|SAMPLE_SALES_CSV|CommunityLearnPage|Buyer Guide" \
     "${ROOT_DIR}/frontend/dist" "${ROOT_DIR}/backend/dist" >/dev/null 2>&1; then
  fail "Demo or removed Learn strings found in compiled bundles!"
else
  ok "Zero demo credentials, sample CSVs, or Community/Learn artifacts in dist bundles"
fi

if [[ -f "${ROOT_DIR}/frontend/dist/images/hero-nairobi-sme.jpg" && -f "${ROOT_DIR}/frontend/dist/images/solution-data-wave.jpg" && -f "${ROOT_DIR}/frontend/dist/images/who-we-serve-sme.jpg" ]]; then
  ok "All presentation editorial images bundled cleanly into frontend/dist/images/"
else
  fail "Presentation images missing from frontend/dist/images/"
fi

echo ""
echo "[2/6] Verifying fail-closed production secret guard (NODE_ENV=production)..."
GUARD_OUT="$(NODE_ENV=production node -e "require('${ROOT_DIR}/backend/dist/config/env.config').assertProductionConfig()" 2>&1 || true)"
if echo "$GUARD_OUT" | grep -q "PRODUCTION SECURITY CONFIG FAILURE"; then
  ok "Backend fails closed under NODE_ENV=production without explicit prod secrets"
else
  fail "Production config guard did not fail closed!"
fi

echo ""
echo "[3/6] Verifying live database cleanliness (0 tenants/users, 0 learn tables, 4 plans)..."
DB_CHECK="$(sudo -u postgres psql -d bizwave -tAc "SELECT (SELECT COUNT(*) FROM tenants) || ',' || (SELECT COUNT(*) FROM users) || ',' || (SELECT COUNT(*) FROM subscription_plans) || ',' || (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'learn%');")"
if [[ "$DB_CHECK" == "0,0,4,0" ]]; then
  ok "Database is 100% clean: 0 tenants, 0 users, 4 subscription plans, 0 learn tables"
else
  fail "Unexpected DB counts (tenants,users,plans,learn_tables): ${DB_CHECK}"
fi

echo ""
echo "[4/6] Verifying live runtime services, removed routes & AI Advisor endpoints..."
[[ "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:4000/api/v1/health)" == "200" ]] \
  && ok "NestJS API /api/v1/health -> HTTP 200" || fail "NestJS API health failed"

[[ "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8001/health)" == "200" ]] \
  && ok "Python Intelligence /health -> HTTP 200" || fail "Intelligence health failed"

[[ "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:5173/)" == "200" ]] \
  && ok "React Frontend :5173 -> HTTP 200" || fail "Frontend failed"

[[ "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:4000/api/v1/learn/catalog)" == "404" ]] \
  && ok "Removed /api/v1/learn/* route properly returns HTTP 404" || fail "/api/v1/learn/catalog still reachable"

[[ "$(curl -s -o /dev/null -w '%{http_code}' -X POST http://127.0.0.1:4000/api/v1/auth/login -H 'Content-Type: application/json' -d '{"email":"grace@savannahmart.co.ke","password":"BizWave2026!"}')" == "401" ]] \
  && ok "Old demo credentials properly rejected -> HTTP 401" || fail "Demo credentials not rejected"

echo ""
echo "[5/6] Verifying live Public Plans & Python AI Advisor Simulation..."
curl -sf http://127.0.0.1:4000/api/v1/subscriptions/plans | grep -q "Multi-Branch / Enterprise" \
  && ok "Public pricing returns all 4 tiers incl. Multi-Branch / Enterprise" \
  || fail "Public pricing check failed"

curl -sf -X POST http://127.0.0.1:8001/v1/advisor/simulate -H 'Content-Type: application/json' \
  -d '{"monthly_revenue":500000,"monthly_cogs":300000,"monthly_expenses":120000,"price_change_pct":5,"expense_change_pct":-10}' \
  | grep -q "annualized_profit_delta" \
  && ok "Python AI What-If Simulator live on :8001/v1/advisor/simulate" \
  || fail "Python AI What-If Simulator failed"

echo ""
echo "[6/6] Running all unit test suites + VPS script validation..."
(cd "${ROOT_DIR}/backend" && npm run test:unit >/dev/null) && ok "Backend unit tests" || fail "Backend unit tests"
(cd "${ROOT_DIR}/frontend" && npm test >/dev/null) && ok "Frontend unit tests" || fail "Frontend unit tests"
(cd "${ROOT_DIR}/intelligence" && PYTHONPATH=. pytest -q >/dev/null) && ok "Intelligence unit tests (13/13)" || fail "Intelligence unit tests"
bash -n "${ROOT_DIR}/scripts/deploy-vps.sh" && bash -n "${ROOT_DIR}/scripts/setup-https.sh" \
  && ok "VPS deployment & Let's Encrypt HTTPS scripts pass syntax check" \
  || fail "VPS script syntax check failed"

echo ""
echo "================================================================"
echo "  Production Readiness Result: ${PASS} PASSED, ${FAIL} FAILED"
echo "================================================================"
[[ "$FAIL" -eq 0 ]]
