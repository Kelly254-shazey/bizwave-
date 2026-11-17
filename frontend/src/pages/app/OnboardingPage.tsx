import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, ArrowRight, Upload, Building2, Palette, Users } from 'lucide-react';
import { apiRequest } from '../../services/api';
import { useAuth } from '../../stores/authStore';

const BRAND_COLORS = ['#0D9488', '#0F766E', '#1D4ED8', '#D97706', '#7C3AED', '#BE123C', '#041527'];

export const OnboardingPage: React.FC = () => {
  const { activeOrg, branches, refreshSession } = useAuth();
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
  const [inviteForm, setInviteForm] = useState({ email: '', firstName: '', lastName: '', roleCode: 'business_manager' });
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
      setStatusMsg('Branch added successfully.');
    } catch (err: any) {
      setStatusMsg(err.message);
    }
  };

  const inviteTeammate = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMsg('');
    try {
      await apiRequest('/admin/users/invite', { method: 'POST', body: inviteForm });
      setInviteForm({ email: '', firstName: '', lastName: '', roleCode: 'business_manager' });
      setStatusMsg('Employee invited with assigned role.');
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
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <div className="text-xs font-semibold uppercase tracking-wider text-teal-600">Guided Business Onboarding</div>
        <h1 className="mt-1 text-2xl font-extrabold text-navy-950">Configure {activeOrg?.display_name}</h1>
        <p className="text-sm text-slate-500 mt-1">
          Personalize your industry template, branches, team roles, and data sources.
        </p>
      </div>

      {/* Stepper */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { n: 1, label: 'Profile & Industry' },
          { n: 2, label: 'Branches & Team' },
          { n: 3, label: 'Data Sources' },
          { n: 4, label: 'Launch Dashboard' },
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
            <div className="text-[10px] opacity-75">Step {s.n}/4</div>
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
            <Palette className="w-4 h-4 text-teal-600" /> Business Profile, Industry &amp; Brand Identity
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Display Name</label>
              <input
                value={orgForm.displayName}
                onChange={(e) => setOrgForm({ ...orgForm, displayName: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Industry Template</label>
              <select
                value={orgForm.industryCode}
                onChange={(e) => setOrgForm({ ...orgForm, industryCode: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
              >
                {templates.length > 0 ? (
                  templates.map((tpl) => (
                    <option key={tpl.code} value={tpl.code}>
                      {tpl.name}
                    </option>
                  ))
                ) : (
                  <option value="retail">Retail &amp; Supermarkets</option>
                )}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Currency &amp; Timezone</label>
              <input
                disabled
                value={`${orgForm.currencyCode} · ${orgForm.timezone}`}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 text-slate-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Preferred Language</label>
              <select
                value={orgForm.preferredLanguage}
                onChange={(e) => setOrgForm({ ...orgForm, preferredLanguage: e.target.value as 'en' | 'sw' })}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
              >
                <option value="en">English</option>
                <option value="sw">Kiswahili</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-2">Workspace Brand Accent Color</label>
            <div className="flex items-center gap-2.5">
              {BRAND_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setOrgForm({ ...orgForm, brandColor: c })}
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
              {saving ? 'Saving...' : 'Save & Continue'} <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <form onSubmit={addBranch} className="bg-white border border-slate-200 rounded-2xl p-6 space-y-3">
            <div className="flex items-center gap-2 font-bold text-navy-950 text-sm">
              <Building2 className="w-4 h-4 text-teal-600" /> Add Another Branch ({branches.length} active)
            </div>
            <input
              required
              placeholder="Branch Code (e.g. KLM-02)"
              value={branchForm.code}
              onChange={(e) => setBranchForm({ ...branchForm, code: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
            />
            <input
              required
              placeholder="Branch Name (e.g. Kilimani Express)"
              value={branchForm.name}
              onChange={(e) => setBranchForm({ ...branchForm, name: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
            />
            <input
              placeholder="Street Address"
              value={branchForm.address}
              onChange={(e) => setBranchForm({ ...branchForm, address: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
            />
            <button type="submit" className="w-full py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold">
              Add Branch
            </button>
          </form>

          <form onSubmit={inviteTeammate} className="bg-white border border-slate-200 rounded-2xl p-6 space-y-3">
            <div className="flex items-center gap-2 font-bold text-navy-950 text-sm">
              <Users className="w-4 h-4 text-teal-600" /> Invite an Employee
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                required
                placeholder="First name"
                value={inviteForm.firstName}
                onChange={(e) => setInviteForm({ ...inviteForm, firstName: e.target.value })}
                className="px-3 py-2 text-sm border border-slate-200 rounded-lg"
              />
              <input
                required
                placeholder="Last name"
                value={inviteForm.lastName}
                onChange={(e) => setInviteForm({ ...inviteForm, lastName: e.target.value })}
                className="px-3 py-2 text-sm border border-slate-200 rounded-lg"
              />
            </div>
            <input
              type="email"
              required
              placeholder="employee@company.co.ke"
              value={inviteForm.email}
              onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
            />
            <select
              value={inviteForm.roleCode}
              onChange={(e) => setInviteForm({ ...inviteForm, roleCode: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
            >
              <option value="business_manager">Business Manager</option>
              <option value="branch_manager">Branch Manager</option>
              <option value="finance_officer">Finance Officer</option>
              <option value="inventory_manager">Inventory Manager</option>
              <option value="customer_service_agent">Customer Service Agent</option>
            </select>
            <button type="submit" className="w-full py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold">
              Send Role Invite
            </button>
          </form>

          <div className="md:col-span-2 flex justify-between">
            <button type="button" onClick={() => setStep(1)} className="px-4 py-2 text-xs font-semibold border border-slate-200 rounded-lg">
              Back
            </button>
            <button type="button" onClick={() => setStep(3)} className="px-5 py-2.5 rounded-xl bg-navy-950 text-white text-sm font-semibold">
              Continue to Data Import →
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-2 font-bold text-navy-950">
            <Upload className="w-4 h-4 text-teal-600" /> Import Initial Business Records
          </div>
          <p className="text-sm text-slate-600">
            Start with CSV or Excel spreadsheets of your sales, expenses, products, or customers. BizWave validates every single row before committing so no errors go unnoticed.
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => navigate('/app/analytics?tab=imports')}
              className="px-5 py-2.5 rounded-xl bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700"
            >
              Open Spreadsheet Import Wizard
            </button>
            <button
              type="button"
              onClick={() => setStep(4)}
              className="px-5 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-navy-950 hover:bg-slate-50"
            >
              Skip for Now &amp; Review Setup →
            </button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-4">
          <CheckCircle2 className="w-12 h-12 text-teal-600 mx-auto" />
          <h2 className="text-xl font-bold text-navy-950">Your Personalized Workspace Is Ready</h2>
          <p className="text-sm text-slate-600 max-w-md mx-auto">
            Industry template: <strong className="capitalize">{orgForm.industryCode.replace('_', ' ')}</strong> · Currency:{' '}
            <strong>{orgForm.currencyCode}</strong> · Branches: <strong>{branches.length}</strong>.
          </p>
          <button
            type="button"
            onClick={finishOnboarding}
            disabled={saving}
            className="px-6 py-3 rounded-xl bg-navy-950 text-white text-sm font-semibold hover:bg-navy-800"
          >
            {saving ? 'Finalizing...' : 'Launch Personalized Dashboard'}
          </button>
        </div>
      )}
    </div>
  );
};
