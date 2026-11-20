import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Cog, HelpCircle, MessageCircle, Puzzle, ShieldCheck } from 'lucide-react';
import { apiRequest } from '../../services/api';

const PLAN_TOP_BAR: Record<string, string> = {
  starter: 'from-sky-400 to-cyan-400',
  growth: 'from-cyan-400 to-[#2ED3C2]',
  intelligence: 'from-[#2ED3C2] to-emerald-400',
  enterprise: 'from-emerald-400 to-lime-400',
};

const PLAN_FEATURES: Record<string, string[]> = {
  starter: [
    '1 branch · up to 3 team users',
    'CSV / Excel & manual record uploads',
    'Sales, M-Pesa log, stock & expense KPIs',
    'Clean executive dashboard & monthly summary',
  ],
  growth: [
    'Up to 3 branches · up to 10 team users',
    'CSV / Excel imports & exportable reports',
    'Low-stock & operational alerts',
    'Basic demand & sales forecasts',
    'Customer CRM with consent tracking',
  ],
  intelligence: [
    'Up to 10 branches · up to 25 team users',
    'Advanced sales, demand & 30-day cash-flow forecasts',
    'Customer RFM segmentation & anomaly detection',
    'Full BizWave AI (English & Kiswahili + What-If Simulator)',
    'Business discovery & customer consent records',
  ],
  enterprise: [
    'Up to 100 branches & role-based access',
    'Consolidated multi-branch analytics & custom KPIs',
    'Branch-scoped access and team permissions',
    'Plan and service information for reference',
  ],
};

const FAQS = [
  {
    q: 'Does BizWave handle or hold my customer payments?',
    a: 'No. Your customers continue paying your existing M-Pesa Till, Paybill, Bank, or Cash directly. BizWave records and analyses your operations; online subscription and add-on payments are not available yet.',
  },
  {
    q: 'Can I start with Excel spreadsheets and upgrade later?',
    a: 'You can start on Starter with CSV or Excel files. Online plan changes are not available yet; contact the administrator about plan options.',
  },
  {
    q: 'Who owns the data I upload into BizWave?',
    a: 'Your business owns 100% of its data. Every tenant is strictly isolated using PostgreSQL Row-Level Security, and you can export your records anytime.',
  },
  {
    q: 'How are SMS, WhatsApp, Voice, and USSD billed?',
    a: 'Outbound messaging and online add-on purchases are not connected yet. No messages are sent or charged through this release.',
  },
];

export const PricingPage: React.FC = () => {
  const [plans, setPlans] = useState<any[]>([]);

  useEffect(() => {
    apiRequest<{ plans: any[] }>('/subscriptions/plans', { skipAuth: true })
      .then((res) => setPlans(res.plans || []))
      .catch(() => setPlans([]));
  }, []);

  return (
    <div className="bg-[#041527] text-white">
      {/* Midnight Navy Hero with Data Wave Backdrop */}
      <section className="relative overflow-hidden border-b border-white/10 py-16 sm:py-20">
        <div className="absolute inset-0">
          <img
            src="/images/solution-data-wave.jpg"
            alt=""
            aria-hidden="true"
            fetchPriority="high"
            decoding="async"
            className="w-full h-full object-cover object-bottom opacity-45"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-[#041527] via-[#041527]/85 to-[#041527]" />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="text-xs font-bold uppercase tracking-widest text-[#2ED3C2]">Transparent KES Subscriptions</div>
          <h1 className="mt-2 text-3xl sm:text-5xl font-extrabold text-white tracking-tight">
            Simple Pricing Built for <span className="text-[#2ED3C2]">Kenyan SMEs.</span>
          </h1>
          <p className="mt-4 text-base text-slate-300 max-w-2xl mx-auto">
            Plan prices are shown for reference. Online plan changes and add-on purchases are not available yet.
          </p>

          <div className="mt-6 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#09223B] border border-[#2ED3C2]/30 text-xs font-medium text-slate-200">
            <ShieldCheck className="w-4 h-4 text-[#2ED3C2] shrink-0" />
            <span>
              <strong className="text-white">No online payments:</strong> BizWave does not process customer payments, and platform billing is not connected yet.
            </span>
          </div>
        </div>
      </section>

      {/* 4 Tiers */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {(plans.length > 0
            ? plans
            : [
                { code: 'starter', name: 'Starter', price_range_label: 'KES 1,500–2,500 / month' },
                { code: 'growth', name: 'Growth', price_range_label: 'KES 4,500–7,500 / month' },
                { code: 'intelligence', name: 'Intelligence', price_range_label: 'KES 10,000–18,000 / month' },
                { code: 'enterprise', name: 'Multi-Branch / Enterprise', price_range_label: 'From KES 25,000 / month' },
              ]
          ).map((plan) => (
            <div
              key={plan.code}
              className={`slide-card rounded-2xl overflow-hidden flex flex-col justify-between ${
                plan.code === 'intelligence' ? 'ring-2 ring-[#2ED3C2]/80' : ''
              }`}
            >
              <div>
                <div className={`h-1.5 bg-gradient-to-r ${PLAN_TOP_BAR[plan.code] || 'from-[#2ED3C2] to-cyan-400'}`} />
                <div className="p-6">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-base font-extrabold uppercase tracking-wide text-[#2ED3C2]">{plan.name}</h2>
                    {plan.code === 'intelligence' && (
                      <span className="px-2 py-0.5 rounded-full bg-[#2ED3C2]/15 border border-[#2ED3C2]/40 text-[10px] font-bold text-[#2ED3C2]">
                        Recommended
                      </span>
                    )}
                  </div>
                  <div className="mt-3 text-xl font-extrabold text-white">
                    {plan.price_range_label || `KES ${Number(plan.monthly_price_kes).toLocaleString()} / month`}
                  </div>
                  <div className="my-4 h-px bg-white/10" />
                  <ul className="space-y-2.5 text-xs sm:text-sm text-slate-300">
                    {(PLAN_FEATURES[plan.code] || []).map((feat) => (
                      <li key={feat} className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-[#2ED3C2] shrink-0 mt-0.5" />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              <div className="px-6 pb-6">
                <Link
                  to={plan.code === 'enterprise' ? '/contact' : '/register'}
                  className={`block w-full text-center py-2.5 rounded-xl text-xs font-bold transition-colors ${
                    plan.code === 'intelligence'
                      ? 'bg-[#2ED3C2] text-[#041527] hover:bg-[#5ce2d4]'
                      : 'bg-white/10 text-white hover:bg-[#2ED3C2] hover:text-[#041527]'
                  }`}
                >
                  {plan.code === 'enterprise' ? 'Contact us' : 'Create a Starter account'}
                </Link>
              </div>
            </div>
          ))}
        </div>

        {/* 3 Add-On Services */}
        <div className="mt-10 slide-card rounded-2xl p-6 sm:p-8 grid grid-cols-1 md:grid-cols-3 gap-6 divide-y md:divide-y-0 md:divide-x divide-white/10">
          <div className="flex items-start gap-4 pt-2 md:pt-0">
            <Cog className="w-7 h-7 text-sky-400 shrink-0 mt-0.5" />
            <div>
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-sky-400">One-Time Setup &amp; Services</h3>
              <p className="mt-2 text-xs text-slate-300 leading-relaxed">
                Onboarding · Data cleaning &amp; migration · POS/accounting integrations · Staff training · Custom dashboards
              </p>
            </div>
          </div>
          <div className="flex items-start gap-4 pt-5 md:pt-0 md:pl-6">
            <MessageCircle className="w-7 h-7 text-[#2ED3C2] shrink-0 mt-0.5" />
            <div>
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-[#2ED3C2]">Usage-Based Add-Ons</h3>
              <p className="mt-2 text-xs text-slate-300 leading-relaxed">
                Potential additional services are shown for reference only; purchases and message delivery are not connected.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-4 pt-5 md:pt-0 md:pl-6">
            <Puzzle className="w-7 h-7 text-lime-400 shrink-0 mt-0.5" />
            <div>
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-lime-400">Custom Projects &amp; Partnerships</h3>
              <p className="mt-2 text-xs text-slate-300 leading-relaxed">
                Bespoke ML &amp; forecasting · BI consulting · API integrations · Channel &amp; implementation partnerships
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing FAQ */}
      <section className="bg-[#031121] border-t border-white/10 py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-extrabold text-white text-center">Billing &amp; Subscription FAQ</h2>
          <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-5">
            {FAQS.map((item) => (
              <div key={item.q} className="slide-card rounded-2xl p-6 space-y-2">
                <div className="flex items-start gap-2.5">
                  <HelpCircle className="w-4 h-4 text-[#2ED3C2] shrink-0 mt-1" />
                  <h3 className="text-sm font-bold text-white">{item.q}</h3>
                </div>
                <p className="text-xs sm:text-sm text-slate-300 leading-relaxed pl-6">{item.a}</p>
              </div>
            ))}
          </div>
          <div className="mt-10 text-center">
            <Link
              to="/register"
              className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-[#2ED3C2] text-[#041527] text-sm font-bold hover:bg-[#5ce2d4]"
            >
              Launch Your Business Workspace <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
};
