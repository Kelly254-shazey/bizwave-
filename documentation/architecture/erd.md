# Architecture and schema map

This is a simplified guide, not a complete entity-relationship diagram. Exact definitions, constraints and row-level-security policies are in `database/migrations/001_*.sql` through `008_*.sql`.

```mermaid
flowchart LR
  PUBLIC[Public site] --> FE[React portal]
  FE -->|relative /api| API[NestJS API]
  API -->|restricted runtime role| PG[(PostgreSQL)]
  API --> REDIS[(Redis / BullMQ)]
  API --> INTEL[FastAPI intelligence]
  INTEL -->|public URL only, validated fetch| WEB[Website preview]
  FE -. optional browser speech .-> DEVICE[Browser / device]
  API -. optional unverified adapter .-> VOICE[Speech provider]
```

External customer-message delivery, online billing and live M-Pesa/POS integrations are **not connected**. Provider catalog rows are not live links.

```mermaid
erDiagram
  TENANTS ||--o{ BRANCHES : has
  USERS ||--o{ USER_ROLES : holds
  TENANTS ||--o{ USER_ROLES : assigns
  ROLES ||--o{ USER_ROLES : grants
  ROLES ||--o{ ROLE_PERMISSIONS : contains
  TENANTS ||--o{ PRODUCTS : owns
  BRANCHES ||--o{ INVENTORY : holds
  PRODUCTS ||--o{ INVENTORY : tracked_as
  TENANTS ||--o{ SALES : records
  SALES ||--o{ SALES_ITEMS : contains
  CUSTOMERS ||--o{ CUSTOMER_CONSENTS : records
  TENANTS ||--o| BUSINESS_DIRECTORY_PROFILES : publishes
  TENANTS ||--o{ DATA_SOURCES : configures
  DATA_SOURCES ||--o{ WEBSITE_CATALOG_LINKS : creates
  PRODUCTS ||--o{ WEBSITE_CATALOG_LINKS : references
  TENANTS ||--o{ AI_CONVERSATIONS : owns
  AI_CONVERSATIONS ||--o{ AI_MESSAGES : contains
  TENANTS ||--o{ SUBSCRIPTIONS : has
  SUBSCRIPTION_PLANS ||--o{ SUBSCRIPTIONS : defines
```

`business_directory_profiles` is visible across authenticated tenants only when published; all other operational records remain scoped. `website_catalog_links` tracks source-owned products to avoid overwriting unrelated catalog rows. `ai_conversations.security_scope` preserves creation-time permissions and branches. The analytics materialized view is cross-tenant and therefore not directly granted to the runtime role.
