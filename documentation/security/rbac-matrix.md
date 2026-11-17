# BizWave Role-Based Access Control (RBAC) & Subscription Entitlement Matrix

BizWave enforces **three independent layers of backend authorization** on every API request (never trusting frontend UI visibility):
1. **Tenant Isolation**: Authenticated user must hold an active `user_tenant_memberships` record for `X-Tenant-Id`, enforced again by PostgreSQL `FORCE ROW LEVEL SECURITY`.
2. **RBAC Permission & Branch Scope**: `TenantRbacGuard` checks `role_permissions` plus `user_branch_access` (e.g., a Kilimani Branch Manager cannot read Westlands data).
3. **Commercial Plan Entitlements**: Database-driven `plan_features` checks module access (`predict_module`, `ai_assistant`, `connect_module`) and monthly usage quotas (`max_branches`, `max_users`, `imports_per_month`, `ai_queries_per_month`, `sms_included`).

---

## 1. Business Roles Matrix (8 Seeded SME Roles)

| Permission Code | Business Owner | Operations Manager | Branch Manager *(Branch-Scoped)* | Finance Officer | Inventory Manager | Marketing / Comms Manager | Customer Service Agent | Read-Only Auditor |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| `org:read` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `org:manage` | ✅ | — | — | — | — | — | — | — |
| `branches:read` | ✅ | ✅ | ✅ *(assigned)* | ✅ | ✅ | ✅ | ✅ | ✅ |
| `branches:manage` | ✅ | ✅ | — | — | — | — | — | — |
| `users:read` | ✅ | ✅ | — | — | — | — | — | ✅ |
| `users:manage` | ✅ | — | — | — | — | — | — | — |
| `analytics:read` | ✅ | ✅ | ✅ *(assigned)* | ✅ | ✅ | ✅ | — | ✅ |
| `sales:read` | ✅ | ✅ | ✅ *(assigned)* | ✅ | — | ✅ | ✅ | ✅ |
| `sales:write` | ✅ | ✅ | ✅ *(assigned)* | — | — | — | ✅ | — |
| `sales:return` | ✅ | ✅ | ✅ *(assigned)* | ✅ | — | — | — | — |
| `inventory:read` | ✅ | ✅ | ✅ *(assigned)* | — | ✅ | — | — | ✅ |
| `inventory:write` | ✅ | ✅ | ✅ *(assigned)* | — | ✅ | — | — | — |
| `finance:read` | ✅ | ✅ | — | ✅ | — | — | — | ✅ |
| `finance:write` | ✅ | — | — | ✅ | — | — | — | — |
| `imports:read` | ✅ | ✅ | ✅ | ✅ | ✅ | — | — | ✅ |
| `imports:write` | ✅ | ✅ | — | ✅ | ✅ | — | — | — |
| `reports:read` | ✅ | ✅ | ✅ *(assigned)* | ✅ | ✅ | ✅ | — | ✅ |
| `reports:export` | ✅ | ✅ | — | ✅ | — | — | — | ✅ |
| `predict:read` | ✅ | ✅ | ✅ *(assigned)* | ✅ | ✅ | ✅ | — | ✅ |
| `predict:run` | ✅ | ✅ | — | ✅ | ✅ | — | — | — |
| `ai:use` | ✅ | ✅ | ✅ *(assigned)* | ✅ | ✅ | ✅ | ✅ | — |
| `customers:read` | ✅ | ✅ | ✅ *(assigned)* | ✅ | — | ✅ | ✅ | ✅ |
| `customers:write` | ✅ | ✅ | — | — | — | ✅ | ✅ | — |
| `connect:read` | ✅ | ✅ | — | — | — | ✅ | ✅ | ✅ |
| `connect:send` | ✅ | ✅ | — | — | — | ✅ | ✅ | — |
| `connect:manage` | ✅ | — | — | — | — | ✅ | — | — |
| `billing:read` | ✅ | — | — | ✅ | — | — | — | ✅ |
| `billing:manage` | ✅ | — | — | — | — | — | — | — |
| `audit:read` | ✅ | — | — | ✅ | — | — | — | ✅ |

---

## 2. Platform Roles (6 Seeded Internal Roles)

| Role Code | Scope | Purpose & Safeguards |
|---|---|---|
| `platform_super_admin` | Platform | Emergency platform governance & system config; cross-tenant access requires explicit audited session reason |
| `platform_operations_admin` | Platform | Infrastructure health, queue monitoring, tenant onboarding provisioning |
| `platform_support_agent` | Platform | Read-only tenant diagnostics with mandatory support-ticket justification in `audit_logs` |
| `platform_billing_admin` | Platform | Subscription plan definitions, KES pricing updates, add-on & invoice management |
| `platform_compliance_auditor` | Platform | Read-only audit chain verification (`fn_verify_audit_log_chain`) and Kenya DPA 2019 compliance review |
| `platform_ml_engineer` | Platform | Forecast model registry governance & aggregate backtest accuracy monitoring (no raw PII exposure) |

---

## 3. Configurable KES Commercial Plans & Backend-Enforced Entitlements

| Feature / Quota | Starter (`KES 1,500–2,500/mo`) | Growth (`KES 4,500–7,500/mo`) | Intelligence (`KES 10,000–18,000/mo`) | Enterprise (`From KES 25,000/mo`) |
|---|:---:|:---:|:---:|:---:|
| Core Analytics & CSV/XLSX Imports | ✅ | ✅ | ✅ | ✅ |
| **BizWave Predict** (`predict_module`) | ❌ (403) | ✅ | ✅ | ✅ |
| **BizWave AI** (`ai_assistant`) | ❌ (403) | ✅ | ✅ | ✅ |
| **BizWave Connect** (`connect_module`) | ❌ (403) | ❌ (403) | ✅ | ✅ |
| Max Active Branches (`max_branches`) | 1 | 3 | 10 | 100 |
| Max Team Users (`max_users`) | 3 | 10 | 25 | 250 |
| Monthly Data Imports (`imports_per_month`) | 20 | 100 | 500 | 10,000 |
| Monthly AI Queries (`ai_queries_per_month`) | 0 | 150 | 500 | 5,000 |
| Included Monthly Messages (`sms_included`) | 0 | 0 | 2,000 | 10,000 |

Usage-based add-ons (`sms_bundle_1000`, `whatsapp_bundle_1000`, `ai_pack_250`, `extra_branch`) extend tenant quotas without requiring custom code changes.
