# BizWave — Enterprise Multi-Tenant SME Intelligence & Customer Communications SaaS

> **Your business. Understood. Your next move. Clear.**
> *Built for Nairobi SMEs, designed to scale across Kenya and East Africa (`KES` · `Africa/Nairobi` · English & Kiswahili).*

BizWave unifies **operational business intelligence (`BizWave Analytics`)**, **forecasting & anomaly detection (`BizWave Predict`)**, a **grounded bilingual assistant (`BizWave AI`)**, **Kenya DPA 2019 consent-first customer communications (`BizWave Connect`)**, and **free Marketplace & Community Literacy (`BizWave Business Coach`, `BizWave Buyer Guide`, `BizWave Community Learn`, with MsingiAI Sauti Kenyan speech integration)** inside one secure, multi-tenant, Apple-minimal SaaS platform.

---

## Platform Modules & Architecture

| Layer | Technology | Path |
|---|---|---|
| **Public Website & Adaptive Portal** | React 18, TypeScript (strict), Vite, Tailwind CSS, TanStack Query, Recharts, React Router, Lucide | `frontend/` |
| **Core REST API & Security Engine** | Node.js 20 LTS, TypeScript, NestJS (`/api/v1`), OpenAPI/Swagger (`/api/docs`), Zod, Argon2id, TOTP MFA, AES-256-GCM, BullMQ, Pino | `backend/` |
| **Predictive Intelligence Engine** | Python 3.13, FastAPI, pandas, NumPy, scikit-learn, statsmodels | `intelligence/` |
| **Multi-Tenant Relational Database** | PostgreSQL 17 (`FORCE ROW LEVEL SECURITY`, composite tenant FKs, `NUMERIC(14,2)`, immutable ledgers, SHA-256 audit hash chain, `mv_tenant_daily_analytics`) | `database/` |
| **Infrastructure & CI/CD** | Docker Compose, Nginx reverse proxy, GitHub Actions CI, automated backup/restore scripts | `infrastructure/`, `.github/workflows/ci.yml` |
| **Enterprise Documentation** | ERD, Data Dictionary, DB Business Logic, API Spec & `openapi.json`, RBAC Matrix, Security & Kenya DPA 2019, Integrations, Deployment/Backup/Ops Runbooks, SME User Guide | `documentation/` |

---

## Seeded Nairobi SME Pilot Accounts

All seeded pilot accounts use password **`BizWave2026!`** (hashed with Argon2id):

| Email | Organization | Role & Scope | Plan |
|---|---|---|---|
| `amina@savannahmart.co.ke` | Savannah Urban Mart Ltd *(+ Auditor on Kijiji Flame)* | **Business Owner** (2 branches: Westlands & Kilimani) | Intelligence |
| `david@savannahmart.co.ke` | Savannah Urban Mart Ltd | **Finance Officer** (Finance, M-Pesa, Reports, Audit) | Intelligence |
| `grace@savannahmart.co.ke` | Savannah Urban Mart Ltd | **Inventory Manager** (Inventory, Predict, Imports) | Intelligence |
| `kelvin@savannahmart.co.ke` | Savannah Urban Mart Ltd | **Branch Manager** (*Strictly scoped to Kilimani Express*) | Intelligence |
| `faith@savannahmart.co.ke` | Savannah Urban Mart Ltd | **Customer Service Agent** (Customers, Sales, Connect) | Intelligence |
| `brian@kijijiflame.co.ke` | Kijiji Flame Bistro Ltd | **Business Owner** (1 branch: Lavington; Connect gated by plan) | Growth |

---

## Quick Start & Automated Verification

### Run All 4 Verification Suites (DB RLS + Python Pytest + NestJS E2E Security + Frontend Strict Build)
```bash
./tests/run-all-tests.sh
```

### Repeatable Sandbox Bootstrap
```bash
./scripts/bootstrap-sandbox.sh
```

### Docker Compose Deployment
```bash
cp .env.example .env
# Populate secrets in .env (see documentation/operations/deployment-guide.md)
docker compose up -d --build
```

---

## Complete Section 22 Deliverables Index

1. **Frontend Source Code** — `frontend/`
2. **Backend API Source Code** — `backend/`
3. **Python Intelligence Service** — `intelligence/`
4. **Normalized PostgreSQL Schema (13 Groups)** — `database/migrations/001`–`006`
5. **Migrations & Rollback Strategy** — `database/migrations/` & `database/migrations/rollback/rollback_all.sql`
6. **Reference & Kenyan SME Seeds** — `database/seeds/001_reference_data_and_plans.sql`, `002_kenyan_sme_demo_tenants.sql`
7. **Entity Relationship Diagram (ERD)** — `documentation/architecture/erd.md`
8. **Data Dictionary** — `documentation/database/data-dictionary.md`
9. **Database Business Logic Documentation** — `documentation/database/database-business-logic.md`
10. **API Specification & OpenAPI JSON** — `documentation/api/api-specification.md`, `documentation/api/openapi.json` (Live Swagger: `/api/docs`)
11. **RBAC & Subscription Entitlement Matrix** — `documentation/security/rbac-matrix.md`
12. **Security Architecture & Kenya DPA 2019 Compliance** — `documentation/security/security-and-dpa-2019.md`
13. **External Provider Integrations Guide** — `documentation/integrations/integrations-and-providers.md`
14. **Automated Test Suites** — `database/tests/test_database_integrity.sql`, `intelligence/tests/test_intelligence.py`, `backend/test/api.integration.spec.ts`, `tests/run-all-tests.sh`
15. **Dockerfiles & Docker Compose** — `docker-compose.yml`, `{frontend,backend,intelligence}/Dockerfile`, `infrastructure/nginx/nginx.conf`
16. **CI/CD Pipeline** — `.github/workflows/ci.yml`
17. **Environment Templates** — `.env.example`, `{backend,intelligence,frontend}/.env.example`
18. **Deployment Guide** — `documentation/operations/deployment-guide.md`
19. **Backup & Recovery Runbook** — `documentation/operations/backup-and-recovery-runbook.md`, `infrastructure/scripts/{backup,restore}-postgres.sh`
20. **Operations Runbook** — `documentation/operations/operations-runbook.md`
21. **SME User Guide (EN/SW)** — `documentation/user-guide/sme-user-guide.md`
22. **QA & Test Automation Report (12 Suites / 95 Checks)** — `documentation/qa/qa-test-report.md`
