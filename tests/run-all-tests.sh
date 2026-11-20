#!/usr/bin/env bash
# Current-release test runner. Integration creates fixtures and audit records;
# never point it at a real or shared installation. See README for setup.
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo '=== Backend unit tests ==='
(cd "${ROOT_DIR}/backend" && npm run test:unit)
echo '=== Frontend unit tests ==='
(cd "${ROOT_DIR}/frontend" && npm run test:unit)
echo '=== Intelligence tests ==='
(cd "${ROOT_DIR}/intelligence" && PYTHONPATH=. pytest -q)
echo '=== Architecture fitness checks ==='
(cd "${ROOT_DIR}/backend" && npx tsx ../tests/system/evolvability.audit.spec.ts)
echo '=== Production builds ==='
(cd "${ROOT_DIR}/backend" && npm run build)
(cd "${ROOT_DIR}/frontend" && npm run build)
echo '=== Disposable database migration regression ==='
"${ROOT_DIR}/tests/migration-regression.sh"
echo '=== Restore target safety (mocked PostgreSQL commands) ==='
"${ROOT_DIR}/tests/restore-safety.spec.sh"

if [[ -z "${BIZWAVE_TEST_DATABASE_URL:-}" || -z "${BIZWAVE_TEST_OWNER_DATABASE_URL:-}" || "${BIZWAVE_ALLOW_TEST_FIXTURES:-}" != '1' ]]; then
  echo 'NOT RUN: database integrity and API integration require a disposable local test DB and API.' >&2
  echo 'Set BIZWAVE_TEST_DATABASE_URL, BIZWAVE_TEST_OWNER_DATABASE_URL, BIZWAVE_API_URL and BIZWAVE_ALLOW_TEST_FIXTURES=1; see README.' >&2
  exit 2
fi

# Even the rolled-back integrity suite must never be aimed at a real database.
# Also ensure its URL and the integration owner URL refer to the same local DB.
python3 - <<'PY'
import os, sys
from urllib.parse import urlparse
app = urlparse(os.environ['BIZWAVE_TEST_DATABASE_URL'])
owner = urlparse(os.environ['BIZWAVE_TEST_OWNER_DATABASE_URL'])
api = urlparse(os.environ.get('BIZWAVE_API_URL', 'http://127.0.0.1:4000/api/v1'))
local = {'localhost', '127.0.0.1', '::1'}
name = owner.path.lstrip('/')
if (app.scheme not in ('postgres', 'postgresql') or owner.scheme not in ('postgres', 'postgresql')
    or app.hostname not in local or owner.hostname not in local or api.hostname not in local
    or app.path != owner.path or (app.port or 5432) != (owner.port or 5432)
    or not (name.startswith('bw_qa_') or name.startswith('bizwave_test') or name.startswith('bizwave_ci'))):
    sys.exit('Refusing non-local, non-test or mismatched database/API URLs.')
PY

echo '=== Database isolation / immutability (transaction is rolled back) ==='
psql "$BIZWAVE_TEST_DATABASE_URL" -v ON_ERROR_STOP=1 < "${ROOT_DIR}/database/tests/test_database_integrity.sql"
echo '=== API integration (fixtures remain in disposable database) ==='
(cd "${ROOT_DIR}/backend" && npm run test:integration)
echo '=== All current configured release checks passed ==='
