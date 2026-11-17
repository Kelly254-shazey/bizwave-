import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, ShieldCheck } from 'lucide-react';

export const BenefitsPage: React.FC = () => (
  <div className="bg-[#041527] text-white">
    {/* Why BizWave Is Different — matching Slide 8 */}
    <section className="relative overflow-hidden border-b border-white/10 py-20 sm:py-24">
      <div className="absolute inset-0">
        <img
          src="/images/who-we-serve-sme.jpg"
          alt="Kenyan SME owner using BizWave"
          className="w-full h-full object-cover object-right opacity-65"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#041527] via-[#041527]/94 to-[#041527]/35" />
      </div>
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-xl">
          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight uppercase">
            WHY <span className="text-[#2ED3C2]">BIZWAVE</span> IS DIFFERENT
          </h1>
          <div className="teal-bar mt-4" />

          <ul className="mt-8 space-y-4 text-base text-slate-200">
            {[
              ['Built for Kenyan SMEs', ', not bloated enterprise models'],
              ['Start from your spreadsheets', '; no data team needed'],
              ['Understands local context', ' with English and Kiswahili interactions'],
              ['Operations, voice & customer communications', ' connected in one place'],
              ['Actionable insights', ', clear forecasts and visible data quality'],
              ['Modular and affordable', ', scales cleanly as your business grows'],
            ].map(([highlight, rest]) => (
              <li key={highlight} className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-[#2ED3C2] shrink-0 mt-0.5" />
                <span>
                  <strong className="text-[#2ED3C2]">{highlight}</strong>
                  {rest}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>

    {/* The Impact — matching Slide 9 */}
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 space-y-12">
      <div>
        <h2 className="text-3xl font-extrabold uppercase">
          THE <span className="text-[#2ED3C2]">IMPACT</span>
        </h2>
        <div className="teal-bar mt-4" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {[
          {
            title: 'Less time on manual spreadsheets',
            desc: 'Stop spending evenings reconciling separate M-Pesa texts, paper ledgers, and stock sheets.',
          },
          {
            title: 'Full visibility into margins & cash',
            desc: 'See exact sales, costs, gross profit, stockout risks, and customer buying behaviour in seconds.',
          },
          {
            title: 'Proactive purchasing & staffing',
            desc: 'Use sales, demand, and cash-flow forecasts to restock ahead of peaks and avoid cash crunches.',
          },
          {
            title: 'Measurable customer communication',
            desc: 'Reach customers on WhatsApp, SMS, Voice, and USSD with consent controls and interaction analytics.',
          },
        ].map((card) => (
          <div key={card.title} className="slide-card rounded-xl p-6">
            <h3 className="text-lg font-bold text-[#2ED3C2]">{card.title}</h3>
            <p className="mt-2 text-sm text-slate-300 leading-relaxed">{card.desc}</p>
          </div>
        ))}
      </div>

      <div className="slide-card rounded-xl p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-[#2ED3C2]/30">
        <div className="flex items-start gap-3">
          <ShieldCheck className="w-6 h-6 text-[#2ED3C2] shrink-0 mt-0.5" />
          <div>
            <h3 className="font-bold text-white">Non-Custodial Decision Intelligence</h3>
            <p className="text-sm text-slate-300 mt-1">
              BizWave does not hold or process your customer payments. Your M-Pesa, cash, and bank records are stored strictly for analytics, forecasting, and AI guidance — only BizWave subscriptions and platform services are billed.
            </p>
          </div>
        </div>
        <Link
          to="/register"
          className="inline-flex items-center gap-2 px-5 py-3 rounded-lg bg-[#2ED3C2] text-[#041527] text-sm font-bold shrink-0 hover:bg-[#5ce2d4]"
        >
          Get Started <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </section>
  </div>
);
