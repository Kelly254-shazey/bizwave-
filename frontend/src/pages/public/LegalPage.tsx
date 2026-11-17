import React from 'react';

export const LegalPage: React.FC<{ mode: 'privacy' | 'terms' }> = ({ mode }) => (
  <div className="py-16 sm:py-24 bg-[#041527] text-white">
    <div className="max-w-3xl mx-auto px-4 sm:px-6 space-y-6">
      <div className="text-xs font-bold uppercase tracking-widest text-[#2ED3C2]">
        {mode === 'privacy' ? 'Kenya Data Protection Act, 2019 Compliance' : 'Commercial SaaS Agreement'}
      </div>
      <h1 className="text-3xl font-extrabold text-white">
        {mode === 'privacy' ? 'BizWave Privacy Policy' : 'BizWave Terms of Service'}
      </h1>
      <div className="teal-bar" />
      <p className="text-xs text-slate-400">Effective Date: November 2026 · Jurisdiction: Republic of Kenya</p>

      {mode === 'privacy' ? (
        <div className="slide-card rounded-2xl p-6 sm:p-8 space-y-4 text-sm text-slate-300 leading-relaxed">
          <p>
            BizWave Technologies Ltd processes business and customer records strictly as a Data Processor on behalf of registered Kenyan SME organizations (Data Controllers) in compliance with the <strong className="text-white">Kenya Data Protection Act, 2019</strong>.
          </p>
          <h2 className="text-base font-bold text-[#2ED3C2] pt-2">1. Tenant Data Isolation &amp; Security</h2>
          <p>
            Every tenant record is protected by PostgreSQL Row-Level Security (RLS), transaction-scoped tenant context, Argon2id password hashing, rotating refresh tokens, AES-256-GCM encryption for integration credentials, and tamper-evident audit logs.
          </p>
          <h2 className="text-base font-bold text-[#2ED3C2] pt-2">2. Non-Custodial Analytics &amp; Consent</h2>
          <p>
            BizWave does not process or custody customer payments. Sales and M-Pesa logs uploaded by your organization are used exclusively for analytics, forecasting, and AI guidance. Customer communications through BizWave Connect enforce explicit per-channel consent before campaigns can be dispatched.
          </p>
        </div>
      ) : (
        <div className="slide-card rounded-2xl p-6 sm:p-8 space-y-4 text-sm text-slate-300 leading-relaxed">
          <p>
            These Terms govern your organization&apos;s access to the BizWave SaaS platform: BizWave Analytics, BizWave Predict, BizWave AI, and BizWave Connect.
          </p>
          <h2 className="text-base font-bold text-[#2ED3C2] pt-2">1. Ownership of Business Data</h2>
          <p>
            Your organization retains 100% ownership of all uploaded spreadsheets, sales records, financial ledgers, inventory data, and customer records. BizWave never trains cross-tenant models on identifiable tenant data without explicit written consent.
          </p>
          <h2 className="text-base font-bold text-[#2ED3C2] pt-2">2. Billing Scope &amp; Non-Custodial Platform</h2>
          <p>
            No customer payments pass through BizWave. Billing applies exclusively to BizWave SaaS subscription fees and optional BizWave platform services (onboarding, add-on communication bundles, integrations, and custom BI).
          </p>
          <h2 className="text-base font-bold text-[#2ED3C2] pt-2">3. Forecasts &amp; Decision Support</h2>
          <p>
            Forecasts, What-If simulations, and AI explanations are statistical estimates grounded in your historical records. Final commercial and financial decisions remain the responsibility of authorized business officers.
          </p>
        </div>
      )}
    </div>
  </div>
);
