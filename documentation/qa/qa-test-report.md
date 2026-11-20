# QA report — portal refresh source release candidate

This report records local sandbox checks, not a certification of production readiness. The current suites replace older demo/Learn assumptions; historical suites in `tests/legacy/` are not current-release evidence.

## Visual-reference follow-up

After the full-release checks below, the client shell, dashboard, Predict charts and chart colors were refreshed to follow the supplied images. The **frontend build and 7/7 unit checks** passed on the updated source. Focused Chromium checks compared dashboard totals, cost warning, payment channels, forecast projection and recorded-day count with the actual scoped API; exercised reporting-period and branch changes, chart toggles and tooltips, the non-submitting daily-record form, English/Kiswahili persistence, staff navigation and a real insufficient-history forecast; and checked dashboard/Predict at 320, 390, 768, 1024, 1280 and 1440 pixels. Other client destinations were checked on desktop and at 320/390 pixels. No UI business-data writes, browser page errors or API 5xx responses occurred in those checks.

A multiple-business navigation layout and an assistant forecast-chart response were **mocked for UI testing only**; no extra organization membership was granted. Login attempts add authentication audit entries, and the main QA database's audit chain remained valid. These are focused UI checks, not a new full security, accessibility, load or production-deployment certification.

## Earlier full-release local checks

The following checks ran for the preceding release before the visual-only follow-up; the full suite was not rerun as part of the follow-up.

| Check | Result | Scope |
|---|---|---|
| Backend build and unit | Pass: **16/16** | Includes cost visibility, branch/AI scope, reversible plan preview, website no-write behavior, unavailable billing and production CORS validation. |
| Frontend build and unit | Pass: **5/5** | TypeScript/Vite build and translation/format/API helper checks. |
| Intelligence | Pass: **24/24** | Includes forecast/scientist behavior, website parsing, public-address/redirect safety and currency handling. |
| Architecture/static checks | Pass: **6/6** | Narrow static checks for configuration, migration ordering, common key/eval and request-input SQL patterns; not a full security audit. |
| Migration regression | Pass: **8/8** | Fresh, rerun, upgrade preserving fixture data/audit, interrupted seed recovery, atomic failure and untracked schema refusal, on automatically removed disposable databases. |
| Restricted DB integrity | Pass: **6/6** | Representative tenant/catalog/directory isolation, cache and registry protection, cross-tenant FK, immutable ledger and audit-chain tests; test transaction rolled back. |
| Isolated API integration | Pass: **11/11** | Disposable PostgreSQL + Redis and deterministic mock website analyzer. Covers role/tenant/branch access, opt-in directory, no-save preview, explicit KES imports, collision/concurrency, communications consent/no delivery, AI/cash-flow prerequisites, billing 503/no data changes and audit chain. The suite creates lasting fixtures and audit records in the selected test DB. |
| Restore | Pass | Logical dump and restore to a new local DB; existing/invalid target refusal and restored audit-chain verification. Additional CI-suitable safety regression uses mocked PostgreSQL commands. Not an encrypted/offsite/Docker recovery drill. |
| Built-code/clean-DB readiness | Pass: **15/15** | `tests/verify-production.sh` on a separate empty reference database and locally running services. This is not a deployed-production certification. |
| Browser | Pass | Desktop/mobile billing disabled states, public disclosures, website no-save review and unchanged source/product counts, communications warning and no page overflow/errors. Additional EN/SW persistence, mobile navigation/staff visibility and real website review passed; microphone denial and speech playback were mocked, not real hardware. |

`tests/run-all-tests.sh` completed with the configured disposable API/database. The integration suite now verifies API/database identity using a temporary catalog probe **before** registering fixture accounts; a mismatched local API was tested and rejected without changing the main sandbox tenant, user or audit counts. No test should be aimed at a shared/production installation.

The main sandbox QA database was not reset; at the earlier full-release verification it contained three QA tenants, eight users and a valid 52-record audit chain. The visual follow-up added authentication audit entries, and the chain was valid when rechecked. **One earlier disposable integration database was replaced during test setup, so its test-only fixture/audit records were not retained.** Subsequent populated QA databases were preserved; newly created migration-test databases are intentionally discarded by their test script. No production database was involved.

## Not verified / release limitations

- Docker images and Compose deployment, an actual VPS/TLS deployment, GitHub-hosted Actions, certificate renewal, load testing, comprehensive penetration testing and full disaster recovery were not run.
- Hosted speech/LLM, SMS/WhatsApp/voice/USSD providers, payment gateways, live M-Pesa sync and external provider callbacks were not verified. Outbound messaging and online billing are not implemented; reset/report email delivery is not configured.
- Legal compliance and the draft privacy/terms text need qualified review. Browser and unit tests are representative, not proof that all roles, endpoints, devices or operational conditions are safe.

The deploy, backup and provider documentation describes remaining operator decisions and staging checks. The `PORTAL_FEATURE_GATING_ENABLED=false` preview opens only the four selected plan gates; authorization and branch restrictions remain enforced.
