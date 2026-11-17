# BizWave Production & Staging Deployment Guide

## 1. Prerequisites
- Docker Engine 24+ & Docker Compose v2 (for containerized production/staging deployment), OR Node.js 20 LTS, Python 3.13+, PostgreSQL 17+, and Redis 7+ (for bare-metal/VM deployment).
- Valid TLS certificate (e.g., Let's Encrypt / Cloudflare / AWS ACM) terminating HTTPS in front of Nginx.

---

## 2. Generate Production Cryptographic Secrets

Never reuse development secrets. Generate strong 256-bit keys:
```bash
cp .env.example .env
# Generate unique 64-character hex secrets for JWT_ACCESS_SECRET, JWT_REFRESH_SECRET,
# ENCRYPTION_MASTER_KEY, and WEBHOOK_SIGNING_SECRET:
openssl rand -hex 32
openssl rand -hex 32
openssl rand -hex 32
openssl rand -hex 32
```
Store `ENCRYPTION_MASTER_KEY` in a dedicated Secrets Manager (AWS Secrets Manager, GCP Secret Manager, or HashiCorp Vault) with key-rotation procedures; losing it renders stored AES-256-GCM integration credentials unreadable.

---

## 3. Containerized Deployment (Docker Compose)

```bash
# 1. Start PostgreSQL & Redis first
docker compose up -d postgres redis

# 2. Provision least-privilege roles & apply versioned SQL migrations (never ORM auto-sync!)
docker compose exec -T postgres psql -U "$POSTGRES_ADMIN_USER" -d bizwave < infrastructure/postgres/init-roles.sql
for f in database/migrations/00*.sql; do
  echo "Running $f..."
  docker compose exec -T postgres psql -U "$POSTGRES_ADMIN_USER" -d bizwave -v ON_ERROR_STOP=1 < "$f"
done

# 3. Seed reference data (plans, roles, permissions, industry templates, KPI catalog)
docker compose exec -T postgres psql -U "$POSTGRES_ADMIN_USER" -d bizwave -v ON_ERROR_STOP=1 < database/seeds/001_reference_data_and_plans.sql

# (Staging/Demo ONLY — omit in production!)
# docker compose exec -T postgres psql -U "$POSTGRES_ADMIN_USER" -d bizwave -v ON_ERROR_STOP=1 < database/seeds/002_kenyan_sme_demo_tenants.sql

# 4. Grant runtime privileges to non-superuser bizwave_app
docker compose exec -T postgres psql -U "$POSTGRES_ADMIN_USER" -d bizwave -c "
  GRANT USAGE ON SCHEMA public TO bizwave_app;
  GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO bizwave_app;
  GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO bizwave_app;
  GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO bizwave_app;
"

# 5. Build and launch Intelligence, Backend API, Frontend, and Nginx Reverse Proxy
docker compose up -d --build
```

---

## 4. Post-Deployment Verification Checklist
1. **Database RLS & Integrity**: Run `database/tests/test_database_integrity.sql` as `bizwave_app` and confirm all 6 assertions pass.
2. **Liveness Checks**:
   - `GET /api/v1/health` -> `{"status":"ok","dbLatencyMs":...}`
   - `GET http://intelligence:8001/health` -> `{"status":"ok","service":"bizwave-intelligence"}`
   - `GET /api/docs` -> Swagger UI loads cleanly (disable or protect with VPN in restricted environments if desired).
3. **Audit Chain Integrity**: Log in as Owner/Auditor and confirm **Billing & Audit -> Immutable Audit Log Trail** displays `SHA-256 Chain: VERIFIED`.
4. **TLS & Headers**: Verify `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, HSTS, and CSP headers via `curl -I https://<your-domain>`.
5. **Backups**: Schedule `infrastructure/scripts/backup-postgres.sh` via cron/systemd timer and verify off-site object storage replication.
