# BizWave portal refresh — release notes

## Reference-inspired client update

The signed-in workspace now uses the compact navy-and-cyan sidebar, business header, metric cards and blue chart surfaces from the supplied dashboard and Predict references. The dashboard retains period and branch filters, real payment-channel totals and the cost-data warning. Forecasts retain their uncertainty and insufficient-data messages; chart colors and legends are also readable on the assistant and analytics screens. Reports controls wrap on narrow screens.

Values come from the scoped API, not the reference screenshots. In particular, net profit is shown only when its required costs and expenses are available; revenue minus expenses is not presented as a cash balance. The visual update does not change role, tenant, branch or plan-feature authorization.

The frontend build and seven unit checks passed after the update. Focused local browser checks covered real dashboard and forecast values, navigation, English/Kiswahili, desktop and narrow layouts, staff restrictions and empty-forecast behavior. See the QA report for the scope and limitations.

## Included

- Responsive signed-in portal with dashboard/daily check-in, analytics and website preview/import, Predict, English/Kiswahili AI and onboarding, team settings, reports and an opt-in business directory. Public site remains separate.
- Tenant, role and branch checks, finance-aware cost visibility, scope-bound AI history, protected audit/ledger data, explicit website import and safer migration/restore scripts.
- `PORTAL_FEATURE_GATING_ENABLED=false` temporarily opens Predict, AI and Connect feature gates across plans without granting additional role, tenant or branch access. Set it to `true` to restore plan gates; other quotas still apply.
- Updated user, API, security, provider and deployment guidance plus current automated and browser QA. See `documentation/qa/qa-test-report.md` for test details and limits.

## Important limits before real deployment

Online billing, plan/add-on purchases, outbound SMS/WhatsApp/voice/USSD, live M-Pesa sync, password-reset email and scheduled report delivery are not connected. The optional external speech/LLM providers have not been verified. Forecasts require sufficient recorded data and are not guarantees. Privacy/terms text requires legal review.

The source builds and local automated/browser tests passed, but Docker image builds and Compose deployment, a hosted VPS/TLS deployment, GitHub-hosted CI, external provider connectivity, full load/penetration testing and production disaster recovery were not verified. Stage, audit and back up before using real data. Follow `documentation/operations/production-vps-deployment-guide.md` and the backup runbook.
