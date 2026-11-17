# BizWave REST API Specification (`/api/v1`)

- **Base URL**: `/api/v1` (proxied to NestJS backend on port `4000`)
- **Interactive OpenAPI / Swagger UI**: `/api/docs`
- **Machine-Readable OpenAPI 3.0 Spec**: `documentation/api/openapi.json`
- **Authentication**: Bearer JWT (`Authorization: Bearer <accessToken>`, 15m TTL) + rotating Refresh Token (`POST /api/v1/auth/refresh`, 14d TTL)
- **Tenant Context Header**: `X-Tenant-Id: <tenant-uuid>` (Mandatory for tenant-scoped routes; server **always verifies authenticated user membership** in `user_tenant_memberships` — untrusted client headers are rejected with `403 Forbidden`)
- **Currency & Locale**: Monetary amounts returned in `KES` (exact decimal numeric representation); optional `language` parameter supports `en` and `sw`.

---

## Endpoint Catalog

### 1. Public & Health Endpoints (No Auth Required)
| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/v1/health` | Liveness & PostgreSQL latency probe |
| `GET` | `/api/v1/subscriptions/plans` | Live commercial KES plans & add-ons from PostgreSQL |
| `GET` | `/api/v1/organizations/industry-templates` | 6 configurable industry workspace templates (EN/SW) |
| `POST` | `/api/v1/public/contact` | Public enquiry form submission with honeypot spam check |

### 2. Authentication, MFA & Sessions
| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/v1/auth/register` | Creates user, new tenant org, HQ branch, Starter subscription & owner membership |
| `POST` | `/api/v1/auth/login` | Argon2id verification + optional 6-digit TOTP MFA + JWT issuance |
| `POST` | `/api/v1/auth/refresh` | Rotates refresh token and detects token replay |
| `POST` | `/api/v1/auth/logout` | Revokes active session |
| `GET` | `/api/v1/auth/me` | Returns user profile, authorized organizations, roles, permissions, and entitlements |
| `POST` | `/api/v1/auth/mfa/setup` | Generates encrypted TOTP secret and `otpauth://` URI |
| `POST` | `/api/v1/auth/mfa/verify` | Verifies 6-digit TOTP code and enables MFA |
| `GET` / `DELETE` | `/api/v1/auth/sessions` / `:id` | Lists and revokes active refresh sessions |

### 3. Organizations, Branches & Team RBAC
| Method | Path | Required Permission | Purpose |
|---|---|---|---|
| `GET` / `PATCH` | `/api/v1/organizations/:id` | `org:read` / `org:manage` | Read or update branding, industry template, onboarding state |
| `GET` / `POST` / `PATCH` / `DELETE` | `/api/v1/branches` | `branches:read` / `branches:manage` | Manage branches (enforces plan `max_branches` quota) |
| `GET` | `/api/v1/admin/users` & `/admin/roles` | `users:read` | List tenant members, assigned roles & branch scopes |
| `POST` | `/api/v1/admin/users/invite` | `users:manage` | Invite user with role & optional branch restriction (enforces `max_users`) |
| `PATCH` | `/api/v1/admin/users/:userId/role` | `users:manage` | Reassign role or branch scope |

### 4. Data Ingestion & Import Pipeline (`BizWave Analytics`)
| Method | Path | Required Permission | Purpose |
|---|---|---|---|
| `GET` / `POST` | `/api/v1/data-sources` | `imports:read` / `imports:write` | Configure POS/API/spreadsheet sources (credentials encrypted AES-256-GCM) |
| `GET` / `POST` | `/api/v1/imports` | `imports:read` / `imports:write` | Upload CSV/XLSX/JSON (`multipart/form-data` or inline JSON) to staging |
| `POST` | `/api/v1/imports/:id/validate` | `imports:write` | Apply column mapping, validate every row, detect duplicates, persist row-level errors |
| `POST` | `/api/v1/imports/:id/commit` | `imports:write` | Commit validated rows atomically into production tables & queue async rollup refresh |

### 5. Operational Ledgers & Analytics (`BizWave Analytics`)
| Method | Path | Required Permission | Purpose |
|---|---|---|---|
| `GET` | `/api/v1/analytics/overview` | `analytics:read` | Role/branch-scoped KPIs, period comparisons, trends, payment mix & Data Quality coverage |
| `GET` | `/api/v1/analytics/sales`, `products`, `customers`, `expenses`, `inventory`, `search` | Module `*:read` | Drill-down views & fast trigram global search |
| `GET` / `POST` | `/api/v1/sales` | `sales:read` / `sales:write` | List or record immutable sale + automatic inventory deduction |
| `POST` | `/api/v1/sales/:id/return` | `sales:return` | Create traceable negative reversal transaction (never deletes original sale) |
| `GET` / `POST` | `/api/v1/inventory` & `/inventory/adjustments` | `inventory:read` / `inventory:write` | View branch stock & record audited inventory adjustments |
| `GET` / `POST` | `/api/v1/finance/overview`, `/finance/expenses`, `/finance/reconcile/:txId` | `finance:read` / `finance:write` | Expenses, payables/receivables & M-Pesa statement reconciliation |
| `GET` / `POST` | `/api/v1/reports`, `/reports/generate`, `/reports/export`, `/reports/schedule` | `reports:read` / `reports:export` | Generate auditable reports, stream CSV downloads, schedule weekly/monthly delivery |

### 6. Predictive Intelligence (`BizWave Predict` — Enforces `predict_module` entitlement)
| Method | Path | Required Permission | Purpose |
|---|---|---|---|
| `GET` / `GET :id` | `/api/v1/forecasts` | `predict:read` | List historical forecast runs, backtest metrics & confidence intervals |
| `POST` | `/api/v1/forecasts` | `predict:run` | Run `sales`, `demand` (stockout-aware), or `cash_flow` (confirmed vs estimated) forecast via Python FastAPI; returns `insufficient_data` when history is too short |
| `POST` | `/api/v1/forecasts/anomalies/scan` | `predict:run` | Scan revenue & expense series for Z-score/MAD anomalies |
| `GET` | `/api/v1/forecasts/segmentation/rfm` | `predict:read` | Compute customer RFM tiers & churn risk indicators |

### 7. Grounded Business Assistant (`BizWave AI` — Enforces `ai_assistant` entitlement + monthly quota)
| Method | Path | Required Permission | Purpose |
|---|---|---|---|
| `GET` / `POST` | `/api/v1/ai/conversations` | `ai:use` | List or create EN/SW conversation threads |
| `GET` / `POST` | `/api/v1/ai/conversations/:id/messages` | `ai:use` | Ask natural-language questions (EN/SW); executes strictly whitelisted parameterized analytical tools and returns answer + provenance + charts + recommendations |
| `POST` | `/api/v1/ai/messages/:messageId/feedback` | `ai:use` | Submit thumbs up/down feedback (`+1` / `-1`) |

### 8. Customer Directory, DPA 2019 & Omnichannel (`BizWave Connect` — Enforces `connect_module` entitlement)
| Method | Path | Required Permission | Purpose |
|---|---|---|---|
| `GET` / `POST` | `/api/v1/customers` | `customers:read` / `customers:write` | Manage tenant customer directory |
| `PATCH` | `/api/v1/customers/:id/consents` | `customers:write` | Update per-channel Kenya DPA 2019 consent (SMS/WhatsApp/Voice/USSD) |
| `GET` / `POST` | `/api/v1/customers/:id/dpa-export`, `/deletion-request` | `customers:read` / `customers:write` | Subject data portability export & retention-compliant erasure workflow |
| `GET` | `/api/v1/communications/overview` | `connect:read` | Channels, encrypted provider status, EN/SW templates, campaigns & delivery metrics |
| `POST` | `/api/v1/communications/channels/configure` | `connect:manage` | Encrypt & store provider credentials (Africa's Talking / Meta WhatsApp) |
| `POST` | `/api/v1/communications/templates` & `/campaigns` | `connect:send` | Manage EN/SW templates & dispatch consent-checked campaigns (never fabricates delivery) |
| `POST` | `/api/v1/communications/webhooks/:provider` | HMAC Signature Verified | Signed, idempotent delivery callback ingestion |

### 9. Subscriptions, Audit Logs & System Health
| Method | Path | Required Permission | Purpose |
|---|---|---|---|
| `GET` / `POST` | `/api/v1/subscriptions`, `/subscriptions/usage`, `/subscriptions/add-ons` | `billing:read` / `billing:manage` | Plan inspection, usage meters, plan switching & KES add-on activation |
| `GET` | `/api/v1/admin/audit-logs` | `audit:read` | Hash-chained audit log viewer with live `fn_verify_audit_log_chain()` status |
| `GET` | `/api/v1/admin/system-health` | Authenticated | Live PostgreSQL, Redis/BullMQ queue depths & Python Intelligence health |

---

## Standard Error Codes
- `400 Bad Request` — Zod schema validation failure or domain rule violation (e.g., invalid import mapping)
- `401 Unauthorized` — Missing, expired, or invalid JWT / failed MFA verification
- `403 Forbidden` — Missing RBAC permission, unauthorized `X-Tenant-Id`, branch scope violation, or plan entitlement gate (`PLAN_UPGRADE_REQUIRED`)
- `404 Not Found` — Resource does not exist in caller's authorized tenant (RLS-filtered)
- `409 Conflict` — Duplicate email, SKU, receipt number, or idempotent webhook replay
- `429 Too Many Requests` — Rate limit or monthly subscription usage quota exceeded
