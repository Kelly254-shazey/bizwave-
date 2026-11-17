import React from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  CheckCircle2,
  Database,
  FileSpreadsheet,
  Lock,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users,
} from 'lucide-react';

export const HowItWorksPage: React.FC = () => (
  <div className="bg-[#041527] text-white">
    {/* Dedicated Hero — Unique Image (workflow-restaurant-tablet.jpg) & Walkthrough Focus */}
    <section className="relative overflow-hidden border-b border-white/10 py-20 sm:py-24">
      <div className="absolute inset-0">
        <img
          src="/images/workflow-restaurant-tablet.jpg"
          alt="Kenyan restaurant manager checking demand forecast and stock alerts on tablet"
          fetchPriority="high"
          decoding="async"
          className="w-full h-full object-cover object-right opacity-75"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#041527] via-[#041527]/94 to-[#041527]/30" />
      </div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl">
          <div className="text-xs font-bold uppercase tracking-widest text-[#2ED3C2]">Step-By-Step Product Walkthrough</div>
          <h1 className="mt-3 text-3xl sm:text-5xl font-extrabold tracking-tight leading-tight">
            From Your Existing Spreadsheet to Your First{' '}
            <span className="text-[#2ED3C2]">AI Decision in 10 Minutes.</span>
          </h1>
          <div className="teal-bar mt-5" />
          <p className="mt-6 text-base sm:text-lg text-slate-200 leading-relaxed max-w-xl">
            No complex software migration and no payment gateway integration needed. Bring the CSV/Excel files or daily records you already keep — BizWave cleans, analyses, forecasts, and turns them into clear daily actions.
          </p>
        </div>
      </div>
    </section>

    {/* Real Visual Flow Example (Inspired by Slide 6 Product Walkthrough — Zero Demo Buttons!) */}
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 border-b border-white/10">
      <div className="max-w-2xl">
        <h2 className="text-2xl sm:text-3xl font-extrabold uppercase">
          INSIDE THE <span className="text-[#2ED3C2]">DECISION PIPELINE</span>
        </h2>
        <div className="teal-bar mt-4" />
        <p className="mt-4 text-sm sm:text-base text-slate-300">
          See exactly what happens to your operational data the moment you upload or record it inside your workspace.
        </p>
      </div>

      <div className="mt-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="slide-card rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <span className="w-8 h-8 rounded-full bg-[#2ED3C2] text-[#041527] font-extrabold text-sm flex items-center justify-center">
              1
            </span>
            <FileSpreadsheet className="w-5 h-5 text-[#2ED3C2]" />
          </div>
          <h3 className="text-base font-bold text-[#2ED3C2]">Upload &amp; Validate</h3>
          <p className="text-xs text-slate-300 leading-relaxed">
            Drop any CSV or Excel export of sales, M-Pesa logs, stock, or expenses — or use our clean header template.
          </p>
          <div className="p-3 rounded-xl bg-[#041527] border border-white/10 text-[11px] font-mono space-y-1.5 text-slate-300">
            <div className="flex justify-between"><span>Date</span><span className="text-[#2ED3C2]">→ Validated</span></div>
            <div className="flex justify-between"><span>Product / Qty</span><span className="text-[#2ED3C2]">→ Mapped</span></div>
            <div className="flex justify-between"><span>Total / M-Pesa</span><span className="text-[#2ED3C2]">→ Recorded</span></div>
            <div className="flex justify-between"><span>Duplicates</span><span className="text-amber-400">→ Flagged</span></div>
          </div>
        </div>

        <div className="slide-card rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <span className="w-8 h-8 rounded-full bg-[#2ED3C2] text-[#041527] font-extrabold text-sm flex items-center justify-center">
              2
            </span>
            <Database className="w-5 h-5 text-[#2ED3C2]" />
          </div>
          <h3 className="text-base font-bold text-[#2ED3C2]">Instant KPIs &amp; Health Score</h3>
          <p className="text-xs text-slate-300 leading-relaxed">
            PostgreSQL calculates consistent revenue, gross margin, expenses, net profit, and your 0–100 BizWave Health Score.
          </p>
          <div className="p-3 rounded-xl bg-[#041527] border border-white/10 text-xs space-y-2">
            <div className="flex justify-between"><span className="text-slate-400">Revenue &amp; AOV</span><span className="text-white font-bold">Auto-updated</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Expense Ratio</span><span className="text-white font-bold">Tracked live</span></div>
            <div className="flex justify-between"><span className="text-slate-400">M-Pesa vs Cash</span><span className="text-[#2ED3C2] font-bold">Analysed</span></div>
          </div>
        </div>

        <div className="slide-card rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <span className="w-8 h-8 rounded-full bg-[#2ED3C2] text-[#041527] font-extrabold text-sm flex items-center justify-center">
              3
            </span>
            <TrendingUp className="w-5 h-5 text-[#2ED3C2]" />
          </div>
          <h3 className="text-base font-bold text-[#2ED3C2]">Forecast &amp; Spot Risks</h3>
          <p className="text-xs text-slate-300 leading-relaxed">
            Our Python intelligence engine projects demand and cash flow ahead while flagging abnormal dips and low-stock SKUs.
          </p>
          <div className="p-3 rounded-xl bg-[#041527] border border-white/10 text-xs space-y-2">
            <div className="flex items-center justify-between"><span className="text-slate-300">Sales &amp; Demand</span><span className="text-[#2ED3C2] font-semibold">14–30d ahead</span></div>
            <div className="flex items-center justify-between"><span className="text-slate-300">Cash Runway</span><span className="text-white font-semibold">Payables-aware</span></div>
            <div className="flex items-center justify-between"><span className="text-slate-300">Low-Stock Alerts</span><span className="text-amber-400 font-semibold">Early warning</span></div>
          </div>
        </div>

        <div className="slide-card rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <span className="w-8 h-8 rounded-full bg-[#2ED3C2] text-[#041527] font-extrabold text-sm flex items-center justify-center">
              4
            </span>
            <Sparkles className="w-5 h-5 text-[#2ED3C2]" />
          </div>
          <h3 className="text-base font-bold text-[#2ED3C2]">Ask AI &amp; Act</h3>
          <p className="text-xs text-slate-300 leading-relaxed">
            Ask BizWave AI in English or Kiswahili, simulate What-If price or cost moves, and trigger opted-in customer outreach.
          </p>
          <div className="p-3 rounded-xl bg-[#041527] border border-[#2ED3C2]/25 text-xs space-y-1.5">
            <div className="text-[#2ED3C2] font-semibold">&ldquo;Why did sales shift this week?&rdquo;</div>
            <div className="text-slate-300">&ldquo;What if I cut expenses 10%?&rdquo;</div>
            <div className="text-slate-400">→ Grounded in your database only.</div>
          </div>
        </div>
      </div>
    </section>

    {/* Built for Teams & Non-Custodial Clarity */}
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="slide-card rounded-2xl p-7 space-y-4">
          <div className="flex items-center gap-3">
            <Users className="w-6 h-6 text-[#2ED3C2]" />
            <h3 className="text-lg font-bold text-white">Role-Based Access Across Your Team</h3>
          </div>
          <p className="text-sm text-slate-300 leading-relaxed">
            Every team member sees strictly what their job requires — keeping financial profit margins private while empowering branch staff.
          </p>
          <ul className="space-y-2.5 text-xs sm:text-sm text-slate-300">
            <li className="flex items-start gap-2"><CheckCircle2 className="w-4 h-4 text-[#2ED3C2] mt-0.5 shrink-0" /> <span><strong className="text-white">Business Owner:</strong> Full group KPIs, finance, AI, team &amp; subscription controls.</span></li>
            <li className="flex items-start gap-2"><CheckCircle2 className="w-4 h-4 text-[#2ED3C2] mt-0.5 shrink-0" /> <span><strong className="text-white">Branch Manager:</strong> Scoped strictly to their assigned branch sales &amp; stock.</span></li>
            <li className="flex items-start gap-2"><CheckCircle2 className="w-4 h-4 text-[#2ED3C2] mt-0.5 shrink-0" /> <span><strong className="text-white">Customer Care:</strong> Accesses Connect &amp; consent records without seeing financial ledgers.</span></li>
          </ul>
        </div>

        <div className="slide-card rounded-2xl p-7 space-y-4 border-[#2ED3C2]/30">
          <div className="flex items-center gap-3">
            <ShieldCheck className="w-6 h-6 text-[#2ED3C2]" />
            <h3 className="text-lg font-bold text-white">What BizWave Does — and Does NOT Do</h3>
          </div>
          <p className="text-sm text-slate-300 leading-relaxed">
            BizWave is an intelligence and decision-support platform, not a bank or payment processor.
          </p>
          <ul className="space-y-2.5 text-xs sm:text-sm text-slate-300">
            <li className="flex items-start gap-2"><Lock className="w-4 h-4 text-[#2ED3C2] mt-0.5 shrink-0" /> <span><strong className="text-white">No customer payments handled:</strong> Your buyers keep paying your existing M-Pesa Till, Paybill, Cash, or Bank directly.</span></li>
            <li className="flex items-start gap-2"><CheckCircle2 className="w-4 h-4 text-[#2ED3C2] mt-0.5 shrink-0" /> <span><strong className="text-white">Only platform fees billed:</strong> The only payments in BizWave are your monthly subscription and optional BizWave add-on services.</span></li>
            <li className="flex items-start gap-2"><CheckCircle2 className="w-4 h-4 text-[#2ED3C2] mt-0.5 shrink-0" /> <span><strong className="text-white">Pure decision power:</strong> Every record you enter or import works exclusively to help you analyse and grow.</span></li>
          </ul>
        </div>
      </div>

      <div className="mt-12 text-center flex flex-wrap justify-center gap-4">
        <Link
          to="/register"
          className="inline-flex items-center gap-2 px-7 py-3.5 rounded-lg bg-[#2ED3C2] text-[#041527] text-sm font-bold hover:bg-[#5ce2d4]"
        >
          Start Your Workspace Now <ArrowRight className="w-4 h-4" />
        </Link>
        <Link
          to="/pricing"
          className="inline-flex items-center gap-2 px-7 py-3.5 rounded-lg border border-white/25 text-white text-sm font-semibold hover:bg-white/10"
        >
          View Plans &amp; Pricing
        </Link>
      </div>
    </section>
  </div>
);
