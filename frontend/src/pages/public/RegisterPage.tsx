import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
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
      <div className="max-w-xl mx-auto">
        <div className="text-center mb-8">
          <div className="text-xs font-bold uppercase tracking-widest text-[#2ED3C2]">Create SME Workspace</div>
          <h1 className="mt-2 text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
            Register your business on BizWave
          </h1>
          <p className="mt-2 text-sm text-slate-300">
            Default currency: KES · Timezone: Africa/Nairobi · Dedicated tenant workspace.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="slide-card p-6 sm:p-8 rounded-2xl space-y-5">
          <div className="text-xs font-bold uppercase tracking-wider text-[#2ED3C2]">1. Business Information</div>
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
              <label className="block text-xs font-semibold text-slate-200 mb-1.5">Business Size *</label>
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
            2. Business Owner Account
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

          <div className="p-3 rounded-xl bg-[#2ED3C2]/10 border border-[#2ED3C2]/25 flex items-start gap-2.5 text-xs text-slate-200">
            <ShieldCheck className="w-4 h-4 text-[#2ED3C2] shrink-0 mt-0.5" />
            <span>
              BizWave only records and analyses your business data to guide decisions — we never process or hold your customer payments.
            </span>
          </div>

          {error && <div className="p-3 rounded-lg bg-rose-500/15 border border-rose-400/30 text-rose-200 text-xs">{error}</div>}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl bg-[#2ED3C2] text-[#041527] text-sm font-bold hover:bg-[#5ce2d4] disabled:opacity-50 transition-colors"
          >
            {loading ? 'Provisioning workspace...' : 'Create Business Workspace'}
          </button>

          <div className="text-center text-xs text-slate-400">
            Already registered?{' '}
            <Link to="/login" className="font-semibold text-[#2ED3C2] hover:underline">
              Sign in here
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
};
