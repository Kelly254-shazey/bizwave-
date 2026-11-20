# Access control and feature preview

The backend, not a hidden menu item, is the authorization boundary. Effective access is the intersection of **active tenant role**, **permissions**, **branch scope**, relevant **plan-feature state**, and any endpoint-specific rules. Expired or inactive assignments do not grant access. `X-Tenant-Id` is checked against the user's active roles. Tenant-scoped PostgreSQL queries use row-level security; the application role must not own tenant tables or have `BYPASSRLS`.

## Branch and sensitive-data rules

- The guard derives branch scope from current role assignments. Branch-restricted users can access only assigned branches on scoped endpoints; an unassigned branch is denied, including after revocation. Whole-business roles use an unrestricted branch scope.
- Inventory and sales cost fields require `finance:read`. Unknown costs remain unknown, not invented profit. Reports also check the permissions required for their underlying data and branch scope.
- Customer communications records do not reliably carry historic branch scope. Communications endpoints **fail closed for branch-restricted users** rather than exposing tenant-wide records. The opt-in business directory remains separately available to authorized `connect:read` users.
- A complete customer access export requires `customers:read`, `sales:read` and whole-business scope. Customer deletion endpoints create a request for review; they do not automatically erase all records.
- AI conversations retain creation-time permissions and branch scope. Reading requires sufficient current scope, writing requires the same scope, and older unscoped conversations are hidden rather than deleted.
- Website review requires `analytics:read`; saving/importing also requires `imports:manage` and `inventory:write` and a permitted branch. Profile publication requires `org:manage`; directory search requires `connect:read`.

The exact role/permission catalog is installed from `database/seeds/001_reference_data_and_plans.sql`; see `roles`, `permissions`, `role_permissions`, `user_roles` and `user_branch_assignments` in the target installation. Do not assume a static role-name table describes later custom assignments. Review effective permissions when assigning a user.

## Temporary feature preview

`PORTAL_FEATURE_GATING_ENABLED=false` (the current default) includes `predict_basic`, `predict_advanced`, `ai_assistant` and `connect_core` in the effective features for every plan. This is a reversible feature-gate override only: it does **not** give a role new permissions, widen tenant/branch scope, change a subscription or remove unrelated quotas. `true` restores the database-defined plan feature gates. Restart the API after changing this server-side flag.

Plan prices, limits and add-ons are reference data, not evidence that a purchase or external integration exists. Online billing, plan changes and add-on purchases are unavailable; POST requests return 503. Outbound customer messaging is not connected. Ask the operator to review any plan or quota change rather than promising an immediate upgrade.

See `backend/src/guards/tenant-rbac.guard.ts`, `backend/src/common/portal-features.ts` and the domain controllers for executable rules. The integration suite tests representative owner, staff, expired-role, branch-revocation and cross-tenant scenarios; it is not a comprehensive security audit.
