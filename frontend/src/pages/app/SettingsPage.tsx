import React, { useEffect, useState } from 'react';
import { Building2, KeyRound, Palette, Shield } from 'lucide-react';
import { apiRequest } from '../../services/api';
import { useAuth } from '../../stores/authStore';

const APPROVED_PALETTE = ['#0D9488', '#0F766E', '#1D4ED8', '#D97706', '#7C3AED', '#BE123C', '#041527'];

export const SettingsPage: React.FC = () => {
  const { activeOrg, branches, hasPermission, refreshSession } = useAuth();
  const [orgForm, setOrgForm] = useState({
    displayName: activeOrg?.display_name || '',
    industryCode: activeOrg?.industry_code || 'retail',
    brandColor: activeOrg?.brand_color || '#0D9488',
    logoUrl: activeOrg?.logo_url || '',
    preferredLanguage: activeOrg?.preferred_language || 'en',
  });
  const [branchForm, setBranchForm] = useState({ code: '', name: '', city: 'Nairobi', address: '' });
  const [mfaSetup, setMfaSetup] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [sessions, setSessions] = useState<any[]>([]);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [passwords, setPasswords] = useState({ current: '', next: '', confirm: '' });
  const [changingPassword, setChangingPassword] = useState(false);

  useEffect(() => {
    apiRequest('/auth/sessions')
      .then((s) => setSessions(s || []))
      .catch(() => {});
  }, []);

  const saveBranding = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeOrg) return;
    setErr('');
    setMsg('');
    try {
      await apiRequest(`/organizations/${activeOrg.id}`, {
        method: 'PATCH',
        body: { ...orgForm, logoUrl: orgForm.logoUrl || null },
      });
      await refreshSession();
      setMsg('Organization personalization & industry template updated.');
    } catch (e: any) {
      setErr(e.message);
    }
  };

  const addBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    setMsg('');
    try {
      await apiRequest('/branches', { method: 'POST', body: branchForm });
      setBranchForm({ code: '', name: '', city: 'Nairobi', address: '' });
      await refreshSession();
      setMsg('New branch created.');
    } catch (e: any) {
      setErr(e.message);
    }
  };

  const changePassword = async (event: React.FormEvent) => {
    event.preventDefault(); setErr(''); setMsg('');
    if (passwords.next !== passwords.confirm) { setErr('The new passwords do not match.'); return; }
    setChangingPassword(true);
    try {
      const res = await apiRequest('/auth/change-password', { method: 'POST', body: { currentPassword: passwords.current, newPassword: passwords.next } });
      setPasswords({ current: '', next: '', confirm: '' }); setMsg(res.message);
    } catch (e: any) { setErr(e.message || 'Could not change your password.'); }
    finally { setChangingPassword(false); }
  };

  const startMfa = async () => {
    const res = await apiRequest('/auth/mfa/setup', { method: 'POST' });
    setMfaSetup(res);
  };

  const verifyMfa = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    try {
      const res = await apiRequest('/auth/mfa/verify', { method: 'POST', body: { code: mfaCode } });
      setMsg(res.message);
      setMfaSetup(null);
      setMfaCode('');
      refreshSession();
    } catch (e: any) {
      setErr(e.message);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <div className="text-xs font-bold uppercase tracking-wider text-teal-600">Your Workspace, Your Rules</div>
        <h1 className="mt-1 text-2xl font-extrabold text-navy-950">Workspace &amp; Security Settings</h1>
        <p className="text-sm text-slate-500">
          Customize your business identity, manage branches, protect logins with 2-factor authentication (MFA), and monitor active sessions.
        </p>
      </div>

      {msg && <div className="p-3 rounded-xl bg-teal-50 border border-teal-200 text-teal-900 text-xs font-medium">{msg}</div>}
      {err && <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">{err}</div>}

      {/* Brand & Industry Personalization */}
      {hasPermission('org:manage') && (
        <form onSubmit={saveBranding} className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
          <h2 className="text-sm font-bold text-navy-950 flex items-center gap-2">
            <Palette className="w-4 h-4 text-teal-600" /> Personalized Client Portal Branding
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Business Display Name</label>
              <input value={orgForm.displayName} onChange={(e) => setOrgForm({ ...orgForm, displayName: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Industry Workspace Template</label>
              <select value={orgForm.industryCode} onChange={(e) => setOrgForm({ ...orgForm, industryCode: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white">
                <option value="retail">Retail &amp; Supermarkets</option>
                <option value="restaurant">Restaurants &amp; Cafes</option>
                <option value="wholesale">Wholesale &amp; Distribution</option>
                <option value="salon">Salons &amp; Wellness</option>
                <option value="professional_services">Professional Services</option>
                <option value="general_sme">General SME</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Logo Image URL (Optional)</label>
              <input value={orgForm.logoUrl} onChange={(e) => setOrgForm({ ...orgForm, logoUrl: e.target.value })} placeholder="https://..." className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Default Language</label>
              <select value={orgForm.preferredLanguage} onChange={(e) => setOrgForm({ ...orgForm, preferredLanguage: e.target.value as 'en' | 'sw' })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white">
                <option value="en">English</option>
                <option value="sw">Kiswahili</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-2">Approved Brand Color</label>
            <div className="flex items-center gap-2.5">
              {APPROVED_PALETTE.map((hex) => (
                <button
                  key={hex}
                  type="button"
                  onClick={() => setOrgForm({ ...orgForm, brandColor: hex })}
                  style={{ backgroundColor: hex }}
                  className={`w-7 h-7 rounded-full border-2 ${orgForm.brandColor === hex ? 'border-navy-950 scale-110' : 'border-white'}`}
                />
              ))}
            </div>
          </div>
          <button type="submit" className="px-5 py-2.5 rounded-xl bg-navy-950 text-white text-xs font-semibold hover:bg-navy-800">
            Save Personalization
          </button>
        </form>
      )}

      {/* Branches */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
        <h2 className="text-sm font-bold text-navy-950 flex items-center gap-2">
          <Building2 className="w-4 h-4 text-teal-600" /> Branches ({branches.length})
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {branches.map((b) => (
            <div key={b.id} className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 text-xs">
              <div className="font-bold text-navy-950">{b.name} ({b.code}) {b.is_headquarters ? '· HQ' : ''}</div>
              <div className="text-slate-500 mt-0.5">{b.address || b.city}</div>
            </div>
          ))}
        </div>
        {hasPermission('branches:manage') && (
          <form onSubmit={addBranch} className="grid grid-cols-1 sm:grid-cols-4 gap-2 pt-2">
            <input required placeholder="Code (e.g. CBD-03)" value={branchForm.code} onChange={(e) => setBranchForm({ ...branchForm, code: e.target.value })} className="px-3 py-2 text-xs border border-slate-200 rounded-lg" />
            <input required placeholder="Branch Name" value={branchForm.name} onChange={(e) => setBranchForm({ ...branchForm, name: e.target.value })} className="px-3 py-2 text-xs border border-slate-200 rounded-lg" />
            <input placeholder="Address" value={branchForm.address} onChange={(e) => setBranchForm({ ...branchForm, address: e.target.value })} className="px-3 py-2 text-xs border border-slate-200 rounded-lg" />
            <button type="submit" className="py-2 px-4 rounded-xl bg-navy-950 text-white text-xs font-semibold">Add Branch</button>
          </form>
        )}
      </div>

      <form onSubmit={changePassword} className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
        <h2 className="text-sm font-bold text-navy-950 flex items-center gap-2"><KeyRound className="w-4 h-4 text-teal-600" /> Change your password</h2>
        <p className="text-xs text-slate-600">Use at least eight characters, including an uppercase letter and a number. Other sessions will be signed out.</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label className="text-xs text-slate-600">Current password<input aria-label="Current password" type="password" required autoComplete="current-password" value={passwords.current} onChange={(e) => setPasswords({ ...passwords, current: e.target.value })} className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg" /></label>
          <label className="text-xs text-slate-600">New password<input aria-label="New password" type="password" required minLength={8} maxLength={128} pattern="(?=.*[A-Z])(?=.*[0-9]).{8,}" title="Use an uppercase letter and a number." autoComplete="new-password" value={passwords.next} onChange={(e) => setPasswords({ ...passwords, next: e.target.value })} className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg" /></label>
          <label className="text-xs text-slate-600">Confirm new password<input aria-label="Confirm new password" type="password" required minLength={8} maxLength={128} autoComplete="new-password" value={passwords.confirm} onChange={(e) => setPasswords({ ...passwords, confirm: e.target.value })} className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg" /></label>
        </div>
        <button type="submit" disabled={changingPassword} className="px-4 py-2 rounded-xl bg-navy-950 text-white text-xs font-semibold disabled:opacity-50">{changingPassword ? 'Changing…' : 'Change password'}</button>
      </form>

      {/* MFA & Session Security */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-3">
          <h2 className="text-sm font-bold text-navy-950 flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-teal-600" /> Two-Factor Authentication (TOTP MFA)
          </h2>
          <p className="text-xs text-slate-600">Protect your account with an RFC 6238 authenticator app (Google Authenticator, Authy, 1Password).</p>
          {!mfaSetup ? (
            <button type="button" onClick={startMfa} className="px-4 py-2 rounded-xl bg-navy-950 text-white text-xs font-semibold">
              Configure TOTP Authenticator
            </button>
          ) : (
            <form onSubmit={verifyMfa} className="space-y-3">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs break-all">
                <div className="font-semibold text-navy-950 mb-1">Setup Key (Add to Authenticator App):</div>
                <code className="text-teal-700 font-bold">{mfaSetup.secret}</code>
              </div>
              <div className="flex gap-2">
                <input required maxLength={6} placeholder="Enter 6-digit code" value={mfaCode} onChange={(e) => setMfaCode(e.target.value)} className="flex-1 px-3 py-2 text-xs border border-slate-200 rounded-lg" />
                <button type="submit" className="px-4 py-2 rounded-lg bg-teal-600 text-white text-xs font-semibold">Verify</button>
              </div>
            </form>
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-3">
          <h2 className="text-sm font-bold text-navy-950 flex items-center gap-2">
            <Shield className="w-4 h-4 text-teal-600" /> Active Sessions ({sessions.filter((s) => !s.revoked_at).length})
          </h2>
          <div className="space-y-2 text-xs max-h-48 overflow-y-auto">
            {sessions.slice(0, 6).map((s) => (
              <div key={s.id} className="p-2.5 rounded-lg bg-slate-50 flex items-center justify-between gap-2">
                <div className="truncate">
                  <div className="font-semibold text-navy-950">{s.isCurrent ? 'Current Session' : 'Session'} {s.revoked_at ? '(Revoked)' : ''}</div>
                  <div className="text-[10px] text-slate-400 truncate">{s.ip_address || 'local'} · {new Date(s.created_at).toLocaleString('en-KE')}</div>
                </div>
                {!s.isCurrent && !s.revoked_at && (
                  <button
                    type="button"
                    onClick={async () => {
                      await apiRequest(`/auth/sessions/${s.id}`, { method: 'DELETE' });
                      setSessions((prev) => prev.map((x) => (x.id === s.id ? { ...x, revoked_at: new Date().toISOString() } : x)));
                    }}
                    className="text-[11px] font-semibold text-rose-700 hover:underline shrink-0"
                  >
                    Revoke
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
