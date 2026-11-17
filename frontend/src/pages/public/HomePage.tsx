import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Cog,
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
  starter: 'micro businesses',
  growth: 'growing SMEs',
  intelligence: 'data-driven SMEs',
  enterprise: 'multiple branches or complex operations',
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
    'Customer RFM segmentation',
    'Automated anomaly detection',
    'BizWave AI assistant (English & Kiswahili)',
    'What-If scenario simulation & reports',
  ],
  enterprise: [
    'Consolidated multi-branch analytics',
    'Custom KPIs & industry templates',
    'POS, accounting & channel integrations',
    'Role-based access & branch permissions',
    'Tailored reporting and dedicated support',
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
          SLIDE 1 — HERO: Midnight Navy + Nairobi SME Owner Editorial Backdrop
         ===================================================================== */}
      <section className="relative overflow-hidden border-b border-white/10">
        <div className="absolute inset-0">
          <img
            src="/images/hero-nairobi-sme.jpg"
            alt="Nairobi SME owner working on laptop and ledger overlooking the city skyline"
            className="w-full h-full object-cover object-right opacity-85"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#041527] via-[#041527]/92 to-[#041527]/20" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#041527] via-transparent to-[#041527]/40" />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-28 lg:py-32">
          <div className="max-w-2xl">
            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight leading-none">
              <span className="text-white">Biz</span>
              <span className="text-[#2ED3C2]">Wave</span>
            </h1>
            <div className="teal-bar mt-6" />

            <p className="mt-7 text-2xl sm:text-3xl font-semibold text-white leading-snug">
              Autonomous business intelligence and customer communications{' '}
              <span className="text-[#2ED3C2]">for SMEs</span>
            </p>

            <p className="mt-4 text-lg text-slate-200 font-medium">
              Turn business data into better decisions.
            </p>

            <div className="mt-8 pl-5 border-l-2 border-[#2ED3C2] space-y-4 text-sm sm:text-base text-slate-300 max-w-md">
              <p>Built for Nairobi SMEs, designed to scale across Kenya.</p>
              <div className="h-px w-24 bg-[#2ED3C2]/40" />
              <p>Understand what is happening, why it is happening and what to do next.</p>
            </div>

            <div className="mt-10 flex flex-wrap items-center gap-4">
              <Link
                to="/register"
                className="inline-flex items-center gap-2 px-6 py-3.5 rounded-lg bg-[#2ED3C2] text-[#041527] text-sm font-bold hover:bg-[#5ce2d4] transition-colors shadow-lg shadow-[#2ED3C2]/20"
              >
                Register Your Business <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                to="/login"
                className="inline-flex items-center gap-2 px-6 py-3.5 rounded-lg border border-white/25 bg-white/5 text-white text-sm font-semibold hover:bg-white/10 transition-colors"
              >
                Sign In to Client Portal
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* =====================================================================
          SLIDE 2 — THE PROBLEM
         ===================================================================== */}
      <section className="relative overflow-hidden border-b border-white/10">
        <div className="absolute inset-0">
          <img
            src="/images/problem-fragmented.jpg"
            alt="SME owner examining scattered paper receipts and manual ledgers"
            className="w-full h-full object-cover object-right opacity-70"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#041527] via-[#041527]/95 to-[#041527]/35" />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-24">
          <div className="max-w-xl">
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight uppercase">
              THE <span className="text-[#2ED3C2]">PROBLEM</span>
            </h2>
            <div className="teal-bar mt-4" />

            <p className="mt-7 text-xl text-slate-100 leading-relaxed">
              SMEs make important decisions with{' '}
              <span className="text-[#2ED3C2] font-semibold">fragmented</span> records and{' '}
              <span className="text-[#2ED3C2] font-semibold">limited visibility</span>.
            </p>

            <ul className="mt-7 space-y-5 text-base text-slate-300">
              <li className="flex items-start gap-3">
                <span className="mt-2 w-2 h-2 rounded-full bg-[#2ED3C2] shrink-0" />
                <span>Sales, M-Pesa transactions, stock, expenses and customer records are kept separately.</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="mt-2 w-2 h-2 rounded-full bg-[#2ED3C2] shrink-0" />
                <span>Manual spreadsheets and reporting consume time and cause errors.</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="mt-2 w-2 h-2 rounded-full bg-[#2ED3C2] shrink-0" />
                <span>Business owners lack dedicated data analysts and reliable forecasts.</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="mt-2 w-2 h-2 rounded-full bg-[#2ED3C2] shrink-0" />
                <span>Decisions about stock, cash flow and customers are often reactive rather than data-driven.</span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* =====================================================================
          SLIDE 3 — THE SOLUTION (4 Connected Pillars -> BIZWAVE Hub)
         ===================================================================== */}
      <section className="relative overflow-hidden border-b border-white/10">
        <div className="absolute inset-0">
          <img
            src="/images/solution-data-wave.jpg"
            alt=""
            aria-hidden="true"
            className="w-full h-full object-cover object-bottom opacity-65"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-[#041527] via-[#041527]/75 to-[#041527]/60" />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-24">
          <div>
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight uppercase">
              THE <span className="text-[#2ED3C2]">SOLUTION</span>
            </h2>
            <div className="teal-bar mt-4" />
            <p className="mt-5 text-2xl sm:text-3xl font-bold text-white">One connected platform.</p>
            <p className="text-2xl sm:text-3xl font-bold text-[#2ED3C2]">Four powerful pillars.</p>
          </div>

          <div className="mt-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {[
              {
                icon: BarChart3,
                title: 'BizWave Analytics',
                desc: 'Integrates business data (sales, M-Pesa records, stock, expenses & customers) and provides KPIs, dashboards and reports.',
              },
              {
                icon: TrendingUp,
                title: 'BizWave Predict',
                desc: 'Provides sales, demand and cash-flow forecasts, as well as customer segmentation and anomaly insights.',
              },
              {
                icon: Sparkles,
                title: 'BizWave AI',
                desc: 'Allows business owners to ask business questions in simple English or Kiswahili — grounded directly in live records.',
              },
              {
                icon: MessageSquare,
                title: 'BizWave Connect',
                desc: 'Integrates Voice, SMS, WhatsApp and USSD with measurable customer interaction analytics.',
              },
            ].map((p) => (
              <div key={p.title} className="slide-card rounded-xl p-6 text-center flex flex-col items-center">
                <div className="w-11 h-11 rounded-lg bg-[#2ED3C2]/15 border border-[#2ED3C2]/30 flex items-center justify-center text-[#2ED3C2] mb-4">
                  <p.icon className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-bold text-[#2ED3C2]">{p.title}</h3>
                <p className="mt-3 text-sm text-slate-300 leading-relaxed">{p.desc}</p>
              </div>
            ))}
          </div>

          {/* Central Connected Platform Hub matching Slide 3 */}
          <div className="mt-8 flex flex-col items-center">
            <div className="hidden lg:flex items-center justify-center w-3/4 h-8 relative">
              <div className="absolute inset-x-0 top-0 h-4 border-b-2 border-l-2 border-r-2 border-[#2ED3C2]/60 rounded-b-xl" />
              <div className="w-0.5 h-8 bg-[#2ED3C2]/80" />
            </div>
            <div className="slide-card rounded-xl px-10 py-6 text-center border-[#2ED3C2]/40 shadow-2xl shadow-[#2ED3C2]/15">
              <div className="text-2xl sm:text-3xl font-extrabold tracking-wide text-white">BIZWAVE</div>
              <div className="mt-1 text-xs sm:text-sm font-semibold tracking-widest uppercase text-[#2ED3C2]">
                AI-POWERED SME INTELLIGENCE PLATFORM
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =====================================================================
          SLIDE 4 — WHO WE SERVE
         ===================================================================== */}
      <section className="relative overflow-hidden border-b border-white/10">
        <div className="absolute inset-0">
          <img
            src="/images/who-we-serve-sme.jpg"
            alt="Smiling Kenyan business owner reviewing insights on a tablet in her store"
            className="w-full h-full object-cover object-right opacity-80"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#041527] via-[#041527]/94 to-[#041527]/25" />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-24">
          <div className="max-w-xl">
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight uppercase">
              WHO <span className="text-[#2ED3C2]">WE SERVE</span>
            </h2>
            <div className="teal-bar mt-4" />

            <div className="mt-8 space-y-6">
              {[
                {
                  title: 'Micro and growing businesses',
                  desc: 'Using paper books, M-Pesa records, WhatsApp and spreadsheets.',
                },
                {
                  title: 'Digitising SMEs',
                  desc: 'Using POS systems, Google Sheets and accounting tools.',
                },
                {
                  title: 'Many business types',
                  desc: 'Retail shops, restaurants, salons, wholesalers, distributors and service businesses.',
                },
                {
                  title: 'Every role in the business',
                  desc: 'Owners, branch managers and frontline teams who need clear, practical insights.',
                },
              ].map((item) => (
                <div key={item.title}>
                  <h3 className="text-lg font-bold text-[#2ED3C2]">{item.title}</h3>
                  <p className="mt-1 text-sm sm:text-base text-slate-300">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* =====================================================================
          SLIDE 5 — HOW IT WORKS (01 -> 05)
         ===================================================================== */}
      <section className="relative overflow-hidden border-b border-white/10">
        <div className="absolute inset-0">
          <img
            src="/images/how-it-works-analytics.jpg"
            alt="Business owner reviewing analytics dashboards on laptop"
            className="w-full h-full object-cover object-center opacity-30"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#041527]/95 via-[#041527]/88 to-[#041527]/75" />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-24">
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight uppercase">
            HOW <span className="text-[#2ED3C2]">IT WORKS</span>
          </h2>
          <div className="teal-bar mt-4" />
          <p className="mt-5 text-xl text-slate-200 max-w-lg">
            From scattered records to <span className="text-[#2ED3C2] font-semibold">confident business decisions.</span>
          </p>

          <div className="mt-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
            {[
              {
                num: '01',
                title: 'Connect your data',
                desc: 'Upload or record spreadsheets, POS exports, M-Pesa records, inventory, expenses and communications.',
              },
              {
                num: '02',
                title: 'Prepare and organise',
                desc: 'Clean, validate and standardise business records and store them securely per tenant.',
              },
              {
                num: '03',
                title: 'Measure and report',
                desc: 'Calculate consistent KPIs and generate executive dashboards and management reports.',
              },
              {
                num: '04',
                title: 'Predict and detect',
                desc: 'Forecast sales, demand and cash flow while spotting anomalies and churn risks early.',
              },
              {
                num: '05',
                title: 'Explain and act',
                desc: 'Ask BizWave AI in English or Kiswahili and execute practical recommendations you can track.',
              },
            ].map((s) => (
              <div key={s.num} className="slide-card rounded-xl p-5 flex flex-col">
                <div className="flex items-center gap-3">
                  <span className="text-3xl font-extrabold text-[#2ED3C2]">{s.num}</span>
                  <div className="flex-1 h-px bg-[#2ED3C2]/30" />
                </div>
                <h3 className="mt-4 text-base font-bold text-white">{s.title}</h3>
                <p className="mt-2 text-xs sm:text-sm text-slate-300 leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* =====================================================================
          SLIDE 7 — BUSINESS MODEL & PRICING
         ===================================================================== */}
      <section id="pricing" className="border-b border-white/10 py-20 sm:py-24 bg-[#031121]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div>
              <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight uppercase">
                BUSINESS <span className="text-[#2ED3C2]">MODEL</span>
              </h2>
              <div className="teal-bar mt-4" />
              <p className="mt-4 text-sm sm:text-base text-slate-300 max-w-2xl">
                Modular, affordable KES subscriptions built to grow with Kenyan SMEs.
              </p>
            </div>
            <div className="inline-flex items-start gap-2.5 px-4 py-3 rounded-xl bg-[#09223B] border border-[#2ED3C2]/30 max-w-md text-xs text-slate-200">
              <ShieldCheck className="w-4 h-4 text-[#2ED3C2] shrink-0 mt-0.5" />
              <span>
                <strong className="text-white">Record &amp; Analyse Only:</strong> No customer payments pass through BizWave. Only BizWave subscription fees and platform add-on services are billed in-platform.
              </span>
            </div>
          </div>

          {/* 4 Tier Cards matching Slide 7 */}
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
                className="slide-card rounded-xl overflow-hidden flex flex-col justify-between"
              >
                <div>
                  <div className={`h-1.5 bg-gradient-to-r ${PLAN_TOP_BAR[plan.code] || 'from-[#2ED3C2] to-cyan-400'}`} />
                  <div className="p-6">
                    <h3 className="text-lg font-extrabold uppercase tracking-wide text-[#2ED3C2]">{plan.name}</h3>
                    <div className="mt-3 text-xl font-extrabold text-white">
                      {plan.price_range_label || `KES ${Number(plan.monthly_price_kes).toLocaleString()} / month`}
                    </div>
                    <div className="mt-1 text-xs font-semibold text-emerald-400">
                      {PLAN_AUDIENCE[plan.code] || 'Kenyan SMEs'}
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
                    className="block w-full text-center py-2.5 rounded-lg bg-white/10 hover:bg-[#2ED3C2] hover:text-[#041527] text-white text-xs font-bold transition-colors"
                  >
                    Start with {plan.name}
                  </Link>
                </div>
              </div>
            ))}
          </div>

          {/* 3 Service & Add-On Tracks matching Slide 7 bottom strip */}
          <div className="mt-6 slide-card rounded-xl p-6 grid grid-cols-1 md:grid-cols-3 gap-6 divide-y md:divide-y-0 md:divide-x divide-white/10">
            <div className="flex items-start gap-4 pt-2 md:pt-0">
              <Cog className="w-8 h-8 text-sky-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-sky-400">One-Time Setup &amp; Services</h4>
                <p className="mt-2 text-xs text-slate-300 leading-relaxed">
                  Onboarding · Data cleaning &amp; migration · System integrations · Staff training · Custom dashboards
                </p>
              </div>
            </div>
            <div className="flex items-start gap-4 pt-5 md:pt-0 md:pl-6">
              <MessageCircle className="w-8 h-8 text-[#2ED3C2] shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-[#2ED3C2]">Usage-Based Add-Ons</h4>
                <p className="mt-2 text-xs text-slate-300 leading-relaxed">
                  Voice-agent minutes · SMS &amp; WhatsApp conversations · USSD transactions · Extra branches, data &amp; users
                </p>
              </div>
            </div>
            <div className="flex items-start gap-4 pt-5 md:pt-0 md:pl-6">
              <Puzzle className="w-8 h-8 text-lime-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-lime-400">Custom Projects &amp; Partnerships</h4>
                <p className="mt-2 text-xs text-slate-300 leading-relaxed">
                  Bespoke ML &amp; forecasting · BI consulting · API integrations · Channel &amp; implementation partnerships
                </p>
              </div>
            </div>
          </div>

          <p className="mt-5 text-center text-xs text-slate-400">
            Indicative pricing for SME onboarding; final plans depend on <span className="text-sky-400 font-medium">usage, data volume, integrations</span> and <span className="text-sky-400 font-medium">support</span>.
          </p>
        </div>
      </section>

      {/* =====================================================================
          SLIDE 10 — SUSTAINABLE GROWTH & CTA
         ===================================================================== */}
      <section className="relative overflow-hidden py-20 sm:py-24">
        <div className="absolute inset-0">
          <img
            src="/images/growth-sustainable.jpg"
            alt="Sustainable SME growth"
            className="w-full h-full object-cover object-right opacity-55"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#041527] via-[#041527]/92 to-[#041527]/45" />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-xl">
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight uppercase">
              BUILT FOR <span className="text-[#2ED3C2]">KENYAN SMEs</span>
            </h2>
            <div className="teal-bar mt-4" />

            <ul className="mt-7 space-y-3.5 text-sm sm:text-base text-slate-200">
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="w-5 h-5 text-[#2ED3C2] shrink-0 mt-0.5" />
                <span>Start directly from your existing spreadsheets — no data team needed.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="w-5 h-5 text-[#2ED3C2] shrink-0 mt-0.5" />
                <span>Understands local context with simple English and Kiswahili AI interactions.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="w-5 h-5 text-[#2ED3C2] shrink-0 mt-0.5" />
                <span>Brings operations, forecasting, voice and customer communications together in one secure portal.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="w-5 h-5 text-[#2ED3C2] shrink-0 mt-0.5" />
                <span>Strict tenant isolation with PostgreSQL Row-Level Security and Kenya DPA 2019 readiness.</span>
              </li>
            </ul>

            <div className="mt-9 flex flex-wrap gap-4">
              <Link
                to="/register"
                className="inline-flex items-center gap-2 px-6 py-3.5 rounded-lg bg-[#2ED3C2] text-[#041527] text-sm font-bold hover:bg-[#5ce2d4] transition-colors"
              >
                Create Your Workspace <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                to="/contact"
                className="inline-flex items-center gap-2 px-6 py-3.5 rounded-lg border border-white/25 text-white text-sm font-semibold hover:bg-white/10 transition-colors"
              >
                Partner With BizWave
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
