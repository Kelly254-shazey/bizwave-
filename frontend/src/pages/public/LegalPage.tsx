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
        <p className="mt-3 text-xs text-amber-300">Draft informational text — legal review and approved policies are required before publication.</p>
      </div>

      {/* Plain-English Trust Highlights */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { icon: Database, title: '100% Ownership', desc: 'Your spreadsheets, sales, and customer records remain strictly your property.' },
          { icon: Lock, title: 'Tenant Isolation', desc: 'PostgreSQL Row-Level Security isolates every business at the database layer.' },
          { icon: ShieldCheck, title: 'No Online Payments', desc: 'Customer payments and platform billing are not processed in this release.' },
          { icon: UserCheck, title: 'Consent Records', desc: 'Record channel-specific marketing consent; outbound messaging is not connected.' },
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
            Business and customer records can include personal information. The operator should identify the actual data controller and processor, describe retention and subprocessors, and approve a complete privacy policy with qualified counsel before launch.
          </p>
          <h2 className="text-base font-bold text-[#2ED3C2] pt-2">1. Database-Enforced Isolation &amp; Encryption</h2>
          <p>
            Tenant-scoped tables use PostgreSQL row-level security and application authorization. The platform also includes password hashing, refresh sessions, encrypted integration credentials and an audit chain. These controls do not themselves establish legal compliance.
          </p>
          <h2 className="text-base font-bold text-[#2ED3C2] pt-2">2. Non-Custodial Analytics &amp; Customer Consent</h2>
          <p>
            BizWave does not process or hold customer payments in this release. Authorized users can maintain consent records and request a customer-data export. Outbound messaging is not connected; data-subject requests require an operator-managed review.
          </p>
        </div>
      ) : (
        <div className="slide-card rounded-2xl p-6 sm:p-8 space-y-4 text-sm text-slate-300 leading-relaxed">
          <p>
            This is draft product information, not an approved customer agreement. The operator should publish reviewed terms appropriate to the actual service before launch.
          </p>
          <h2 className="text-base font-bold text-[#2ED3C2] pt-2">1. Ownership &amp; Portability of Business Data</h2>
          <p>
            Your organization controls the business data it enters. Specific reports and customer-data exports are available to authorized users; a complete self-service export is not represented here.
          </p>
          <h2 className="text-base font-bold text-[#2ED3C2] pt-2">2. Scope of Payments</h2>
          <p>
            No customer payments pass through BizWave. Online subscription changes, add-on purchases and platform payment collection are not available yet.
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
