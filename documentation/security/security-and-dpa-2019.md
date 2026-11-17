# BizWave Security Architecture & Kenya Data Protection Act (2019) Compliance

## 1. OWASP ASVS Level 2 Security Controls

| Control Area | Implementation in BizWave |
|---|---|
| **Password Security** | Argon2id (`memoryCost: 65536 KiB`, `timeCost: 3`, `parallelism: 4`) via `argon2` native bindings. Account lockout triggered after repeated failed login attempts. |
| **Session & Token Lifecycle** | Short-lived JWT Access Tokens (`15m`, HS256/RS256-ready) paired with opaque cryptographic Refresh Tokens stored as SHA-256 hashes in `user_sessions`. Every `/auth/refresh` rotates the token and revokes the previous session; reuse of a rotated token triggers immediate session invalidation. |
| **Multi-Factor Authentication** | RFC 6238 TOTP MFA (`otplib`) with AES-256-GCM encrypted secrets in `user_mfa_methods`. Users enroll via `/app/settings` and verify 6-digit codes on `/login`. |
| **Tenant Isolation (Defense in Depth)** | (1) `TenantRbacGuard` verifies `user_tenant_memberships` for `X-Tenant-Id`. (2) `DatabaseService.withTenantTransaction()` sets `SET LOCAL app.tenant_id = $1`. (3) PostgreSQL `FORCE ROW LEVEL SECURITY` enforced against non-superuser `bizwave_app` (`NOSUPERUSER NOBYPASSRLS`). (4) Composite tenant foreign keys `(tenant_id, fk_id)` prevent cross-tenant joins at the schema layer. |
| **Secrets & Credential Encryption** | Integration credentials (Africa's Talking API keys, Meta WhatsApp tokens, POS keys) and MFA secrets are encrypted at rest using **AES-256-GCM** with unique random 96-bit IVs and 128-bit authentication tags derived from `ENCRYPTION_MASTER_KEY`. Plaintext credentials are never logged or returned in API responses. |
| **SQL Injection & Grounded AI Safety** | All PostgreSQL queries use strictly parameterized placeholders (`$1, $2, ...`). **BizWave AI never executes LLM-generated SQL** — natural-language intent is routed exclusively to whitelisted, parameterized analytical service functions inside the caller's RLS transaction. |
| **Webhook Integrity & Anti-Replay** | Inbound provider webhooks (`/api/v1/communications/webhooks/:provider`) require HMAC-SHA256 signature verification (`crypto.timingSafeEqual`) and deduplicate on `UNIQUE(provider_code, provider_event_id)`. |
| **Tamper-Evident Audit Logging** | Append-only `audit_logs` table protected by `BEFORE UPDATE OR DELETE` immutability trigger + linear SHA-256 hash chain (`fn_append_audit_log` / `fn_verify_audit_log_chain`). |
| **HTTP Hardening** | Helmet security headers, strict CORS origin allowlist, CSP header in Nginx, request body size caps, Zod input schema validation on every endpoint, and honeypot bot protection on public contact forms. |

---

## 2. Kenya Data Protection Act, 2019 (DPA 2019) Compliance Architecture

BizWave is architected from the ground up to help Kenyan SMEs act as compliant **Data Controllers** (with BizWave operating as **Data Processor**) under the **Kenya Data Protection Act, No. 24 of 2019** and the Office of the Data Protection Commissioner (ODPC) regulations.

| Kenya DPA 2019 Principle / Right | BizWave Architectural Control |
|---|---|
| **Lawful Basis & Express Consent (Sections 30, 32)** | Every customer record has per-channel consent tracking in `customer_consents` (`sms`, `whatsapp`, `voice`, `ussd`, `email`) with timestamp, consent source, and revocation log. **BizWave Connect enforces hard backend consent checks before dispatching any campaign message**, marking non-consenting recipients as `blocked_no_consent`. |
| **Right of Access & Data Portability (Section 26(b), 38)** | `GET /api/v1/customers/:id/dpa-export` generates a structured, machine-readable JSON package containing customer profile, consent history, sales history, and message logs, recorded in `data_subject_requests` and `audit_logs`. |
| **Right to Rectification (Section 26(d))** | Customer contact fields and consent preferences can be updated via audited endpoints with full before/after change tracking. |
| **Right to Erasure Subject to Statutory Retention (Section 26(e), 40)** | `POST /api/v1/customers/:id/deletion-request` logs a DPA erasure request and anonymizes personal identifiers (`full_name`, `phone_e164`, `email`) while **preserving anonymized statutory financial transaction totals** required under the Kenya Tax Procedures Act (5–7 year KRA tax retention). |
| **Data Minimization & Storage Limitation (Section 25)** | Only operationally required customer attributes are collected; refresh sessions auto-expire; raw import staging payloads can be purged on schedule after commit while keeping aggregate provenance. |
| **Security Safeguards & Breach Accountability (Section 41, 43)** | Encrypted storage, RLS multi-tenant boundaries, MFA, and immutable SHA-256 audit trails enable rapid forensic scoping within the 72-hour ODPC breach notification window. |
| **Transparency (Section 29)** | Public `/privacy` and `/terms` pages clearly disclose processing purposes, sub-processor boundaries, and SME customer rights. |

---

## 3. Verified Security Test Coverage

Automated tests in `database/tests/test_database_integrity.sql` and `backend/test/api.integration.spec.ts` continuously assert:
- Cross-tenant header spoofing (`Brian` from Tenant 2 requesting Tenant 1 via `X-Tenant-Id`) -> **403 Forbidden**.
- Branch-scoped RBAC (`Kelvin`, Kilimani Branch Manager, accessing Westlands data or Finance endpoints) -> **Scoped / 403 Forbidden**.
- Plan entitlement enforcement (`Kijiji Flame Bistro` on `growth` calling `BizWave Connect` endpoint) -> **403 Forbidden (`PLAN_UPGRADE_REQUIRED`)**.
- Immutable ledger tampering (`UPDATE`/`DELETE` on `sales_transactions`, `inventory_movements`, `audit_logs`) -> **PostgreSQL `42501` Exception**.
- Unsigned / tampered communication webhook -> **401/403 Rejected**; valid HMAC signed webhook -> **200 Processed & Idempotent**.
- SHA-256 audit hash chain integrity -> `fn_verify_audit_log_chain().is_valid === true`.

---

## 4. Marketplace & Community Literacy Privacy & Isolation Controls (Section F)

1. **Strict Public-vs-Private Blast-Radius Isolation**:
   - Public literacy endpoints (`/api/v1/learn/*`) execute inside `DatabaseService.withLearnerContext()`, which explicitly sets `SET LOCAL app.tenant_id = ''` and `SET LOCAL app.is_platform_admin = 'false'`. PostgreSQL `FORCE ROW LEVEL SECURITY` guarantees **0 rows** from `sales`, `customers`, `products`, or `expenses` can ever be accessed from public buyer/community flows.
2. **Per-Learner RLS & Cryptographic Pseudonymity**:
   - Public learners receive a high-entropy 256-bit `X-Learner-Token` stored exclusively as a SHA-256 hash (`learner_profiles.learner_token_hash`), protected by `FORCE ROW LEVEL SECURITY` (`learner_id = app_current_learner_id()`).
   - `DELETE /api/v1/learn/my-data` provides instant Kenya DPA 2019 Section 26(e) erasure of personal learning history and tutor logs.
3. **Opt-In Operational Business Coaching (Zero Customer PII)**:
   - Linking **BizWave Business Coach** to live workspace signals requires: (a) cryptographically verified JWT, (b) verified active `user_roles` membership + RBAC read permission, AND (c) explicit audited opt-in (`operational_context_authorized = true`). Only aggregated non-PII counts (e.g., low-stock SKU count, 30d margin %) are ever referenced.
4. **Zero Demographic Profiling & Non-Certification Guardrails**:
   - BizWave collects zero sensitive demographic attributes to judge literacy or commercial eligibility; learners freely select their explanation style and language.
   - Buyer Guide tools strictly refuse to certify products and always direct shoppers to official Kenyan regulators (KEBS SMS `20023`, PPB, ACA, CAK, ODPC, Safaricom `333`).
