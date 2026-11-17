# BizWave Day-2 Operations & SRE Runbook

## 1. Service Topology & Ports

| Service | Runtime | Port | Health Endpoint |
|---|---|---|---|
| **Frontend Portal** | React 18 / Vite / Nginx | `5173` (dev) / `80` (prod) | `GET /` |
| **Backend Core API** | Node.js 20 / NestJS | `4000` | `GET /api/v1/health` & `GET /api/v1/admin/system-health` |
| **Intelligence Engine** | Python 3.13 / FastAPI / Uvicorn | `8001` | `GET /health` |
| **PostgreSQL** | PostgreSQL 17 | `5432` | `pg_isready -d bizwave` |
| **Redis** | Redis 7/8 (BullMQ) | `6379` | `redis-cli ping` |

---

## 2. Routine Operational Maintenance

### Refresh Materialized Analytics View
Run hourly (or triggered post-bulk-import):
```sql
REFRESH MATERIALIZED VIEW CONCURRENTLY mv_tenant_daily_analytics;
```

### Verify Audit Log Hash Chain Daily
```sql
SELECT * FROM fn_verify_audit_log_chain();
```
Alert immediately (Severity 1 Security Incident) if `is_valid = false`.

### Inspect BullMQ Async Queues
Query `/api/v1/admin/system-health` as an authenticated admin to view waiting, active, completed, and failed counts across `imports`, `reports`, and `forecasts` queues.

---

## 3. Common Incident Triage Playbooks

### Incident A: Forecast API Returns `503` or Timeout
1. Check `GET http://127.0.0.1:8001/health`.
2. Inspect Python Intelligence logs for memory pressure or malformed time series.
3. Note: If a tenant has fewer than 14 days of history, the API intentionally returns HTTP `200` with `status: "insufficient_data"` — this is **expected behavior**, not an error.

### Incident B: Communications Stuck in `pending_provider_config`
1. Confirm the tenant has configured credentials under **BizWave Connect -> Providers**.
2. Verify `ENCRYPTION_MASTER_KEY` has not changed since credentials were saved.
3. Verify inbound provider webhooks return `200` and carry a valid `X-BizWave-Signature` HMAC-SHA256 header.

### Incident C: Cross-Tenant Access Anomaly or Locked User
1. Inspect `audit_logs` filtered by `action IN ('auth.login_failed', 'security.tenant_denied', 'auth.refresh_replay')`.
2. Revoke compromised user sessions via `DELETE /api/v1/auth/sessions/:id` or directly invalidate `user_sessions.revoked_at = NOW()`.
3. Confirm PostgreSQL RLS policies remain active on all tables:
   ```sql
   SELECT tablename, rowsecurity, forcerowsecurity
   FROM pg_tables t
   JOIN pg_class c ON c.relname = t.tablename
   WHERE schemaname = 'public' AND rowsecurity = true;
   ```

### Incident D: Sandbox Full Reset / Bootstrap
Run `/home/user/bizwave/scripts/bootstrap-sandbox.sh` to cleanly restore PostgreSQL, Redis, migrations, seeds, and compiled builds, followed by `/home/user/bizwave/tests/run-all-tests.sh`.
