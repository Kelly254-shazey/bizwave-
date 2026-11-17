import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BarChart3, MessageSquare, Sparkles, TrendingUp } from 'lucide-react';

export const HowItWorksPage: React.FC = () => (
  <div className="bg-[#041527] text-white">
    <section className="relative overflow-hidden border-b border-white/10 py-20 sm:py-24">
      <div className="absolute inset-0">
        <img
          src="/images/how-it-works-analytics.jpg"
          alt="Business analytics workflow"
          className="w-full h-full object-cover opacity-30"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#041527]/95 via-[#041527]/85 to-[#041527]" />
      </div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <h1 className="text-3xl sm:text-5xl font-extrabold uppercase">
          HOW <span className="text-[#2ED3C2]">IT WORKS</span>
        </h1>
        <div className="teal-bar mt-4" />
        <p className="mt-5 text-xl text-slate-200 max-w-2xl">
          From scattered records to <span className="text-[#2ED3C2] font-semibold">confident business decisions</span> in five practical steps.
        </p>

        <div className="mt-12 grid grid-cols-1 md:grid-cols-5 gap-5">
          {[
            { num: '01', title: 'Connect your data', desc: 'Upload CSV/Excel spreadsheets or record daily sales, M-Pesa entries, stock, expenses, and customers.' },
            { num: '02', title: 'Prepare & organise', desc: 'BizWave validates every row, flags errors or duplicates, and secures records in your isolated tenant.' },
            { num: '03', title: 'Measure & report', desc: 'Instant KPIs for revenue, gross margin, expenses, net profit, branch performance, and stock health.' },
            { num: '04', title: 'Predict & detect', desc: 'Forecast sales, demand, and cash flow while spotting anomalies, low stock, and churn risk early.' },
            { num: '05', title: 'Explain & act', desc: 'Ask BizWave AI in English or Kiswahili, simulate What-If moves, and reach customers via Connect.' },
          ].map((step) => (
            <div key={step.num} className="slide-card rounded-xl p-5">
              <div className="text-3xl font-extrabold text-[#2ED3C2]">{step.num}</div>
              <h2 className="mt-3 text-base font-bold text-white">{step.title}</h2>
              <p className="mt-2 text-xs sm:text-sm text-slate-300 leading-relaxed">{step.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>

    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 space-y-10">
      <div className="text-center max-w-2xl mx-auto">
        <h2 className="text-2xl sm:text-3xl font-extrabold">
          Everything Connected Across <span className="text-[#2ED3C2]">4 Pillars</span>
        </h2>
        <p className="mt-3 text-sm text-slate-300">
          Your team only sees what they need — clear recording, real-time analytics, accurate forecasting, and actionable AI guidance.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {[
          {
            icon: BarChart3,
            title: '1. BizWave Analytics',
            desc: 'Unifies sales records, M-Pesa/cash breakdowns, inventory levels, expenses, and customer history into real-time KPIs and exportable reports.',
          },
          {
            icon: TrendingUp,
            title: '2. BizWave Predict',
            desc: 'Runs time-series sales & demand forecasts, 30-day cash-flow projections, RFM customer segmentation, and automated anomaly detection.',
          },
          {
            icon: Sparkles,
            title: '3. BizWave AI (English & Kiswahili)',
            desc: 'Answers operational questions directly from your database, scores your business health (0–100), and simulates What-If pricing and cost scenarios.',
          },
          {
            icon: MessageSquare,
            title: '4. BizWave Connect',
            desc: 'Integrates Voice, SMS, WhatsApp, and USSD campaigns with Kenya DPA consent controls and customer interaction analytics.',
          },
        ].map((p) => (
          <div key={p.title} className="slide-card rounded-xl p-6 flex items-start gap-4">
            <div className="w-11 h-11 rounded-lg bg-[#2ED3C2]/15 border border-[#2ED3C2]/30 flex items-center justify-center text-[#2ED3C2] shrink-0">
              <p.icon className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">{p.title}</h3>
              <p className="mt-2 text-sm text-slate-300 leading-relaxed">{p.desc}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="text-center pt-4">
        <Link
          to="/register"
          className="inline-flex items-center gap-2 px-7 py-3.5 rounded-lg bg-[#2ED3C2] text-[#041527] text-sm font-bold hover:bg-[#5ce2d4]"
        >
          Register Your Business Workspace <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </section>
  </div>
);
