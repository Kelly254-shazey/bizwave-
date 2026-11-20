import React from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Lock,
  MessageSquare,
  ShieldCheck,
  Sparkles,
  TrendingUp,
} from 'lucide-react';

export const HomePage: React.FC = () => {
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
                    { label: 'Connect', sub: 'Business network', icon: MessageSquare },
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
              Bring business records together, explore forecasts, ask questions in plain language, and discover opted-in businesses.
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
                desc: 'Discover businesses that choose to publish a profile and manage customer consent. Outbound messaging is not connected yet.',
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
          5. FINAL CTA — Sustainable Growth Backdrop
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
              Launch a BizWave workspace with tenant-scoped access and English &amp; Kiswahili AI guidance.
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
