import React, { useId, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Building2, CheckCircle2, ShieldCheck, Users } from 'lucide-react';
import { apiRequest } from '../../services/api';
import { useAuth } from '../../stores/authStore';

export const RegisterPage: React.FC = () => {
  const navigate = useNavigate();
  const { loginSuccess, setLanguage } = useAuth();
  const uid = useId();
  const [form, setForm] = useState({
    businessName: '', businessEmail: '', phoneNumber: '', industryCode: 'retail', businessSize: 'micro',
    preferredLanguage: 'en' as 'en' | 'sw', firstName: '', lastName: '', email: '', password: '', confirmPassword: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const sw = form.preferredLanguage === 'sw';
  const tr = (en: string, kiswahili: string) => sw ? kiswahili : en;
  const field = (name: string) => `${uid}-${name}`;
  const input = 'w-full min-w-0 px-3.5 py-3 text-sm bg-[#081c30] border border-[#35536a] text-white placeholder-slate-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2ED3C2]/60 focus:border-[#2ED3C2]';
  const label = 'block text-xs font-semibold text-slate-200 mb-1.5';

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    if (form.password !== form.confirmPassword) {
      setError(tr('The passwords do not match.', 'Nenosiri halilingani.'));
      return;
    }
    setLoading(true);
    try {
      const { confirmPassword: _confirmation, phoneNumber, ...rest } = form;
      const res = await apiRequest('/auth/register', {
        method: 'POST', skipAuth: true,
        body: { ...rest, businessEmail: form.businessEmail.trim() || form.email.trim(), countryCode: 'KE', ...(phoneNumber.trim() ? { phoneNumber: phoneNumber.trim() } : {}) },
      });
      setLanguage(form.preferredLanguage);
      await loginSuccess(res);
      navigate('/app/onboarding');
    } catch (err: any) {
      const errors = err.details?.errors;
      const fieldErrors = errors ? Object.values(errors).flat().join(' · ') : '';
      setError(fieldErrors || err.message || tr('Could not create your workspace. Please try again.', 'Imeshindikana kuunda nafasi yako. Jaribu tena.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-[#041527] text-white px-4 py-12 sm:py-16">
      <div className="max-w-6xl mx-auto grid lg:grid-cols-12 gap-10 lg:gap-14 items-start">
        <div className="lg:col-span-5 lg:sticky lg:top-24 space-y-7">
          <div>
            <div className="text-xs font-bold uppercase tracking-[.16em] text-[#2ED3C2]">{tr('GET STARTED', 'ANZA SASA')}</div>
            <h1 className="mt-3 text-3xl sm:text-4xl font-extrabold tracking-tight leading-tight">{tr('A clearer view of your business starts here.', 'Anza kuona biashara yako kwa uwazi zaidi.')}</h1>
            <p className="mt-4 text-sm text-slate-300 leading-7">{tr('Create your business workspace, add your records and make decisions with confidence.', 'Fungua nafasi ya biashara yako, weka rekodi zako na ufanye maamuzi kwa ujasiri.')}</p>
          </div>
          <div className="space-y-4">
            {[
              { icon: Building2, title: tr('Set up your business', 'Sanidi biashara yako'), text: tr('Start with your business details and a main branch.', 'Anza kwa kuweka maelezo ya biashara na tawi kuu.') },
              { icon: CheckCircle2, title: tr('Bring in your records', 'Weka rekodi zako'), text: tr('Add daily sales or import a file when you are ready.', 'Weka mauzo ya kila siku au pakia faili ukiwa tayari.') },
              { icon: Users, title: tr('Work with your team', 'Fanya kazi na timu yako'), text: tr('Invite team members to use their own accounts with role-based access.', 'Alika wanatimu watumie akaunti zao zenye ruhusa kulingana na jukumu.') },
            ].map(({ icon: Icon, title, text }) => <div key={title} className="flex gap-3.5">
              <div className="w-9 h-9 rounded-lg bg-[#153c4d] text-[#69e1d8] grid place-items-center shrink-0"><Icon size={17} /></div>
              <div><div className="text-sm font-semibold text-white">{title}</div><p className="mt-1 text-xs leading-6 text-slate-400">{text}</p></div>
            </div>)}
          </div>
          <div className="flex gap-3 p-4 rounded-xl border border-[#2b5662] bg-[#102d3d] text-xs leading-6 text-slate-300">
            <ShieldCheck className="w-5 h-5 text-[#62ded4] shrink-0 mt-0.5" />
            <span>{tr('Your business records are private to your workspace. You decide which team members can access them.', 'Rekodi za biashara yako ni za faragha. Unachagua wanatimu wanaoweza kuziona.')}</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="lg:col-span-7 rounded-2xl border border-[#2b465d] bg-[#10263b] p-5 sm:p-8 space-y-7 shadow-2xl shadow-black/20">
          <div className="flex flex-wrap justify-between items-start gap-4">
            <div><h2 className="text-xl font-bold tracking-tight">{tr('Create your workspace', 'Fungua nafasi yako')}</h2><p className="mt-1.5 text-xs leading-5 text-slate-400">{tr('Fields marked * are required.', 'Sehemu zenye * zinahitajika.')}</p></div>
            <div><label htmlFor={field('language')} className="sr-only">{tr('Language', 'Lugha')}</label><select id={field('language')} value={form.preferredLanguage} onChange={(e) => setForm({ ...form, preferredLanguage: e.target.value as 'en' | 'sw' })} className="rounded-lg bg-[#081c30] border border-[#35536a] text-slate-200 text-xs py-2 px-3"><option value="en">English</option><option value="sw">Kiswahili</option></select></div>
          </div>

          <fieldset className="space-y-4">
            <legend className="w-full border-b border-white/10 pb-3 mb-1 text-xs font-bold uppercase tracking-[.12em] text-[#72e1d9]">01 / {tr('Business details', 'Maelezo ya biashara')}</legend>
            <div><label className={label} htmlFor={field('business')}>{tr('Business name', 'Jina la biashara')} *</label><input id={field('business')} className={input} required minLength={2} maxLength={160} autoComplete="organization" value={form.businessName} onChange={(e) => setForm({ ...form, businessName: e.target.value })} placeholder={tr('e.g. Wanjiku Hardware', 'mf. Duka la Wanjiku')} /></div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div><label className={label} htmlFor={field('industry')}>{tr('Type of business', 'Aina ya biashara')} *</label><select id={field('industry')} className={input} value={form.industryCode} onChange={(e) => setForm({ ...form, industryCode: e.target.value })}>
                <option value="retail">{tr('Retail & shops', 'Maduka')}</option><option value="restaurant">{tr('Restaurants & cafés', 'Migahawa')}</option><option value="wholesale">{tr('Wholesale & distribution', 'Jumla na usambazaji')}</option><option value="salon">{tr('Salons & wellness', 'Saluni na afya')}</option><option value="professional_services">{tr('Professional services', 'Huduma za kitaalamu')}</option><option value="general_sme">{tr('Other business', 'Biashara nyingine')}</option>
              </select></div>
              <div><label className={label} htmlFor={field('size')}>{tr('Team size', 'Idadi ya wanatimu')} *</label><select id={field('size')} className={input} value={form.businessSize} onChange={(e) => setForm({ ...form, businessSize: e.target.value })}>
                <option value="micro">1–9</option><option value="small">10–49</option><option value="medium">50–249</option><option value="enterprise">250+</option>
              </select></div>
              <div><label className={label} htmlFor={field('phone')}>{tr('Business phone', 'Simu ya biashara')} <span className="font-normal text-slate-400">({tr('optional', 'si lazima')})</span></label><input id={field('phone')} type="tel" autoComplete="tel" className={input} minLength={7} maxLength={32} value={form.phoneNumber} onChange={(e) => setForm({ ...form, phoneNumber: e.target.value })} placeholder="+254 712 345 678" /></div>
              <div><label className={label} htmlFor={field('businessEmail')}>{tr('Business email', 'Barua pepe ya biashara')} <span className="font-normal text-slate-400">({tr('optional', 'si lazima')})</span></label><input id={field('businessEmail')} type="email" autoComplete="email" className={input} value={form.businessEmail} onChange={(e) => setForm({ ...form, businessEmail: e.target.value })} placeholder="info@business.co.ke" /></div>
            </div>
            <p className="text-xs leading-5 text-slate-400">{tr('This workspace is set up for Kenya, using KES and the Nairobi time zone.', 'Nafasi hii imesanidiwa kwa Kenya, ikitumia KES na saa za Nairobi.')}</p>
          </fieldset>

          <fieldset className="space-y-4">
            <legend className="w-full border-b border-white/10 pb-3 mb-1 text-xs font-bold uppercase tracking-[.12em] text-[#72e1d9]">02 / {tr('Your owner account', 'Akaunti ya mmiliki')}</legend>
            <div className="grid sm:grid-cols-2 gap-4">
              <div><label className={label} htmlFor={field('first')}>{tr('First name', 'Jina la kwanza')} *</label><input id={field('first')} className={input} required autoComplete="given-name" maxLength={100} value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} /></div>
              <div><label className={label} htmlFor={field('last')}>{tr('Last name', 'Jina la mwisho')} *</label><input id={field('last')} className={input} required autoComplete="family-name" maxLength={100} value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} /></div>
              <div className="sm:col-span-2"><label className={label} htmlFor={field('email')}>{tr('Email for sign-in', 'Barua pepe ya kuingia')} *</label><input id={field('email')} className={input} type="email" required autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@example.com" /></div>
              <div><label className={label} htmlFor={field('password')}>{tr('Password', 'Nenosiri')} *</label><input id={field('password')} className={input} type={showPassword ? 'text' : 'password'} required minLength={8} pattern="(?=.*[A-Z])(?=.*[0-9]).{8,}" title={tr('At least 8 characters, including an uppercase letter and a number.', 'Angalau herufi 8, ikijumuisha herufi kubwa na namba.')} autoComplete="new-password" aria-describedby={field('password-help')} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
              <div><label className={label} htmlFor={field('confirm')}>{tr('Confirm password', 'Thibitisha nenosiri')} *</label><input id={field('confirm')} className={input} type={showPassword ? 'text' : 'password'} required minLength={8} autoComplete="new-password" value={form.confirmPassword} onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })} /></div>
            </div>
            <p id={field('password-help')} className="text-xs text-slate-400">{tr('Use at least 8 characters, including an uppercase letter and a number.', 'Tumia angalau herufi 8, ikijumuisha herufi kubwa na namba.')}</p>
            <label className="inline-flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={showPassword} onChange={(e) => setShowPassword(e.target.checked)} className="accent-[#2ED3C2]" />{tr('Show passwords', 'Onyesha manenosiri')}</label>
          </fieldset>

          {error && <div role="alert" className="p-3 rounded-lg bg-rose-500/15 border border-rose-400/40 text-rose-200 text-xs leading-5">{error}</div>}
          <button type="submit" disabled={loading} className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-[#2ED3C2] text-[#041527] text-sm font-bold hover:bg-[#5ce2d4] disabled:opacity-50 transition-colors">{loading ? tr('Creating your workspace…', 'Inafungua nafasi yako…') : tr('Create workspace', 'Fungua nafasi')} <ArrowRight size={16} /></button>
          <p className="text-center text-xs text-slate-400">{tr('Already have an account?', 'Tayari una akaunti?')} <Link to="/login" className="font-semibold text-[#70e5db] hover:underline">{tr('Sign in', 'Ingia')}</Link></p>
        </form>
      </div>
    </div>
  );
};
