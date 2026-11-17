#!/usr/bin/env bash
# =============================================================================
# BizWave Enterprise QA & Full Test Automation Runner (12 Automated Suites)
# Covers:
#   Unit Testing:        Backend TS (12), Frontend TS/i18n (5), Python FastAPI (11)
#   Integration Testing: PostgreSQL RLS/Audit/Triggers (8), Multi-Service API (23)
#   System Testing:      Functional E2E (6), OWASP Security Pentest (8),
#                        Performance & Multi-Tenant Scalability (5),
#                        Usability & Compatibility (6), Disaster Recovery & Resilience (4),
#                        Evolvability & Architecture Fitness (6)
#   Build Verification:  Backend tsc + Frontend strict tsc & Vite production bundle
# =============================================================================
set -euo pipefail

ROOT_DIR="/home/user/bizwave"

echo "============================================================"
echo "[1/12] UNIT: NestJS Backend Crypto, Security & Domain Logic"
echo "============================================================"
(cd "${ROOT_DIR}/backend" && npm run test:unit)

echo "============================================================"
echo "[2/12] UNIT: React Frontend i18n, Formatting & Storage Safety"
echo "============================================================"
(cd "${ROOT_DIR}/frontend" && npm run test:unit)

echo "============================================================"
echo "[3/12] UNIT: Python FastAPI Intelligence Service (pytest)"
echo "============================================================"
(cd "${ROOT_DIR}/intelligence" && PYTHONPATH=. pytest -v)

echo "============================================================"
echo "[4/12] INTEGRATION: PostgreSQL Schema, Immutability & RLS"
echo "============================================================"
PGPASSWORD="${PGPASSWORD:-bizwave_app_dev_pw}" psql -h 127.0.0.1 -U bizwave_app -d bizwave -v ON_ERROR_STOP=1 < "${ROOT_DIR}/database/tests/test_database_integrity.sql"

echo "============================================================"
echo "[5/12] INTEGRATION: NestJS API, RBAC, Multi-Tenant & Learn"
echo "============================================================"
(cd "${ROOT_DIR}/backend" && npm run test:integration)

echo "============================================================"
echo "[6/12] SYSTEM-FUNCTIONAL: E2E SME, Public Buyer & RBAC Flows"
echo "============================================================"
(cd "${ROOT_DIR}/backend" && npx tsx ../tests/system/functional.e2e.spec.ts)

echo "============================================================"
echo "[7/12] SYSTEM-SECURITY: OWASP ASVS Pentest & Isolation Audit"
echo "============================================================"
(cd "${ROOT_DIR}/backend" && npx tsx ../tests/system/security.pentest.spec.ts)

echo "============================================================"
echo "[8/12] SYSTEM-PERFORMANCE & SCALABILITY: Concurrent Load"
echo "============================================================"
(cd "${ROOT_DIR}/backend" && npx tsx ../tests/system/performance.load.spec.ts)

echo "============================================================"
echo "[9/12] SYSTEM-USABILITY & COMPATIBILITY: A11y, i18n, OpenAPI"
echo "============================================================"
(cd "${ROOT_DIR}/backend" && npx tsx ../tests/system/usability.compat.spec.ts)

echo "============================================================"
echo "[10/12] SYSTEM-RECOVERY & RESILIENCE: Live pg_dump/Restore DR"
echo "============================================================"
(cd "${ROOT_DIR}/backend" && npx tsx ../tests/system/recovery.resilience.spec.ts)

echo "============================================================"
echo "[11/12] SYSTEM-EVOLVABILITY: Architecture & Tech-Fitness"
echo "============================================================"
(cd "${ROOT_DIR}/backend" && npx tsx ../tests/system/evolvability.audit.spec.ts)

echo "============================================================"
echo "[12/12] BUILD VERIFICATION: Backend tsc + Frontend Vite Build"
echo "============================================================"
(cd "${ROOT_DIR}/backend" && npm run build)
(cd "${ROOT_DIR}/frontend" && npm run build)

echo ""
echo "✅ ALL 12 BIZWAVE QA & TEST AUTOMATION SUITES PASSED WITH ZERO FAILURES!"
