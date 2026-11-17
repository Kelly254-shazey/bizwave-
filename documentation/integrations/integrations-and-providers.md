# BizWave Integrations & External Provider Adapters Guide

BizWave follows a **strict provider-independent adapter pattern** and adheres to an **honest delivery contract**:
- If a tenant has **not yet configured real provider API credentials**, BizWave **never fakes a `"sent"` or `"delivered"` status**. Instead, messages are stored as `pending_provider_config` with a clear operational notice explaining which credentials must be added under `/app/connect` -> **Providers**.
- All provider secrets entered by a tenant are encrypted at rest with **AES-256-GCM** (`tenant_communication_channels.encrypted_credentials` and `data_sources.encrypted_config`).

---

## 1. Africa's Talking (Kenya SMS, Voice & USSD)

| Field | Detail |
|---|---|
| **Adapter Slug** | `africas_talking` |
| **Supported Channels** | `sms`, `voice`, `ussd` |
| **Required Tenant Credentials** | `username` (live username or `sandbox`), `apiKey`, `senderId` (registered Kenyan alphanumeric shortcode/sender ID, e.g., `BIZWAVE`), `webhookSecret` |
| **Live API Endpoint** | `https://api.africastalking.com/version1/messaging` (or sandbox equivalent) |
| **Inbound Webhook URL** | `POST https://<your-domain>/api/v1/communications/webhooks/africas_talking` |
| **Webhook Security** | Header `X-BizWave-Signature: sha256=<HMAC_SHA256(rawBody, webhookSecret)>` verified with `crypto.timingSafeEqual`; idempotency enforced on `(provider_code, provider_event_id)`. |

---

## 2. Meta WhatsApp Business Cloud API

| Field | Detail |
|---|---|
| **Adapter Slug** | `meta_whatsapp` |
| **Supported Channel** | `whatsapp` |
| **Required Tenant Credentials** | `phoneNumberId`, `businessAccountId`, `accessToken` (permanent System User token), `appSecret` (for webhook HMAC verification) |
| **Live API Endpoint** | `https://graph.facebook.com/v20.0/{phoneNumberId}/messages` |
| **Template Governance** | Only Meta-approved English & Kiswahili templates (`message_templates`) should be dispatched outside the 24-hour customer service window. |
| **Inbound Webhook URL** | `POST https://<your-domain>/api/v1/communications/webhooks/meta_whatsapp` |

---

## 3. Safaricom M-Pesa (Till / Paybill Reconciliation & Daraja Adapter)

BizWave supports two reconciliation modes tailored to Nairobi/Kenya SMEs:
1. **Statement CSV/XLSX Import (Available on all plans)**:
   - Export daily/weekly M-Pesa Till or Paybill statements from the Safaricom M-Pesa Business Portal and upload via **Analytics -> Data Imports** (`POST /api/v1/imports`).
   - Rows are staged, validated, deduplicated on receipt number, and matched against `sales_payments.mpesa_receipt_no` inside **Analytics -> Finance & M-Pesa**.
2. **Safaricom Daraja API Sync (Enterprise / Configured Data Source)**:
   - Required credentials (stored encrypted in `data_sources.encrypted_config` or `.env`):
     - `MPESA_ENVIRONMENT` (`sandbox` or `production`)
     - `MPESA_CONSUMER_KEY`
     - `MPESA_CONSUMER_SECRET`
     - `MPESA_SHORTCODE` (Paybill or Buy Goods Till)
     - `MPESA_PASSKEY`
     - `MPESA_CALLBACK_SECRET`

---

## 4. POS, Accounting & Spreadsheet Ingestion Pipeline

BizWave supports CSV, XLSX, JSON, and REST API uploads via `/api/v1/imports`:

1. **Stage (`POST /api/v1/imports`)**: Uploads raw file, computes `SHA-256` file checksum, stores raw rows in `import_records_staging` with full provenance (`import_jobs`).
2. **Map & Validate (`POST /api/v1/imports/:id/validate`)**:
   - Applies user-defined column mapping (e.g., `receipt_no -> receipt_number`, `qty -> quantity`).
   - Detects missing required fields, negative quantities, malformed dates, invalid KES amounts, and duplicate receipt numbers.
   - **Never silently discards invalid rows**: every invalid row is persisted in `import_job_errors` with row number, field name, error code, and raw value so the SME user can inspect and fix source files.
3. **Commit (`POST /api/v1/imports/:id/commit`)**:
   - Commits validated rows atomically into `sales_transactions`, `sales_transaction_items`, `inventory_movements`, `expenses`, or `customers`, stamping `source_import_job_id` on every created record.
   - Enqueues an asynchronous BullMQ rollup job to refresh analytics aggregates.

---

## 5. MsingiAI Sauti Speech & Kenyan Language AI Adapter (`MsingiLanguageService`)

BizWave integrates **MsingiAI Platform API** (`https://api.msingiai.com`, Nairobi, Kenya) to power native Kiswahili & Kenyan English/Sheng audio explanations and voice-note questions across **BizWave Community Learn**, **Business Coach**, and **Buyer Guide**:

| Field | Detail |
|---|---|
| **Base URL** | `MSINGI_BASE_URL` (default `https://api.msingiai.com`; can point to a self-hosted open-weight `msingiai/sauti-tts` server) |
| **TTS Endpoint** | `POST /v1/audio/speech` (`{ text, voice_id }`, max 2,000 chars, returns `audio/wav`) |
| **ASR Endpoint** | `POST /v1/audio/transcriptions` (`multipart/form-data`, field `file`, max 10MB, returns JSON `{ text, duration, speech_detected }`) |
| **Pricing & Free Mode Transparency** | Signing up for the MsingiAI Playground and self-hosting open-weight models (`msingiai/sauti-tts`, `msingiai/sauti-asr`) are free. Hosted inference at `api.msingiai.com` is pay-as-you-go prepaid in KES (**KES 6.00 / 1,000 TTS chars**, **KES 1.90 / min ASR**; no monthly subscription). |
| **Security & Cost Controls** | `MSINGI_API_KEY` is strictly server-side (redacted in Pino logs, never exposed to browser). BizWave sends deterministic SHA-256 `Idempotency-Key` headers (avoiding duplicate charges within 24h), caches popular lesson audio in memory for 6 hours, enforces `20 req/min` rate limiting, and **falls back honestly to zero-cost browser Web Speech synthesis** when unconfigured (never faking WAV responses). |
