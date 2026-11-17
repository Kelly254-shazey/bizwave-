import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  Clock,
  Scissors,
  ShieldCheck,
  ShoppingBag,
  Store,
  Utensils,
  XCircle,
} from 'lucide-react';

const BEFORE_AFTER = [
  {
    area: 'Daily Sales & M-Pesa Tracking',
    before: 'Manually copying M-Pesa messages, cash tally books, and POS receipts into separate Excel tabs every evening.',
    after: 'One unified ledger combining recorded M-Pesa, cash, card, and bank entries with automatic daily revenue & AOV KPIs.',
  },
  {
    area: 'Inventory & Reordering',
    before: 'Discovering fast-moving items are finished only when a customer asks — losing sales and emergency-ordering at higher cost.',
    after: 'Real-time low-stock & stockout alerts paired with demand forecasts so you restock top sellers before weekend peaks.',
  },
  {
    area: 'Profit & Expense Control',
    before: 'Seeing high daily sales but wondering at month-end where the cash went because rent, utilities, and supplier bills live elsewhere.',
    after: 'Instant gross profit, expense-to-revenue ratio, net margin, and category leak audits — plus 30-day cash-flow visibility.',
  },
  {
    area: 'Customer Retention',
    before: 'No way to spot regular customers who silently stopped buying 30–60 days ago.',
    after: 'Automated RFM segmentation highlights dormant VIPs so you re-engage opted-in buyers via WhatsApp or SMS in one click.',
  },
];

const SECTORS = [
  {
    id: 'retail',
    label: 'Retail & Mini-Marts',
    icon: Store,
    headline: 'Eliminate shelf stockouts and track true SKU margins.',
    points: [
      'Spot which fast-moving products drive profit vs which tie up cash on shelves.',
      'Compare recorded M-Pesa vs cash sales per cashier shift and per branch.',
      'Get early reorder alerts before high-demand items run dry.',
    ],
  },
  {
    id: 'restaurant',
    label: 'Restaurants & Cafes',
    icon: Utensils,
    headline: 'Match ingredient stock and staffing to real meal-time peaks.',
    points: [
      'See weekday lunch vs weekend dinner volume shifts immediately.',
      'Prevent kitchen stockouts on core ingredients ahead of Friday–Sunday peaks.',
      'Ask BizWave AI why weekly revenue moved in plain English or Kiswahili.',
    ],
  },
  {
    id: 'wholesale',
    label: 'Wholesale & Distributors',
    icon: ShoppingBag,
    headline: 'Protect working capital across credit accounts and multi-branch depots.',
    points: [
      'Track receivables vs confirmed supplier payables to avoid cash crunches.',
      'Compare branch net contributions side by side under strict branch permissions.',
      'Simulate bulk pricing changes with the What-If Financial Simulator before quoting.',
    ],
  },
  {
    id: 'salon',
    label: 'Salons & Services',
    icon: Scissors,
    headline: 'Turn one-time walk-ins into loyal repeat bookings.',
    points: [
      'Identify highest-margin services vs consumable product costs.',
      'Spot regular clients overdue for a visit and send consent-safe WhatsApp reminders.',
      'Forecast quiet mid-week slots to run targeted retention offers.',
    ],
  },
  {
    id: 'services',
    label: 'Multi-Branch SMEs',
    icon: Building2,
    headline: 'Give owners group-wide visibility while scoping branch managers cleanly.',
    points: [
      'Consolidate every location into one executive dashboard automatically.',
      'Restrict each branch manager strictly to their assigned branch data.',
      'Export board-ready management summaries in one click.',
    ],
  },
];

export const BenefitsPage: React.FC = () => {
  const [activeSector, setActiveSector] = useState('retail');
  const current = SECTORS.find((s) => s.id === activeSector) || SECTORS[0];
  const SectorIcon = current.icon;

  return (
    <div className="bg-[#041527] text-white">
      {/* Dedicated Hero — Unique Visual (benefits-clarity.jpg) & Message */}
      <section className="relative overflow-hidden border-b border-white/10 py-20 sm:py-24">
        <div className="absolute inset-0">
          <img
            src="/images/benefits-clarity.jpg"
            alt="Smiling Kenyan retail owner reviewing calm business metrics on phone and laptop"
            className="w-full h-full object-cover object-right opacity-80"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#041527] via-[#041527]/94 to-[#041527]/25" />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <div className="text-xs font-bold uppercase tracking-widest text-[#2ED3C2]">Why SMEs Switch to BizWave</div>
            <h1 className="mt-3 text-3xl sm:text-5xl font-extrabold tracking-tight leading-tight">
              Stop Guessing. See What Changes When Your{' '}
              <span className="text-[#2ED3C2]">Data Works Together.</span>
            </h1>
            <div className="teal-bar mt-5" />
            <p className="mt-6 text-base sm:text-lg text-slate-200 leading-relaxed max-w-xl">
              Most business tools only store receipts or complicate accounting. BizWave is built specifically to answer the daily questions that protect cash flow, prevent stockouts, and grow profit for Kenyan SMEs.
            </p>
            <div className="mt-8 flex flex-wrap gap-3 text-xs font-semibold">
              <span className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#09223B] border border-[#2ED3C2]/30 text-[#2ED3C2]">
                <Clock className="w-4 h-4" /> Hours saved on weekly reporting
              </span>
              <span className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#09223B] border border-white/15 text-slate-200">
                <ShieldCheck className="w-4 h-4 text-[#2ED3C2]" /> Zero data analysts required
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Before vs After BizWave Comparison */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 border-b border-white/10">
        <div className="max-w-2xl">
          <h2 className="text-2xl sm:text-3xl font-extrabold uppercase">
            BEFORE VS. <span className="text-[#2ED3C2]">WITH BIZWAVE</span>
          </h2>
          <div className="teal-bar mt-4" />
          <p className="mt-4 text-sm sm:text-base text-slate-300">
            How day-to-day SME decision making shifts from reactive firefighting to calm, verified clarity.
          </p>
        </div>

        <div className="mt-10 space-y-4">
          {BEFORE_AFTER.map((row) => (
            <div key={row.area} className="slide-card rounded-2xl p-6 grid grid-cols-1 lg:grid-cols-12 gap-5 items-center">
              <div className="lg:col-span-3">
                <div className="text-xs font-bold uppercase tracking-wider text-[#2ED3C2]">Operational Shift</div>
                <h3 className="mt-1 text-base font-bold text-white">{row.area}</h3>
              </div>
              <div className="lg:col-span-4 p-4 rounded-xl bg-rose-500/10 border border-rose-400/20">
                <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase text-rose-300 mb-1.5">
                  <XCircle className="w-3.5 h-3.5" /> Without BizWave
                </div>
                <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">{row.before}</p>
              </div>
              <div className="lg:col-span-5 p-4 rounded-xl bg-[#2ED3C2]/10 border border-[#2ED3C2]/30">
                <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase text-[#2ED3C2] mb-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" /> With BizWave
                </div>
                <p className="text-xs sm:text-sm text-white leading-relaxed">{row.after}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Interactive Sector Playbook — What Each Kenyan Business Type Gains */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center max-w-2xl mx-auto">
          <div className="text-xs font-bold uppercase tracking-widest text-[#2ED3C2]">Tailored Industry Workspaces</div>
          <h2 className="mt-2 text-2xl sm:text-3xl font-extrabold">What Your Business Gains on Day One</h2>
          <p className="mt-3 text-sm text-slate-300">
            Select your business type to see how BizWave adapts KPIs, stock alerts, and AI prompts to your operations.
          </p>
        </div>

        <div className="mt-8 flex flex-wrap justify-center gap-2">
          {SECTORS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setActiveSector(s.id)}
              className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-colors ${
                activeSector === s.id
                  ? 'bg-[#2ED3C2] text-[#041527]'
                  : 'bg-[#081F37] border border-white/10 text-slate-300 hover:border-[#2ED3C2]/40'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div className="mt-8 slide-card rounded-2xl p-8 max-w-4xl mx-auto border-[#2ED3C2]/30">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 pb-6 border-b border-white/10">
            <div className="w-12 h-12 rounded-xl bg-[#2ED3C2]/15 border border-[#2ED3C2]/30 flex items-center justify-center text-[#2ED3C2] shrink-0">
              <SectorIcon className="w-6 h-6" />
            </div>
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-[#2ED3C2]">{current.label}</div>
              <h3 className="text-xl font-extrabold text-white mt-0.5">{current.headline}</h3>
            </div>
          </div>

          <ul className="mt-6 space-y-3.5 text-sm sm:text-base text-slate-200">
            {current.points.map((pt) => (
              <li key={pt} className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-[#2ED3C2] shrink-0 mt-0.5" />
                <span>{pt}</span>
              </li>
            ))}
          </ul>

          <div className="mt-8 pt-6 border-t border-white/10 flex flex-wrap items-center justify-between gap-4">
            <span className="text-xs text-slate-400">
              Record &amp; Analyse only — BizWave never holds or processes your customer payments.
            </span>
            <Link
              to="/register"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#2ED3C2] text-[#041527] text-xs font-bold hover:bg-[#5ce2d4]"
            >
              Launch {current.label} Workspace <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
};
