import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, ArrowRight, Upload, Building2, Palette, Users } from 'lucide-react';
import { apiRequest } from '../../services/api';
import { useAuth } from '../../stores/authStore';

const BRAND_COLORS = ['#0D9488', '#0F766E', '#1D4ED8', '#D97706', '#7C3AED', '#BE123C', '#041527'];

export const OnboardingPage: React.FC = () => {
  const { activeOrg, branches, refreshSession, language, setLanguage } = useAuth();
  const tr = (en: string, sw: string) => language === 'sw' ? sw : en;
  const industryName = (code: string, fallback: string) => language === 'sw' ? ({ retail: 'Maduka', restaurant: 'Migahawa', wholesale: 'Jumla na usambazaji', salon: 'Saluni na afya', professional_services: 'Huduma za kitaalamu', general_sme: 'Biashara nyingine' } as Record<string, string>)[code] || fallback : fallback;
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [templates, setTemplates] = useState<any[]>([]);
  const [orgForm, setOrgForm] = useState({
    displayName: activeOrg?.display_name || '',
    industryCode: activeOrg?.industry_code || 'retail',
    businessSize: activeOrg?.business_size || 'small',
    currencyCode: activeOrg?.currency_code || 'KES',
    timezone: activeOrg?.timezone || 'Africa/Nairobi',
    preferredLanguage: activeOrg?.preferred_language || 'en',
    brandColor: activeOrg?.brand_color || '#0D9488',
  });
  const [branchForm, setBranchForm] = useState({ code: '', name: '', city: 'Nairobi', address: '' });
  const [statusMsg, setStatusMsg] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiRequest<{ templates: any[] }>('/organizations/industry-templates', { skipAuth: true })
      .then((r) => setTemplates(r.templates || []))
      .catch(() => {});
  }, []);

  const saveProfileStep = async () => {
    if (!activeOrg) return;
    setSaving(true);
    setStatusMsg('');
    try {
      await apiRequest(`/organizations/${activeOrg.id}`, {
        method: 'PATCH',
        body: { ...orgForm, onboardingStep: 5 },
      });
      await refreshSession();
      setStep(2);
    } catch (e: any) {
      setStatusMsg(e.message);
    } finally {
      setSaving(false);
    }
  };

  const addBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMsg('');
    try {
      await apiRequest('/branches', { method: 'POST', body: branchForm });
      setBranchForm({ code: '', name: '', city: 'Nairobi', address: '' });
      await refreshSession();
      setStatusMsg(tr('Branch added.', 'Tawi limeongezwa.'));
    } catch (err: any) {
      setStatusMsg(err.message);
    }
  };

  const finishOnboarding = async () => {
    if (!activeOrg) return;
    setSaving(true);
    try {
      await apiRequest(`/organizations/${activeOrg.id}`, {
        method: 'PATCH',
        body: { onboardingStep: 11, onboardingCompleted: true },
      });
      await refreshSession();
      navigate('/app/dashboard');
    } catch (err: any) {
      setStatusMsg(err.message || tr('Could not complete setup. Please try again.', 'Imeshindikana kukamilisha usanidi. Jaribu tena.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <div className="text-xs font-semibold uppercase tracking-wider text-teal-600">{tr('BUSINESS SETUP', 'USANIDI WA BIASHARA')}</div>
        <h1 className="mt-1 text-2xl font-extrabold text-navy-950">{tr('Set up', 'Sanidi')} {activeOrg?.display_name}</h1>
        <p className="text-sm text-slate-500 mt-1">
          {tr('Set up your business, branches, team and records.', 'Sanidi biashara, matawi, timu na rekodi zako.')}
        </p>
      </div>

      {/* Stepper */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { n: 1, label: tr('Business profile', 'Wasifu wa biashara') },
          { n: 2, label: tr('Branches & team', 'Matawi na timu') },
          { n: 3, label: tr('Records', 'Rekodi') },
          { n: 4, label: tr('Finish', 'Maliza') },
        ].map((s) => (
          <button
            key={s.n}
            type="button"
            onClick={() => setStep(s.n)}
            className={`p-3 rounded-xl border text-left text-xs font-semibold transition-colors ${
              step === s.n
                ? 'bg-navy-950 text-white border-navy-950'
                : step > s.n
                  ? 'bg-teal-50 text-teal-900 border-teal-200'
                  : 'bg-white text-slate-500 border-slate-200'
            }`}
          >
            <div className="text-[10px] opacity-75">{tr('Step', 'Hatua')} {s.n}/4</div>
            <div className="mt-0.5 truncate">{s.label}</div>
          </button>
        ))}
      </div>

      {statusMsg && (
        <div className="p-3 rounded-xl bg-teal-50 border border-teal-200 text-teal-900 text-xs">{statusMsg}</div>
      )}

      {step === 1 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-5">
          <div className="flex items-center gap-2 font-bold text-navy-950">
            <Palette className="w-4 h-4 text-teal-600" /> {tr('Your business profile', 'Wasifu wa biashara yako')}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">{tr('Display Name', 'Jina la biashara')}</label>
              <input
                value={orgForm.displayName}
                onChange={(e) => setOrgForm({ ...orgForm, displayName: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">{tr('Industry Template', 'Aina ya biashara')}</label>
              <select
                value={orgForm.industryCode}
                onChange={(e) => setOrgForm({ ...orgForm, industryCode: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
              >
                {templates.length > 0 ? (
                  templates.map((tpl) => (
                    <option key={tpl.code} value={tpl.code}>
                      {industryName(tpl.code, tpl.name)}
                    </option>
                  ))
                ) : (
                  <option value="retail">{tr('Retail & shops', 'Maduka')}</option>
                )}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">{tr('Currency & Timezone', 'Sarafu na saa za eneo')}</label>
              <input
                disabled
                value={`${orgForm.currencyCode} · ${orgForm.timezone}`}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 text-slate-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">{tr('Preferred Language', 'Lugha inayopendelewa')}</label>
              <select
                value={orgForm.preferredLanguage}
                onChange={(e) => { const next = e.target.value as 'en' | 'sw'; setOrgForm({ ...orgForm, preferredLanguage: next }); setLanguage(next); }}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
              >
                <option value="en">English</option>
                <option value="sw">Kiswahili</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-2">{tr('Workspace Brand Accent Color', 'Rangi ya biashara')}</label>
            <div className="flex items-center gap-2.5">
              {BRAND_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setOrgForm({ ...orgForm, brandColor: c })}
                  aria-label={`${tr('Choose color', 'Chagua rangi')} ${c}`}
                  aria-pressed={orgForm.brandColor === c}
                  style={{ backgroundColor: c }}
                  className={`w-8 h-8 rounded-full border-2 ${orgForm.brandColor === c ? 'border-navy-950 scale-110' : 'border-white'}`}
                />
              ))}
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={saveProfileStep}
              disabled={saving}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-navy-950 text-white text-sm font-semibold hover:bg-navy-800"
            >
              {saving ? tr('Saving…', 'Inahifadhi…') : tr('Save & continue', 'Hifadhi na endelea')} <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <form onSubmit={addBranch} className="bg-white border border-slate-200 rounded-2xl p-6 space-y-3">
            <div className="flex items-center gap-2 font-bold text-navy-950 text-sm">
              <Building2 className="w-4 h-4 text-teal-600" /> {tr('Add another branch', 'Ongeza tawi')} ({branches.length})
            </div>
            <input
              required
              aria-label={tr('Branch code', 'Msimbo wa tawi')} placeholder={tr('Branch code (e.g. KLM-02)', 'Msimbo wa tawi (mf. KLM-02)')}
              value={branchForm.code}
              onChange={(e) => setBranchForm({ ...branchForm, code: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
            />
            <input
              required
              aria-label={tr('Branch name', 'Jina la tawi')} placeholder={tr('Branch name', 'Jina la tawi')}
              value={branchForm.name}
              onChange={(e) => setBranchForm({ ...branchForm, name: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
            />
            <input
              aria-label={tr('Street address', 'Anwani')} placeholder={tr('Street address', 'Anwani')}
              value={branchForm.address}
              onChange={(e) => setBranchForm({ ...branchForm, address: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
            />
            <button type="submit" className="w-full py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold">
              {tr('Add branch', 'Ongeza tawi')}
            </button>
          </form>

          <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-3">
            <div className="flex items-center gap-2 font-bold text-navy-950 text-sm"><Users className="w-4 h-4 text-teal-600" /> {tr('Add your team', 'Ongeza timu yako')}</div>
            <p className="text-sm text-slate-600">{tr('Give each person their own account and choose what they can access. You can do this now or later.', 'Mpe kila mtu akaunti yake na uchague taarifa anazoweza kuona. Unaweza kufanya hivi sasa au baadaye.')}</p>
            <button type="button" onClick={() => navigate('/app/team')} className="w-full py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold">{tr('Open team settings', 'Fungua mipangilio ya timu')}</button>
          </div>

          <div className="md:col-span-2 flex justify-between">
            <button type="button" onClick={() => setStep(1)} className="px-4 py-2 text-xs font-semibold border border-slate-200 rounded-lg">
              {tr('Back', 'Rudi')}
            </button>
            <button type="button" onClick={() => setStep(3)} className="px-5 py-2.5 rounded-xl bg-navy-950 text-white text-sm font-semibold">
              {tr('Continue to records', 'Endelea kwenye rekodi')} →
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-2 font-bold text-navy-950">
            <Upload className="w-4 h-4 text-teal-600" /> {tr('Bring in your records', 'Weka rekodi zako')}
          </div>
          <p className="text-sm text-slate-600">
            {tr('Upload a CSV or Excel file with sales, expenses, products or customers. Review any errors before saving.', 'Pakia faili ya CSV au Excel ya mauzo, matumizi, bidhaa au wateja. Kagua makosa kabla ya kuhifadhi.')}
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => navigate('/app/analytics?tab=imports')}
              className="px-5 py-2.5 rounded-xl bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700"
            >
              {tr('Open file import', 'Fungua upakiaji wa faili')}
            </button>
            <button
              type="button"
              onClick={() => setStep(4)}
              className="px-5 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-navy-950 hover:bg-slate-50"
            >
              {tr('Skip for now', 'Ruka kwa sasa')} →
            </button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-4">
          <CheckCircle2 className="w-12 h-12 text-teal-600 mx-auto" />
          <h2 className="text-xl font-bold text-navy-950">{tr('Your workspace is ready', 'Nafasi yako iko tayari')}</h2>
          <p className="text-sm text-slate-600 max-w-md mx-auto">
            {tr('Business type', 'Aina ya biashara')}: <strong className="capitalize">{industryName(orgForm.industryCode, orgForm.industryCode.replace('_', ' '))}</strong> · {tr('Currency', 'Sarafu')}:{' '}
            <strong>{orgForm.currencyCode}</strong> · {tr('Branches', 'Matawi')}: <strong>{branches.length}</strong>.
          </p>
          <button
            type="button"
            onClick={finishOnboarding}
            disabled={saving}
            className="px-6 py-3 rounded-xl bg-navy-950 text-white text-sm font-semibold hover:bg-navy-800"
          >
            {saving ? tr('Finishing…', 'Inamalizia…') : tr('Open dashboard', 'Fungua muhtasari')}
          </button>
        </div>
      )}
    </div>
  );
};
