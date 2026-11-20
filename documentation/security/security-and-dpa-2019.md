# Security and privacy engineering notes

This document describes controls implemented in this source release; it is **not** a certification, legal opinion or claim of compliance with Kenya's Data Protection Act. Before real deployment, the operator must complete legal review, controller/processor agreements, data inventory, retention and deletion procedures, security assessment, incident response and provider/subprocessor review. The public privacy and terms text is marked draft and needs approval before publication.

## Implemented safeguards

- Password hashing uses Argon2id; access and refresh sessions are supported, with session revocation and optional TOTP. Production startup checks for explicit non-default secrets and HTTPS-only CORS origins. HTTPS termination and secret management remain operator responsibilities.
- The API checks active tenant role, explicit permissions, branch assignments and relevant feature gates. Tenant queries use PostgreSQL row-level security with a restricted `bizwave_app` runtime role. Directory publication is opt-in and exposes only published fields to authorized signed-in businesses.
- Inventory/financial visibility, report exports, website catalog imports, AI thread scopes and customer communications have additional permission/scope checks. The cross-tenant materialized analytics cache is not directly readable by the runtime role.
- Provider credentials stored via the UI use AES-256-GCM with a server-side key. Protect and back up the encryption key separately; lost keys make encrypted credentials unrecoverable. Never commit real keys.
- Audit logs and inventory movements have immutability protections; `fn_verify_audit_chain()` verifies the chain. Backups and operational privileges can still affect availability and must be controlled.
- Website analysis resolves public DNS, pins a validated public address, rechecks redirects, disables proxy use and limits response size. Treat any outbound fetch as a residual SSRF risk; keep the service patched and restrict network egress.
- Password reset email and report email are not connected. Customer messaging and payment processing are not connected. Do not enter live provider credentials merely to imply those services work.

## Personal data and limits

Consent records are channel/purpose-specific for non-transactional campaign checks; transactional checks deny an explicit revocation. This is a technical control, not a determination of legal basis. Customer exports require whole-business customer and sales access and contain selected customer, consent, interaction and transaction data—not a claim of exhaustive portability. Deletion requests are **pending review**, not automatic erasure. The operator must handle identity verification, retention obligations, lawful processing, deletion, notification and response deadlines.

Backups may contain all tenants' data. Encrypt backups, separately protect keys, restrict access, and test recovery. The supplied backup script is plaintext by default unless GPG encryption is explicitly configured; WAL archiving, offsite storage and retention automation are not supplied as a managed service.

## Verification boundaries

Local automated tests cover representative RLS, role, branch, immutability, audit and web-fetch safety scenarios. They do not prove that every endpoint is secure. Docker deployment, external providers, penetration testing, operational monitoring and legal compliance have not been independently verified. Production rate limits are process-local, so multi-instance/global enforcement needs separate design.
