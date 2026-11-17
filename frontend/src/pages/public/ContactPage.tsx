import React, { useState } from 'react';
import { Briefcase, CheckCircle2, Handshake, Layers, Mail, MapPin, Phone, Rocket } from 'lucide-react';
import { apiRequest } from '../../services/api';

export const ContactPage: React.FC = () => {
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    phoneNumber: '',
    companyName: '',
    category: 'business',
    message: '',
    websiteHoneypot: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [confirmation, setConfirmation] = useState<{ reference: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const res = await apiRequest('/public/contact', {
        method: 'POST',
        body: form,
        skipAuth: true,
      });
      setConfirmation({ reference: res.reference });
    } catch (err: any) {
      setError(err.message || 'Unable to submit enquiry right now.');
    } finally {
      setSubmitting(false);
    }
  };

  const inputCls =
    'w-full px-3.5 py-2.5 text-sm bg-[#041527] border border-white/15 text-white placeholder-slate-500 rounded-lg focus:outline-none focus:border-[#2ED3C2]';

  return (
    <div className="bg-[#041527] text-white">
      {/* Dedicated Partnership & Onboarding Banner — Unique Image (contact-partnership.jpg) */}
      <section className="relative overflow-hidden border-b border-white/10 py-16 sm:py-20">
        <div className="absolute inset-0">
          <img
            src="/images/contact-partnership.jpg"
            alt="Nairobi business partnership handshake overlooking city skyline"
            className="w-full h-full object-cover object-right opacity-70"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#041527] via-[#041527]/94 to-[#041527]/35" />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <div className="text-xs font-bold uppercase tracking-widest text-[#2ED3C2]">Onboarding, Pilots &amp; Ecosystem Partnerships</div>
            <h1 className="mt-3 text-3xl sm:text-5xl font-extrabold tracking-tight leading-tight">
              Let&apos;s Tailor BizWave to Your{' '}
              <span className="text-[#2ED3C2]">Business or Partnership.</span>
            </h1>
            <div className="teal-bar mt-5" />
            <p className="mt-5 text-base text-slate-200 leading-relaxed max-w-xl">
              From guided SME onboarding and historical spreadsheet cleanup to POS/accounting technology integrations and investor/distribution partnerships in Nairobi and across Kenya.
            </p>
          </div>
        </div>
      </section>

      {/* Ways We Collaborate + Direct Enquiry Form */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 grid grid-cols-1 lg:grid-cols-12 gap-10">
        <div className="lg:col-span-5 space-y-6">
          <h2 className="text-lg font-extrabold text-white uppercase tracking-wide">How We Can Work Together</h2>
          <div className="space-y-3">
            {[
              {
                icon: Rocket,
                title: 'Guided SME Onboarding',
                desc: 'We help clean your existing Excel/M-Pesa records, set up branches, and train your team.',
              },
              {
                icon: Layers,
                title: 'POS & Accounting Tech Partners',
                desc: 'Integrate retail POS, ERP, and accounting tools cleanly via our multi-tenant ingestion API.',
              },
              {
                icon: Handshake,
                title: 'Distribution & Ecosystem Partners',
                desc: 'Collaborate on SME networks, business hubs, SACCOs, and regional rollout across East Africa.',
              },
              {
                icon: Briefcase,
                title: 'Custom BI & Forecasting Projects',
                desc: 'Tailored KPI frameworks, multi-branch reporting, and dedicated SLA support.',
              },
            ].map((item) => (
              <div key={item.title} className="slide-card rounded-xl p-4 flex items-start gap-3.5">
                <item.icon className="w-5 h-5 text-[#2ED3C2] shrink-0 mt-0.5" />
                <div>
                  <div className="text-sm font-bold text-white">{item.title}</div>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="pt-3 border-t border-white/10 space-y-3 text-sm text-slate-300">
            <div className="flex items-start gap-3">
              <MapPin className="w-4 h-4 text-[#2ED3C2] mt-1 shrink-0" />
              <div>
                <div className="font-semibold text-white">Nairobi Office</div>
                <div className="text-xs text-slate-400">Westlands Commercial Centre, Nairobi, Kenya</div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Mail className="w-4 h-4 text-[#2ED3C2] mt-1 shrink-0" />
              <div>
                <div className="font-semibold text-white">Direct Email</div>
                <div className="text-xs text-slate-400">hello@bizwave.co.ke · partnerships@bizwave.co.ke</div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Phone className="w-4 h-4 text-[#2ED3C2] mt-1 shrink-0" />
              <div>
                <div className="font-semibold text-white">Support Hours (EAT)</div>
                <div className="text-xs text-slate-400">Monday – Friday, 8:00 AM – 6:00 PM Africa/Nairobi</div>
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-7">
          <div className="slide-card p-6 sm:p-8 rounded-2xl">
            <h2 className="text-lg font-bold text-white mb-1">Send Us a Direct Message</h2>
            <p className="text-xs text-slate-400 mb-6">Our Nairobi team responds within one business day.</p>

            {confirmation ? (
              <div className="py-10 text-center space-y-3">
                <CheckCircle2 className="w-12 h-12 text-[#2ED3C2] mx-auto" />
                <h3 className="text-xl font-bold text-white">Enquiry Received</h3>
                <p className="text-sm text-slate-300 max-w-md mx-auto">
                  Thank you for reaching out to BizWave. Your enquiry is logged under reference{' '}
                  <code className="px-2 py-0.5 rounded bg-white/10 font-semibold text-[#2ED3C2]">
                    {confirmation.reference}
                  </code>
                  .
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setConfirmation(null);
                    setForm({ fullName: '', email: '', phoneNumber: '', companyName: '', category: 'business', message: '', websiteHoneypot: '' });
                  }}
                  className="mt-4 px-4 py-2 text-xs font-semibold rounded-lg border border-white/20 hover:bg-white/10"
                >
                  Send Another Enquiry
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-200 mb-1.5">Full Name *</label>
                    <input
                      required
                      value={form.fullName}
                      onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                      className={inputCls}
                      placeholder="Your full name"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-200 mb-1.5">Work Email *</label>
                    <input
                      type="email"
                      required
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      className={inputCls}
                      placeholder="you@company.co.ke"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-200 mb-1.5">Phone Number</label>
                    <input
                      value={form.phoneNumber}
                      onChange={(e) => setForm({ ...form, phoneNumber: e.target.value })}
                      className={inputCls}
                      placeholder="+254 7XX XXX XXX"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-200 mb-1.5">Business / Organization</label>
                    <input
                      value={form.companyName}
                      onChange={(e) => setForm({ ...form, companyName: e.target.value })}
                      className={inputCls}
                      placeholder="e.g. Acme Trading Ltd"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-200 mb-1.5">How Can We Help? *</label>
                  <select
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    className={inputCls}
                  >
                    <option value="business">SME Onboarding &amp; Subscription Plan</option>
                    <option value="partnership">Technology / Channel Partnership</option>
                    <option value="enterprise">Multi-Branch / Custom BI Consulting</option>
                    <option value="support">Technical Support</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-200 mb-1.5">Message *</label>
                  <textarea
                    required
                    rows={4}
                    value={form.message}
                    onChange={(e) => setForm({ ...form, message: e.target.value })}
                    className={inputCls}
                    placeholder="Share your business type, number of branches, or partnership goal..."
                  />
                </div>

                <input
                  type="text"
                  tabIndex={-1}
                  autoComplete="off"
                  value={form.websiteHoneypot}
                  onChange={(e) => setForm({ ...form, websiteHoneypot: e.target.value })}
                  className="hidden"
                />

                {error && <div className="p-3 rounded-lg bg-rose-500/15 border border-rose-400/30 text-rose-200 text-xs">{error}</div>}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-3 rounded-xl bg-[#2ED3C2] text-[#041527] text-sm font-bold hover:bg-[#5ce2d4] disabled:opacity-50 transition-colors"
                >
                  {submitting ? 'Sending...' : 'Send Enquiry'}
                </button>
              </form>
            )}
          </div>
        </div>
      </section>
    </div>
  );
};
