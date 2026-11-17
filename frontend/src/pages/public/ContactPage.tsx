import React, { useState } from 'react';
import { CheckCircle2, Mail, MapPin, Phone } from 'lucide-react';
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
    <div className="py-16 sm:py-24 bg-[#041527] text-white">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 grid grid-cols-1 lg:grid-cols-12 gap-12">
        <div className="lg:col-span-5 space-y-6">
          <div>
            <div className="text-xs font-bold uppercase tracking-widest text-[#2ED3C2]">Contact BizWave</div>
            <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-white">
              Speak with our Nairobi team.
            </h1>
            <div className="teal-bar mt-4" />
            <p className="mt-4 text-sm text-slate-300 leading-relaxed">
              Whether you are onboarding a growing retail shop, restaurant, distributor, or multi-branch SME across Kenya, our team will get back to you within one business day.
            </p>
          </div>

          <div className="space-y-4 pt-2 text-sm text-slate-300">
            <div className="flex items-start gap-3">
              <MapPin className="w-4 h-4 text-[#2ED3C2] mt-1 shrink-0" />
              <div>
                <div className="font-semibold text-white">Nairobi Headquarters</div>
                <div className="text-slate-400">Westlands Commercial Centre, Nairobi, Kenya</div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Mail className="w-4 h-4 text-[#2ED3C2] mt-1 shrink-0" />
              <div>
                <div className="font-semibold text-white">Email</div>
                <div className="text-slate-400">hello@bizwave.co.ke · support@bizwave.co.ke</div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Phone className="w-4 h-4 text-[#2ED3C2] mt-1 shrink-0" />
              <div>
                <div className="font-semibold text-white">Business Hours (EAT)</div>
                <div className="text-slate-400">Mon – Fri, 8:00 AM – 6:00 PM Africa/Nairobi</div>
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-7">
          <div className="slide-card p-6 sm:p-8 rounded-2xl">
            {confirmation ? (
              <div className="py-10 text-center space-y-3">
                <CheckCircle2 className="w-12 h-12 text-[#2ED3C2] mx-auto" />
                <h2 className="text-xl font-bold text-white">Enquiry Received</h2>
                <p className="text-sm text-slate-300 max-w-md mx-auto">
                  Thank you for contacting BizWave. Your enquiry has been recorded under reference{' '}
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
                    <label className="block text-xs font-semibold text-slate-200 mb-1.5">Business Name</label>
                    <input
                      value={form.companyName}
                      onChange={(e) => setForm({ ...form, companyName: e.target.value })}
                      className={inputCls}
                      placeholder="e.g. Acme Trading Ltd"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-200 mb-1.5">Enquiry Category *</label>
                  <select
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    className={inputCls}
                  >
                    <option value="business">SME Onboarding &amp; Subscriptions</option>
                    <option value="partnership">Technology / Channel Partnership</option>
                    <option value="enterprise">Multi-Branch / Custom BI Integration</option>
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
                    placeholder="Tell us about your business, branches, and what data you want to analyse..."
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
      </div>
    </div>
  );
};
