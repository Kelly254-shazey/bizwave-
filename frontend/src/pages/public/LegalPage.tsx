import React from 'react';
import { Database, Lock, ShieldCheck, UserCheck } from 'lucide-react';

export const LegalPage: React.FC<{ mode: 'privacy' | 'terms' }> = ({ mode }) => (
  <div className="py-16 sm:py-24 bg-[#041527] text-white">
    <div className="max-w-4xl mx-auto px-4 sm:px-6 space-y-8">
      <div>
        <div className="text-xs font-bold uppercase tracking-widest text-[#2ED3C2]">
          {mode === 'privacy' ? 'Trust & Data Protection Center' : 'Commercial SaaS Agreement'}
        </div>
        <h1 className="mt-2 text-3xl sm:text-4xl font-extrabold text-white">
          {mode === 'privacy'
            ? 'Your Business Data Belongs 100% to You.'
            : 'Clear Terms Built for Kenyan SMEs.'}
        </h1>
        <div className="teal-bar mt-4" />
        <p className="mt-3 text-xs text-slate-400">Effective Date: November 2026 · Republic of Kenya (Kenya Data Protection Act, 2019)</p>
      </div>

      {/* Plain-English Trust Highlights */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { icon: Database, title: '100% Ownership', desc: 'Your spreadsheets, sales, and customer records remain strictly your property.' },
          { icon: Lock, title: 'Tenant Isolation', desc: 'PostgreSQL Row-Level Security isolates every business at the database layer.' },
          { icon: ShieldCheck, title: 'Non-Custodial', desc: 'No customer money passes through BizWave — only subscription & service fees.' },
          { icon: UserCheck, title: 'Consent First', desc: 'BizWave Connect enforces explicit per-channel opt-in under Kenya DPA 2019.' },
        ].map((card) => (
          <div key={card.title} className="slide-card rounded-xl p-4 space-y-2">
            <card.icon className="w-5 h-5 text-[#2ED3C2]" />
            <div className="text-xs font-bold text-white">{card.title}</div>
            <p className="text-[11px] text-slate-400 leading-relaxed">{card.desc}</p>
          </div>
        ))}
      </div>

      {mode === 'privacy' ? (
        <div className="slide-card rounded-2xl p-6 sm:p-8 space-y-4 text-sm text-slate-300 leading-relaxed">
          <p>
            BizWave Technologies Ltd processes business and customer records strictly as a Data Processor on behalf of registered Kenyan SME organizations (Data Controllers) in compliance with the <strong className="text-white">Kenya Data Protection Act, 2019</strong>.
          </p>
          <h2 className="text-base font-bold text-[#2ED3C2] pt-2">1. Database-Enforced Isolation &amp; Encryption</h2>
          <p>
            Every tenant record is protected by PostgreSQL Forced Row-Level Security (RLS), transaction-scoped tenant context, Argon2id password hashing, rotating refresh tokens, AES-256-GCM encryption for integration credentials, and tamper-evident audit trails.
          </p>
          <h2 className="text-base font-bold text-[#2ED3C2] pt-2">2. Non-Custodial Analytics &amp; Customer Consent</h2>
          <p>
            BizWave does not process or hold customer payments. Sales and M-Pesa records uploaded by your organization are used solely for analytics, forecasting, and AI decision guidance. Customer outreach through BizWave Connect enforces explicit opt-in consent and supports Kenya DPA access exports.
          </p>
        </div>
      ) : (
        <div className="slide-card rounded-2xl p-6 sm:p-8 space-y-4 text-sm text-slate-300 leading-relaxed">
          <p>
            These Terms govern your organization&apos;s access to the BizWave SaaS platform: BizWave Analytics, BizWave Predict, BizWave AI, and BizWave Connect.
          </p>
          <h2 className="text-base font-bold text-[#2ED3C2] pt-2">1. Ownership &amp; Portability of Business Data</h2>
          <p>
            Your organization retains full ownership of all uploaded spreadsheets, sales records, financial logs, inventory counts, and customer records. You may export your data at any time.
          </p>
          <h2 className="text-base font-bold text-[#2ED3C2] pt-2">2. Scope of Payments</h2>
          <p>
            No customer payments pass through BizWave. Billing applies exclusively to BizWave SaaS subscription fees and optional BizWave platform services (onboarding, data cleaning, communication bundles, integrations, and custom BI).
          </p>
          <h2 className="text-base font-bold text-[#2ED3C2] pt-2">3. Forecasts &amp; AI Decision Support</h2>
          <p>
            Forecasts, What-If simulations, and AI explanations are statistical estimates grounded in your historical records. Final commercial and financial decisions remain the responsibility of authorized business officers.
          </p>
        </div>
      )}
    </div>
  </div>
);
