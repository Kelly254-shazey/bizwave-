# Integrations and provider status

Catalog records and encrypted credentials are **not** proof of a live integration. This release has not been verified with external paid providers.

| Capability | Current behavior | Limitation |
|---|---|---|
| CSV / Excel | Authorized users can upload, validate and commit supported records. | Check the available mapping/template and review validation errors before commit; not every arbitrary spreadsheet is supported. |
| Website catalog | Public-site analysis is a no-save preview. An explicit authorized import stores an eligible source/products. | Only explicit, positive KES prices; no inferred stock/costs, no overwrite of unrelated SKUs. Not a scheduled connector. Public web pages can contain errors and should be reviewed. |
| M-Pesa, POS, ERP, accounting | Records can be entered/imported for analysis where a supported mapping exists. | Catalog entries for Daraja, POS or accounting providers do not implement verified live sync or payment processing. |
| Customer SMS / WhatsApp / voice / USSD | Consent, templates, provider settings and a consent-check log can be recorded. | **No outbound provider delivery is implemented.** Stored credentials do not activate dispatch; messages are `provider_unconfigured` or `rejected_no_consent`, and the campaign remains blocked. New templates are drafts, not provider-approved. |
| Generic webhook endpoint | A generic endpoint accepts a BizWave HMAC and idempotency key. | This is not a verified Africa's Talking, Meta, Twilio or other provider-specific webhook implementation and does not establish delivery. |
| Speech | Browser speech/dictation may be available; an optional server-side Msingi-compatible adapter can be configured. | Hosted provider API, self-host compatibility, language coverage, billing and actual hardware have not been verified. Keys remain server-side. Browser support varies. |
| External LLM | An optional server-side OpenAI-compatible endpoint can enhance AI narratives. | Requires operator credentials and separate privacy/provider review. Do not assume availability, cost or model behavior. |
| Billing | Plan and add-on information is displayed for reference. | No payment gateway, billing reconciliation, paid plan changes or add-on purchase. Requests return 503. |
| Email / report schedules | Schedules save as inactive drafts; a password-reset token flow exists. | Automated report delivery and password-reset email delivery are not configured. |

## Safe rollout checklist

Before enabling any real provider, implement and independently test the actual provider protocol, credentials, callback authentication, consent/legal basis, retry/idempotency, failure handling, data sharing and billing reconciliation. Verify pricing directly with the provider. Keep secrets out of frontend code, logs and Git. Merely setting environment variables or saving a provider channel does not satisfy these steps.
