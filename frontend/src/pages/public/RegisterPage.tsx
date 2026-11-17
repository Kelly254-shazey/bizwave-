import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CheckCircle2, ShieldCheck } from 'lucide-react';
import { apiRequest } from '../../services/api';
import { useAuth } from '../../stores/authStore';

export const RegisterPage: React.FC = () => {
  const navigate = useNavigate();
  const { loginSuccess } = useAuth();
  const [form, setForm] = useState({
    businessName: '',
    businessEmail: '',
    phoneNumber: '+254',
    industryCode: 'retail',
    businessSize: 'small',
    countryCode: 'KE',
    preferredLanguage: 'en',
    firstName: '',
    lastName: '',
    email: '',
    password: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await apiRequest('/auth/register', {
        method: 'POST',
        body: {
          ...form,
          businessEmail: form.businessEmail || form.email,
        },
        skipAuth: true,
      });
      await loginSuccess(res);
      navigate('/app/onboarding');
    } catch (err: any) {
      const fieldErrs = err.details?.errors
        ? Object.entries(err.details.errors)
            .map(([k, v]) => `${k}: ${(v as string[]).join(', ')}`)
            .join(' · ')
        : '';
      setError(fieldErrs || err.message || 'Registration failed.');
    } finally {
      setLoading(false);
    }
  };

  const inputCls =
    'w-full px-3.5 py-2.5 text-sm bg-[#041527] border border-white/15 text-white placeholder-slate-500 rounded-lg focus:outline-none focus:border-[#2ED3C2]';

  return (
    <div className="py-14 sm:py-20 px-4 bg-[#041527] text-white">
      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
        {/* Left Rail: Unique Launchpad Message (What Happens in the Next 60 Seconds) */}
        <div className="lg:col-span-5 space-y-6 lg:sticky lg:top-24">
          <div>
            <div className="text-xs font-bold uppercase tracking-widest text-[#2ED3C2]">60-Second Workspace Launch</div>
            <h1 className="mt-2 text-3xl sm:text-4xl font-extrabold tracking-tight text-white leading-tight">
              Launch Your Isolated <span className="text-[#2ED3C2]">SME Workspace.</span>
            </h1>
            <div className="teal-bar mt-4" />
            <p className="mt-4 text-sm text-slate-300 leading-relaxed">
              Your workspace starts 100% clean — zero fake demo numbers, zero shared tables. Here is exactly what happens the moment you register:
            </p>
          </div>

          <div className="space-y-4">
            {[
              {
                step: '01',
                title: 'Dedicated Tenant & Main Branch Created',
                desc: 'Configured in KES (Africa/Nairobi timezone) with industry-matched KPIs and AI suggestions.',
              },
              {
                step: '02',
                title: 'Upload Your First Spreadsheet or Log Daily Entries',
                desc: 'Bring your existing sales, M-Pesa statement logs, stock, or expense sheets — validated automatically.',
              },
              {
                step: '03',
                title: 'Instant Health Score, Forecasts & AI Guidance',
                desc: 'Start asking business questions in English or Kiswahili and scale your plan only when ready.',
              },
            ].map((item) => (
              <div key={item.step} className="slide-card rounded-xl p-4 flex items-start gap-3.5">
                <span className="text-lg font-extrabold text-[#2ED3C2] shrink-0">{item.step}</span>
                <div>
                  <div className="text-sm font-bold text-white">{item.title}</div>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="p-4 rounded-xl bg-[#2ED3C2]/10 border border-[#2ED3C2]/25 space-y-2 text-xs text-slate-200">
            <div className="flex items-center gap-2 font-bold text-[#2ED3C2]">
              <ShieldCheck className="w-4 h-4" /> Clear Billing &amp; Non-Custodial Guarantee
            </div>
            <ul className="space-y-1 text-slate-300">
              <li className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-[#2ED3C2]" /> No customer payments pass through BizWave.</li>
              <li className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-[#2ED3C2]" /> Only BizWave subscription &amp; add-on services are billed.</li>
              <li className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-[#2ED3C2]" /> You own 100% of your uploaded business data.</li>
            </ul>
          </div>
        </div>

        {/* Right: Clean Registration Form */}
        <div className="lg:col-span-7">
          <form onSubmit={handleSubmit} className="slide-card p-6 sm:p-8 rounded-2xl space-y-5">
            <div className="text-xs font-bold uppercase tracking-wider text-[#2ED3C2]">1. Business Profile</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-200 mb-1.5">Business Name *</label>
                <input
                  required
                  value={form.businessName}
                  onChange={(e) => setForm({ ...form, businessName: e.target.value })}
                  className={inputCls}
                  placeholder="e.g. Rift Valley Hardware Ltd"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-200 mb-1.5">Business Industry *</label>
                <select
                  value={form.industryCode}
                  onChange={(e) => setForm({ ...form, industryCode: e.target.value })}
                  className={inputCls}
                >
                  <option value="retail">Retail &amp; Supermarkets</option>
                  <option value="restaurant">Restaurants &amp; Cafes</option>
                  <option value="wholesale">Wholesale &amp; Distribution</option>
                  <option value="salon">Salons &amp; Wellness</option>
                  <option value="professional_services">Professional Services</option>
                  <option value="general_sme">General SME</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-200 mb-1.5">Team Size *</label>
                <select
                  value={form.businessSize}
                  onChange={(e) => setForm({ ...form, businessSize: e.target.value })}
                  className={inputCls}
                >
                  <option value="micro">Micro (1–9 staff)</option>
                  <option value="small">Small (10–49 staff)</option>
                  <option value="medium">Medium (50–249 staff)</option>
                  <option value="enterprise">Enterprise (250+)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-200 mb-1.5">Country</label>
                <select
                  value={form.countryCode}
                  onChange={(e) => setForm({ ...form, countryCode: e.target.value })}
                  className={inputCls}
                >
                  <option value="KE">Kenya (KES)</option>
                  <option value="UG">Uganda</option>
                  <option value="TZ">Tanzania</option>
                  <option value="RW">Rwanda</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-200 mb-1.5">Preferred Language</label>
                <select
                  value={form.preferredLanguage}
                  onChange={(e) => setForm({ ...form, preferredLanguage: e.target.value })}
                  className={inputCls}
                >
                  <option value="en">English</option>
                  <option value="sw">Kiswahili</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-200 mb-1.5">Business Email *</label>
                <input
                  type="email"
                  required
                  value={form.businessEmail}
                  onChange={(e) => setForm({ ...form, businessEmail: e.target.value })}
                  className={inputCls}
                  placeholder="info@yourbusiness.co.ke"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-200 mb-1.5">Contact Phone</label>
                <input
                  value={form.phoneNumber}
                  onChange={(e) => setForm({ ...form, phoneNumber: e.target.value })}
                  className={inputCls}
                  placeholder="+254712345678"
                />
              </div>
            </div>

            <div className="pt-2 border-t border-white/10 text-xs font-bold uppercase tracking-wider text-[#2ED3C2]">
              2. Owner Account Credentials
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-200 mb-1.5">First Name *</label>
                <input
                  required
                  value={form.firstName}
                  onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                  className={inputCls}
                  placeholder="Grace"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-200 mb-1.5">Last Name *</label>
                <input
                  required
                  value={form.lastName}
                  onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                  className={inputCls}
                  placeholder="Wanjiku"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-200 mb-1.5">Login Email *</label>
                <input
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className={inputCls}
                  placeholder="owner@yourbusiness.co.ke"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-200 mb-1.5">Password (min 8 chars) *</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className={inputCls}
                  placeholder="Strong password"
                />
              </div>
            </div>

            {error && <div className="p-3 rounded-lg bg-rose-500/15 border border-rose-400/30 text-rose-200 text-xs">{error}</div>}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl bg-[#2ED3C2] text-[#041527] text-sm font-bold hover:bg-[#5ce2d4] disabled:opacity-50 transition-colors"
            >
              {loading ? 'Provisioning isolated workspace...' : 'Create Business Workspace'}
            </button>

            <div className="text-center text-xs text-slate-400">
              Already have a workspace?{' '}
              <Link to="/login" className="font-semibold text-[#2ED3C2] hover:underline">
                Sign in here
              </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
