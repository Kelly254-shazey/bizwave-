import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Cog,
  Lock,
  MessageCircle,
  MessageSquare,
  Puzzle,
  ShieldCheck,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import { apiRequest } from '../../services/api';

const PLAN_TOP_BAR: Record<string, string> = {
  starter: 'from-sky-400 to-cyan-400',
  growth: 'from-cyan-400 to-[#2ED3C2]',
  intelligence: 'from-[#2ED3C2] to-emerald-400',
  enterprise: 'from-emerald-400 to-lime-400',
};

const PLAN_AUDIENCE: Record<string, string> = {
  starter: 'For micro businesses',
  growth: 'For growing SMEs',
  intelligence: 'For data-driven SMEs',
  enterprise: 'For multi-branch operations',
};

const PLAN_HIGHLIGHTS: Record<string, string[]> = {
  starter: [
    'Spreadsheet & manual record uploads',
    'Essential sales and expense KPIs',
    'Clean executive dashboard',
    'Monthly business summary',
  ],
  growth: [
    'Automated imports where available',
    'Sales, customer & inventory dashboards',
    'Weekly management reports',
    'Low-stock & operational alerts',
    'Basic demand & sales forecasts',
  ],
  intelligence: [
    'Advanced sales, demand & cash-flow forecasts',
    'Customer RFM segmentation & anomaly detection',
    'BizWave AI assistant (English & Kiswahili)',
    'What-If financial simulator & reports',
  ],
  enterprise: [
    'Consolidated multi-branch analytics',
    'Custom KPIs & industry templates',
    'POS, accounting & channel integrations',
    'Role-based access & dedicated support',
  ],
};

export const HomePage: React.FC = () => {
  const [plans, setPlans] = useState<any[]>([]);

  useEffect(() => {
    apiRequest<{ plans: any[] }>('/subscriptions/plans', { skipAuth: true })
      .then((res) => setPlans(res.plans || []))
      .catch(() => setPlans([]));
  }, []);

  return (
    <div className="bg-[#041527] text-white">
      {/* =====================================================================
          1. HERO — Clean Structured Content on Deep Midnight Navy + Editorial Backdrop
         ===================================================================== */}
      <section className="relative overflow-hidden border-b border-white/10">
        <div className="absolute inset-0">
          <img
            src="/images/hero-nairobi-sme.jpg"
            alt="Nairobi SME owner working on laptop and business insights overlooking the city"
            fetchPriority="high"
            decoding="async"
            className="w-full h-full object-cover object-right opacity-85"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#041527] via-[#041527]/92 to-[#041527]/25" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#041527] via-transparent to-[#041527]/40" />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-24 lg:py-28">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            <div className="lg:col-span-7 space-y-6">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#09223B]/90 border border-[#2ED3C2]/35 text-[#2ED3C2] text-xs font-semibold">
                <Sparkles className="w-3.5 h-3.5" />
                AI-Powered SME Intelligence · Built for Nairobi &amp; Kenya
              </div>

              <h1 className="text-4xl sm:text-5xl lg:text-[56px] font-extrabold text-white tracking-tight leading-[1.08]">
                Turn Your Business Data Into{' '}
                <span className="text-[#2ED3C2]">Better Decisions.</span>
              </h1>
              <div className="teal-bar" />

              <p className="text-base sm:text-lg text-slate-200 leading-relaxed max-w-xl">
                Autonomous business intelligence and customer communications for SMEs. Understand what is happening, why it is happening, and what to do next — in one calm, connected workspace.
              </p>

              <div className="flex flex-wrap items-center gap-3.5 pt-1">
                <Link
                  to="/register"
                  className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-[#2ED3C2] text-[#041527] text-sm font-bold hover:bg-[#5ce2d4] transition-colors shadow-lg shadow-[#2ED3C2]/20"
                >
                  Register Your Business <ArrowRight className="w-4 h-4" />
                </Link>
                <Link
                  to="/benefits"
                  className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl border border-white/25 bg-white/5 text-white text-sm font-semibold hover:bg-white/10 transition-colors"
                >
                  Explore Benefits
                </Link>
              </div>

              {/* Clean Trust Indicators */}
              <div className="pt-5 border-t border-white/15 grid grid-cols-2 sm:grid-cols-3 gap-4 text-xs text-slate-300 max-w-xl">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-[#2ED3C2] shrink-0" />
                  <span>Record &amp; analyse only</span>
                </div>
                <div className="flex items-center gap-2">
                  <Lock className="w-4 h-4 text-[#2ED3C2] shrink-0" />
                  <span>Isolated tenant data</span>
                </div>
                <div className="flex items-center gap-2 col-span-2 sm:col-span-1">
                  <Sparkles className="w-4 h-4 text-[#2ED3C2] shrink-0" />
                  <span>English &amp; Kiswahili AI</span>
                </div>
              </div>
            </div>

            {/* Right Capability Summary Card over the Hero Visual */}
            <div className="lg:col-span-5">
              <div className="slide-card rounded-2xl p-6 space-y-4 border-[#2ED3C2]/30">
                <div className="text-xs font-bold uppercase tracking-widest text-[#2ED3C2]">4 Connected Pillars</div>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'Analytics', sub: 'Live KPIs & P&L', icon: BarChart3 },
                    { label: 'Predict', sub: 'Cash & Demand', icon: TrendingUp },
                    { label: 'BizWave AI', sub: 'EN & Kiswahili', icon: Sparkles },
                    { label: 'Connect', sub: 'SMS · WhatsApp', icon: MessageSquare },
                  ].map((item) => (
                    <div key={item.label} className="p-3.5 rounded-xl bg-[#041527]/85 border border-white/10">
                      <item.icon className="w-4 h-4 text-[#2ED3C2] mb-2" />
                      <div className="text-sm font-extrabold text-white">{item.label}</div>
                      <div className="text-[11px] font-medium text-slate-400">{item.sub}</div>
                    </div>
                  ))}
                </div>
                <div className="pt-2 border-t border-white/10 text-xs text-slate-300 flex items-center justify-between">
                  <span>Start from Excel, CSV, or daily logs</span>
                  <Link to="/how-it-works" className="text-[#2ED3C2] font-bold hover:underline">
                    See flow →
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =====================================================================
          2. THE PROBLEM WE SOLVE (Dark Navy + Fragmented Ledger Backdrop)
         ===================================================================== */}
      <section className="relative overflow-hidden border-b border-white/10 py-20">
        <div className="absolute inset-0">
          <img
            src="/images/problem-fragmented.jpg"
            alt="SME owner sorting scattered paper receipts, notebooks, and manual spreadsheets"
            loading="lazy"
            decoding="async"
            className="w-full h-full object-cover object-right opacity-55"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#041527] via-[#041527]/94 to-[#041527]/45" />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <div className="text-xs font-bold uppercase tracking-widest text-[#2ED3C2]">The Problem</div>
            <h2 className="mt-2 text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
              SMEs make critical decisions with{' '}
              <span className="text-[#2ED3C2]">fragmented records</span> and limited visibility.
            </h2>
            <div className="teal-bar mt-4" />
          </div>

          <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              {
                title: 'Scattered Daily Records',
                desc: 'Sales, M-Pesa transactions, stock, expenses, and customer contacts sit in separate books and apps.',
              },
              {
                title: 'Manual Spreadsheet Errors',
                desc: 'Hours lost every week copying totals by hand — introducing costly reporting mistakes.',
              },
              {
                title: 'No Analyst or Forecasts',
                desc: 'Owners rarely have dedicated analysts to project cash flow, stock demand, or margin shifts.',
              },
              {
                title: 'Reactive Decisions',
                desc: 'Stockouts, rising costs, and silent customer churn are spotted only after revenue has dropped.',
              },
            ].map((item) => (
              <div key={item.title} className="slide-card rounded-xl p-5">
                <h3 className="text-sm font-bold text-[#2ED3C2]">{item.title}</h3>
                <p className="mt-2 text-xs sm:text-sm text-slate-300 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* =====================================================================
          3. THE SOLUTION — ONE PLATFORM, FOUR POWERFUL PILLARS (Data Wave Backdrop)
         ===================================================================== */}
      <section className="relative overflow-hidden border-b border-white/10 py-20 sm:py-24">
        <div className="absolute inset-0">
          <img
            src="/images/solution-data-wave.jpg"
            alt=""
            aria-hidden="true"
            loading="lazy"
            decoding="async"
            className="w-full h-full object-cover object-bottom opacity-60"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-[#041527] via-[#041527]/78 to-[#041527]/70" />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto">
            <div className="text-xs font-bold uppercase tracking-widest text-[#2ED3C2]">The BizWave Platform</div>
            <h2 className="mt-2 text-3xl sm:text-4xl font-extrabold text-white">
              One Connected Platform. <span className="text-[#2ED3C2]">Four Powerful Pillars.</span>
            </h2>
            <p className="mt-3 text-sm sm:text-base text-slate-300">
              Everything a Kenyan SME needs to unify business records, forecast ahead, ask AI in plain language, and act through customer channels.
            </p>
          </div>

          <div className="mt-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              {
                icon: BarChart3,
                title: 'BizWave Analytics',
                tag: 'Pillar 01',
                desc: 'Unifies sales, M-Pesa records, stock, expenses, and customers into consistent KPIs, executive dashboards, and clean reports.',
              },
              {
                icon: TrendingUp,
                title: 'BizWave Predict',
                tag: 'Pillar 02',
                desc: 'Delivers sales, stock-demand, and 30-day cash-flow forecasts alongside customer RFM segmentation and anomaly alerts.',
              },
              {
                icon: Sparkles,
                title: 'BizWave AI',
                tag: 'Pillar 03',
                desc: 'Ask everyday business questions in English or Kiswahili, run What-If financial simulations, and hear voice summaries grounded in your data.',
              },
              {
                icon: MessageSquare,
                title: 'BizWave Connect',
                tag: 'Pillar 04',
                desc: 'Connects Voice, SMS, WhatsApp, and USSD with Kenya DPA consent controls and measurable interaction analytics.',
              },
            ].map((p) => (
              <div key={p.title} className="slide-card rounded-2xl p-6 flex flex-col">
                <div className="flex items-center justify-between mb-4">
                  <div className="w-11 h-11 rounded-xl bg-[#2ED3C2]/15 border border-[#2ED3C2]/30 flex items-center justify-center text-[#2ED3C2]">
                    <p.icon className="w-5 h-5" />
                  </div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{p.tag}</span>
                </div>
                <h3 className="text-lg font-extrabold text-[#2ED3C2]">{p.title}</h3>
                <p className="mt-2.5 text-sm text-slate-300 leading-relaxed flex-1">{p.desc}</p>
              </div>
            ))}
          </div>

          <div className="mt-10 text-center">
            <Link
              to="/benefits"
              className="inline-flex items-center gap-1.5 text-sm font-bold text-[#2ED3C2] hover:text-white transition-colors"
            >
              See how BizWave transforms day-to-day SME operations <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* =====================================================================
          4. WHO WE SERVE (Dark Navy + Kenyan Store Owner Backdrop)
         ===================================================================== */}
      <section className="relative overflow-hidden border-b border-white/10 py-20">
        <div className="absolute inset-0">
          <img
            src="/images/who-we-serve-sme.jpg"
            alt="Kenyan retail business owner reviewing clear sales metrics on her tablet"
            loading="lazy"
            decoding="async"
            className="w-full h-full object-cover object-right opacity-75"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#041527] via-[#041527]/94 to-[#041527]/25" />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-xl space-y-6">
            <div>
              <div className="text-xs font-bold uppercase tracking-widest text-[#2ED3C2]">Who We Serve</div>
              <h2 className="mt-2 text-3xl sm:text-4xl font-extrabold text-white">
                Built for Real Businesses Across <span className="text-[#2ED3C2]">Nairobi &amp; Kenya.</span>
              </h2>
              <div className="teal-bar mt-4" />
            </div>

            <div className="space-y-4">
              {[
                {
                  title: 'Micro & Growing Businesses',
                  desc: 'Currently tracking operations in paper books, M-Pesa messages, WhatsApp, and Excel sheets.',
                },
                {
                  title: 'Digitising SMEs',
                  desc: 'Running retail POS systems, Google Sheets, and accounting software that need one unified brain.',
                },
                {
                  title: 'Multi-Sector Fit',
                  desc: 'Retail shops, restaurants, salons, wholesalers, distributors, and service businesses.',
                },
                {
                  title: 'Every Role Protected',
                  desc: 'Owners see group profitability while branch managers and staff see strictly their scoped screens.',
                },
              ].map((item) => (
                <div key={item.title} className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-[#2ED3C2] shrink-0 mt-0.5" />
                  <div>
                    <h3 className="text-sm sm:text-base font-bold text-white">{item.title}</h3>
                    <p className="text-xs sm:text-sm text-slate-300 mt-0.5">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-2">
              <Link
                to="/how-it-works"
                className="inline-flex items-center gap-2 text-sm font-bold text-[#2ED3C2] hover:text-white"
              >
                Walk through the 10-minute setup workflow <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* =====================================================================
          5. MODULAR PLANS & PRICING (Cleanly Placed Inside the Page — NOT in Top Nav)
         ===================================================================== */}
      <section id="pricing" className="bg-[#031121] border-b border-white/10 py-20 sm:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div>
              <div className="text-xs font-bold uppercase tracking-widest text-[#2ED3C2]">Plans &amp; Pricing</div>
              <h2 className="mt-2 text-3xl sm:text-4xl font-extrabold text-white">
                Modular KES Plans That <span className="text-[#2ED3C2]">Grow With You.</span>
              </h2>
              <p className="mt-2 text-sm sm:text-base text-slate-300 max-w-xl">
                Start lean with spreadsheets and upgrade only as your data, branches, and AI automation scale.
              </p>
            </div>
            <div className="inline-flex items-start gap-2.5 px-4 py-3 rounded-xl bg-[#09223B] border border-[#2ED3C2]/30 max-w-md text-xs text-slate-200">
              <ShieldCheck className="w-4 h-4 text-[#2ED3C2] shrink-0 mt-0.5" />
              <span>
                <strong className="text-white">Record &amp; Analyse Only:</strong> No customer payments pass through BizWave. Only BizWave subscriptions and platform add-on services are billed.
              </span>
            </div>
          </div>

          <div className="mt-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
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
                      <h3 className="text-base font-extrabold uppercase tracking-wide text-[#2ED3C2]">{plan.name}</h3>
                      {plan.code === 'intelligence' && (
                        <span className="px-2 py-0.5 rounded-full bg-[#2ED3C2]/15 border border-[#2ED3C2]/40 text-[10px] font-bold text-[#2ED3C2]">
                          Popular
                        </span>
                      )}
                    </div>
                    <div className="mt-3 text-xl font-extrabold text-white">
                      {plan.price_range_label || `KES ${Number(plan.monthly_price_kes).toLocaleString()} / month`}
                    </div>
                    <div className="mt-1 text-xs font-medium text-emerald-400">
                      {PLAN_AUDIENCE[plan.code] || 'For Kenyan SMEs'}
                    </div>
                    <div className="my-4 h-px bg-white/10" />
                    <ul className="space-y-2.5 text-xs sm:text-sm text-slate-300">
                      {(PLAN_HIGHLIGHTS[plan.code] || []).map((line) => (
                        <li key={line} className="flex items-start gap-2">
                          <CheckCircle2 className="w-4 h-4 text-[#2ED3C2] shrink-0 mt-0.5" />
                          <span>{line}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
                <div className="px-6 pb-6">
                  <Link
                    to="/register"
                    className={`block w-full text-center py-2.5 rounded-xl text-xs font-bold transition-colors ${
                      plan.code === 'intelligence'
                        ? 'bg-[#2ED3C2] text-[#041527] hover:bg-[#5ce2d4]'
                        : 'bg-white/10 text-white hover:bg-[#2ED3C2] hover:text-[#041527]'
                    }`}
                  >
                    Start with {plan.name}
                  </Link>
                </div>
              </div>
            ))}
          </div>

          {/* 3 Platform Add-On Services Strip */}
          <div className="mt-6 slide-card rounded-2xl p-6 grid grid-cols-1 md:grid-cols-3 gap-6 divide-y md:divide-y-0 md:divide-x divide-white/10">
            <div className="flex items-start gap-3.5 pt-2 md:pt-0">
              <Cog className="w-6 h-6 text-sky-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-sky-400">One-Time Setup &amp; Services</h4>
                <p className="mt-1.5 text-xs text-slate-300 leading-relaxed">
                  Guided onboarding · Data cleaning &amp; migration · System integrations · Staff training
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3.5 pt-5 md:pt-0 md:pl-6">
              <MessageCircle className="w-6 h-6 text-[#2ED3C2] shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-[#2ED3C2]">Usage-Based Add-Ons</h4>
                <p className="mt-1.5 text-xs text-slate-300 leading-relaxed">
                  Voice-agent minutes · SMS &amp; WhatsApp conversations · USSD transactions · Extra branches &amp; users
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3.5 pt-5 md:pt-0 md:pl-6">
              <Puzzle className="w-6 h-6 text-lime-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-lime-400">Custom Projects &amp; Partnerships</h4>
                <p className="mt-1.5 text-xs text-slate-300 leading-relaxed">
                  Bespoke ML &amp; forecasting · BI consulting · API integrations · Channel partnerships
                </p>
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
            <span>Indicative KES pricing for SME onboarding; final plans depend on usage, data volume, and integrations.</span>
            <Link to="/pricing" className="font-bold text-[#2ED3C2] hover:underline inline-flex items-center gap-1">
              View full plan comparison &amp; FAQ <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </section>

      {/* =====================================================================
          6. FINAL CTA — Sustainable Growth Backdrop
         ===================================================================== */}
      <section className="relative overflow-hidden py-20 sm:py-24">
        <div className="absolute inset-0">
          <img
            src="/images/growth-sustainable.jpg"
            alt="Sustainable SME growth"
            loading="lazy"
            decoding="async"
            className="w-full h-full object-cover object-right opacity-50"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#041527] via-[#041527]/92 to-[#041527]/45" />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl space-y-5">
            <div className="text-xs font-bold uppercase tracking-widest text-[#2ED3C2]">Ready When You Are</div>
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight leading-tight text-white">
              Start From Your Existing Spreadsheets — Grow Into Full AI Intelligence.
            </h2>
            <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
              Launch your isolated BizWave workspace in 60 seconds with zero demo clutter, strict Kenya DPA 2019 privacy, and English &amp; Kiswahili AI guidance.
            </p>
            <div className="pt-2 flex flex-wrap gap-3.5">
              <Link
                to="/register"
                className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-[#2ED3C2] text-[#041527] text-sm font-bold hover:bg-[#5ce2d4] transition-colors"
              >
                Create Your Workspace <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                to="/contact"
                className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl border border-white/25 text-white text-sm font-semibold hover:bg-white/10 transition-colors"
              >
                Talk to Our Nairobi Team
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
