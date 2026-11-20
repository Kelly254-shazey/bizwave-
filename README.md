# BizWave — SME intelligence and business network

BizWave is a Kenya-focused, multi-tenant business workspace: a public website and a separate authenticated portal for analytics, forecasting, a bilingual assistant, reporting, team management and an opt-in business directory. The interface supports English and Kiswahili. Business data and access depend on the signed-in tenant, role and assigned branches.

## Release status and important limits

This is a **source release candidate**, not proof of a production deployment. Review the [deployment guide](documentation/operations/production-vps-deployment-guide.md), [security notes](documentation/security/security-and-dpa-2019.md) and [QA report](documentation/qa/qa-test-report.md) before using real data. Docker, live provider connections, hosted deployment, load testing and independent security/legal review have not been verified in the local sandbox.

- **Temporary plan preview:** `PORTAL_FEATURE_GATING_ENABLED=false` makes `predict_basic`, `predict_advanced`, `ai_assistant` and `connect_core` available across plans. It does **not** grant permissions, remove tenant/branch restrictions, alter subscriptions or necessarily remove other quotas. Set `true` to restore plan-feature checks.
- **Billing and messaging:** online plan changes, add-on purchases and payment collection are not connected. Billing POSTs return HTTP 503 without changing subscription data. Customer campaign checks record consent but **no outbound SMS, WhatsApp, voice or USSD message is sent**, even when provider credentials are stored. M-Pesa records are data for analysis, not a live payment connection.
- **Website analysis:** analysis is a no-save preview. A separate explicit import can persist eligible products, only with the required permissions. Only explicit positive KES prices are accepted; stock and costs are not inferred, existing unrelated SKUs are never overwritten.
- **Network:** a business appears only after explicitly publishing a profile to other signed-in organizations. Counts describe matching published profiles, not market demand; contact uses a published email or website, not in-app messaging.
- **Forecasts and AI:** results depend on permissions and sufficient recorded data; forecasts are estimates, not guarantees. Cash-flow requires a user-entered current KES balance and reconciled transaction history. An optional voice-provider adapter has not been verified; browser speech depends on browser/device support. Automated password-reset emails and report delivery are not configured.
- The old public Learn/Buyer Guide module and demo accounts are not part of the current application. Historical test suites are quarantined under `tests/legacy/`.

## Repository

| Path | Purpose |
|---|---|
| `frontend/` | React/Vite public site and responsive portal |
| `backend/` | NestJS API, authentication, RBAC and tenant scoping |
| `intelligence/` | FastAPI analytics, forecast and website-analysis service |
| `database/migrations/001_*.sql`–`008_*.sql` | Versioned PostgreSQL schema and access policies |
| `scripts/apply-migrations.sh` | Ordered, transactional, resumable migration runner |
| `documentation/` | Operational, security, integration, API, user and QA guides |
| `tests/` | Current checks, migration tests, mock analyzer and quarantined legacy suites |

## Local development

On a disposable Linux sandbox with PostgreSQL, Redis, Node.js and Python installed, review and run `./scripts/bootstrap-sandbox.sh`. It **does not reset an existing database**; it provisions roles, applies pending migrations and builds the apps. Back up and review any existing `bizwave` database first. Then start in separate terminals:

```bash
(cd intelligence && PYTHONPATH=. uvicorn app.main:app --host 127.0.0.1 --port 8001)
(cd backend && HOST=0.0.0.0 PORT=4000 node dist/main.js)
(cd frontend && npm run dev -- --host 0.0.0.0 --port 5173)
```

Vite proxies `/api` to the local API; the browser uses relative URLs. Register a new test account; there are no seeded pilot credentials. Local-development defaults are not production credentials. For a different environment, use `backend/.env.example` as a reference and pass variables to the processes.

### Local Docker development (not the production stack)

Docker was unavailable during local verification. The following describes the intended development setup; validate it in your own disposable environment. `docker-compose.yml` exposes development ports and is not hardened for public deployment.

```bash
cp .env.example .env                 # development only; set the local postgres password
# Start the database first; wait until healthy.
docker compose up -d postgres redis
docker compose exec -T postgres psql -U postgres -d bizwave -v ON_ERROR_STOP=1 < infrastructure/postgres/init-roles.sql
./scripts/apply-migrations.sh docker compose exec -T postgres psql -U postgres -d bizwave
docker compose exec -T postgres psql -U postgres -d bizwave -v ON_ERROR_STOP=1 < infrastructure/postgres/grant-runtime-access.sql
docker compose up -d --build
```

The example uses the known `bizwave_app_dev_pw` role password and is strictly for local development. The production VPS script generates separate secrets; see the production deployment guide.

## Verification

From the repository root, after installing dependencies:

```bash
(cd backend && npm run test:unit && npm run build)
(cd frontend && npm run test:unit && npm run build)
(cd intelligence && PYTHONPATH=. pytest -q)
(cd backend && npx tsx ../tests/system/evolvability.audit.spec.ts)
./tests/migration-regression.sh
./tests/restore-safety.spec.sh     # mocked commands, not a real restore drill
```

`tests/run-all-tests.sh` also runs database integrity and API integration checks. **They require an explicitly selected disposable local database and API**; integration creates tenants, products and immutable audit entries. Never point it at real or shared data. Set `BIZWAVE_ALLOW_TEST_FIXTURES=1`, `BIZWAVE_TEST_DATABASE_URL`, `BIZWAVE_TEST_OWNER_DATABASE_URL`, and `BIZWAVE_API_URL`; start `tests/mock-intelligence.py` and the API against that same test database. The test runner refuses non-local/non-test database names. See the [QA report](documentation/qa/qa-test-report.md) and `.github/workflows/ci.yml` for an end-to-end example.

`tests/verify-production.sh` is a local built-code/clean-database readiness check, **not** a production deployment certification. Set `BIZWAVE_VERIFY_DB` to a clean test database; intentional existing tenant fixtures should not be deleted to make it pass.

## Documentation

[User guide](documentation/user-guide/sme-user-guide.md) · [API](documentation/api/api-specification.md) · [roles & feature access](documentation/security/rbac-matrix.md) · [integrations](documentation/integrations/integrations-and-providers.md) · [deployment](documentation/operations/production-vps-deployment-guide.md) · [backup & recovery](documentation/operations/backup-and-recovery-runbook.md) · [QA](documentation/qa/qa-test-report.md)
