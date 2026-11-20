# API specification — current release

Base path: `/api/v1`. Development Swagger is served at `/api/docs` and its JSON at `/api/docs-json`; production Swagger is disabled unless explicitly enabled. `openapi.json` is a generated snapshot and may lack detailed DTO schemas for endpoints that use inline TypeScript types. The controller source and tests are authoritative.

Protected calls use a bearer access token and, when selecting an organization, `X-Tenant-Id`. The backend checks active role membership, tenant, permissions, feature state and branch scope. A user cannot select an unrelated tenant by changing the header.

| Area | Representative endpoints | Behavior / permissions |
|---|---|---|
| Authentication | `POST /auth/register`, `/auth/login`, `/auth/refresh`, `/auth/change-password`; `GET /auth/me` | Registration creates a Starter workspace. Change password requires an authenticated session. Reset email delivery is not configured. |
| Analytics | `GET /analytics/overview`, `/analytics/pro-insights`; `POST /analytics/daily-checkin` | Requires applicable analytics, sales, inventory or finance permissions and permitted branch scope. Unknown costs are not invented. |
| Website | `POST /analytics/website-analyze`, `GET /analytics/website-sources` | Preview with `importCatalog: false` is read-only. Explicit import needs `analytics:read`, `imports:manage`, `inventory:write`, and branch access; only explicit KES prices are imported. |
| Network | `GET /business-network/businesses`, `GET/PUT /business-network/profile` | `connect:read` to search published profiles; `org:read` to view own profile and `org:manage` to save/publish. Results expose published profile fields only. |
| Predict | `GET/POST /forecasts`, `POST /forecasts/anomalies/scan` | Feature and domain-specific `predict:*` permissions. Cash-flow also requires whole-business `finance:read`, an entered KES balance and reconciled data. Insufficient history is reported. |
| AI | `GET /ai/status`, `POST /ai/conversations`, `GET/POST /ai/conversations/:id/messages`, `POST /ai/voice/speak` | Conversation access is bound to saved permission/branch scope. Optional provider compatibility is unverified; browser fallback may be used. |
| Customers | `GET/POST /customers`, `PATCH /customers/:id/consents`, `GET /customers/:id/dpa-export`, `POST /customers/:id/deletion-request` | Customer permissions and branch rules apply. Complete selected-data export also requires whole-business and sales read access; deletion request is pending review. |
| Communications | `GET /communications/overview`, `POST /communications/templates`, `/communications/campaigns`, `/communications/messages` | Whole-business scope and `connect:*` permissions required. Channel-specific consent checks are recorded; no outbound provider delivery exists. Templates start as drafts. |
| Reports | `POST /reports/generate`, `GET /reports/export`, `POST /reports/schedule` | Each report checks its underlying domain permissions. CSV cells are protected against formula injection. Schedules are inactive drafts, not delivered. |
| Billing | `GET /subscriptions/plans`, `/subscriptions`, `/subscriptions/usage`; `POST /subscriptions`, `/subscriptions/add-ons` | Reads show reference catalog and usage. Plan and add-on POSTs return 503 without recording a payment or changing subscription/add-on data. |

During the temporary preview `PORTAL_FEATURE_GATING_ENABLED=false` opens `predict_basic`, `predict_advanced`, `ai_assistant` and `connect_core` across plans **without** granting roles or branch access; set it to `true` to resume plan gates. Other quotas still apply.

The legacy `/learn/*` API is not available. External provider-specific callbacks, payment gateway and live M-Pesa sync are not verified implementations; see the [integration notes](../integrations/integrations-and-providers.md).
