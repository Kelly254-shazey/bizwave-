import React, { useEffect, useState } from 'react';
import { Check, CreditCard, ShieldCheck } from 'lucide-react';
import { apiRequest } from '../../services/api';
import { useAuth } from '../../stores/authStore';
import { formatKes } from '../../i18n/translations';

export const BillingPage: React.FC = () => {
  const { activeOrg, hasPermission, refreshSession } = useAuth();
  const [billing, setBilling] = useState<any | null>(null);
  const [usage, setUsage] = useState<any | null>(null);
  const [audit, setAudit] = useState<any | null>(null);
  const [showAudit, setShowAudit] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const load = async () => {
    try {
      const [b, u, a] = await Promise.all([
        hasPermission('billing:read') ? apiRequest('/subscriptions') : Promise.resolve(null),
        hasPermission('billing:read') ? apiRequest('/subscriptions/usage') : Promise.resolve(null),
        hasPermission('audit:read') ? apiRequest('/admin/audit-logs') : Promise.resolve(null),
      ]);
      setBilling(b);
      setUsage(u);
      setAudit(a);
    } catch (e: any) {
      setErr(e.message);
    }
  };

  useEffect(() => {
    load();
  }, [activeOrg?.id]);

  const switchPlan = async (planCode: string) => {
    setErr('');
    setMsg('');
    try {
      await apiRequest('/subscriptions', { method: 'POST', body: { planCode } });
      await refreshSession();
      setMsg(`BizWave subscription plan updated to ${planCode.toUpperCase()}. Workspace capabilities refreshed.`);
      load();
    } catch (e: any) {
      setErr(e.message);
    }
  };

  const activateAddOn = async (addOnCode: string) => {
    try {
      await apiRequest('/subscriptions/add-ons', { method: 'POST', body: { addOnCode, quantity: 1 } });
      setMsg(`Platform service add-on '${addOnCode}' added to your BizWave subscription.`);
      load();
    } catch (e: any) {
      setErr(e.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-navy-950">BizWave Subscription &amp; Platform Services</h1>
          <p className="text-sm text-slate-500">
            Manage your monthly KES plan, usage quotas, and optional BizWave platform services.
          </p>
        </div>
      </div>

      {/* Explicit Non-Custodial Payment Boundary Notice */}
      <div className="p-4 rounded-2xl bg-[#041527] text-white border border-[#2ED3C2]/30 flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-[#2ED3C2] shrink-0 mt-0.5" />
        <div className="text-xs sm:text-sm text-slate-200 leading-relaxed">
          <strong className="text-[#2ED3C2]">Platform Billing Only:</strong> The <strong>only</strong> payments processed in BizWave are your <strong>BizWave subscription fee</strong> and optional <strong>BizWave platform services</strong> (SMS/WhatsApp/Voice/USSD bundles, onboarding, data cleaning, custom BI). Your customers never pay through BizWave — all sales, M-Pesa, stock, and expense entries in your portal are strictly for recording, analysis, and decision making.
        </div>
      </div>

      {msg && <div className="p-3 rounded-xl bg-teal-50 border border-teal-200 text-teal-900 text-xs font-medium">{msg}</div>}
      {err && <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">{err}</div>}

      {/* Usage Quotas */}
      {usage && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-navy-950 flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-teal-600" /> Current Plan &amp; Monthly Allowance
            </h2>
            <span className="px-3 py-1 rounded-full bg-[#041527] text-[#2ED3C2] text-xs font-bold uppercase">
              {usage.planCode} plan
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {usage.metrics.map((m: any) => {
              const pct = m.limit > 0 ? Math.min(100, Math.round((m.used / m.limit) * 100)) : 0;
              return (
                <div key={m.code} className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2">
                  <div className="text-[11px] font-semibold text-slate-600">{m.label}</div>
                  <div className="text-lg font-bold text-navy-950">
                    {m.used} <span className="text-xs font-normal text-slate-400">/ {m.limit}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-200 overflow-hidden">
                    <div className="h-full bg-teal-600 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Configurable Plans */}
      {billing?.availablePlans && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {billing.availablePlans.map((plan: any) => {
            const isCurrent = billing.subscription?.plan_code === plan.code;
            return (
              <div
                key={plan.code}
                className={`p-5 rounded-2xl border flex flex-col justify-between ${
                  isCurrent ? 'bg-[#041527] text-white border-[#2ED3C2]/50 shadow-md' : 'bg-white border-slate-200'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className={`font-extrabold text-sm uppercase ${isCurrent ? 'text-[#2ED3C2]' : 'text-navy-950'}`}>
                      {plan.name}
                    </span>
                    {isCurrent && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#2ED3C2] text-[#041527] font-bold shrink-0">
                        Active
                      </span>
                    )}
                  </div>
                  <div className="mt-2 text-lg font-bold">{plan.price_range_label}</div>
                  <ul className="mt-3 space-y-1.5 text-xs">
                    {(plan.features || []).slice(0, 6).map((f: any) => (
                      <li key={f.code} className="flex items-start gap-1.5">
                        <Check className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${isCurrent ? 'text-[#2ED3C2]' : 'text-teal-600'}`} />
                        <span>{f.label}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                {hasPermission('billing:manage') && !isCurrent && (
                  <button
                    type="button"
                    onClick={() => switchPlan(plan.code)}
                    className="mt-5 w-full py-2.5 rounded-xl bg-slate-100 hover:bg-[#041527] hover:text-[#2ED3C2] text-navy-950 text-xs font-bold transition-colors"
                  >
                    Switch to {plan.name}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Platform Services & Usage Add-Ons */}
      {billing?.availableAddOns && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
          <div>
            <h2 className="text-sm font-bold text-navy-950">Optional BizWave Platform Services &amp; Add-Ons (KES)</h2>
            <p className="text-xs text-slate-500">
              Add communication bundles, onboarding, data cleaning, extra branches, or custom BI services anytime.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {billing.availableAddOns.map((ao: any) => (
              <div key={ao.code} className="p-4 rounded-xl border border-slate-200 flex flex-col justify-between gap-3">
                <div>
                  <div className="font-bold text-xs text-navy-950">{ao.name}</div>
                  <div className="text-sm font-extrabold text-teal-700 mt-1">
                    {formatKes(ao.unit_price_kes)}{' '}
                    <span className="text-[11px] font-normal text-slate-400">/ {ao.unit_label}</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">{ao.description}</p>
                </div>
                {hasPermission('billing:manage') && (
                  <button
                    type="button"
                    onClick={() => activateAddOn(ao.code)}
                    className="py-2 px-3 rounded-lg border border-slate-200 hover:bg-[#041527] hover:text-[#2ED3C2] text-xs font-semibold text-navy-950 transition-colors"
                  >
                    Add Service
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Optional Collapsible Activity Trail for Business Owners */}
      {audit && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-teal-600" />
              <span className="text-sm font-bold text-navy-950">Account Security &amp; Activity Log</span>
            </div>
            <button
              type="button"
              onClick={() => setShowAudit((v) => !v)}
              className="text-xs font-semibold text-teal-700 hover:underline"
            >
              {showAudit ? 'Hide Activity Log' : `View Recent Activity (${(audit.logs || []).length})`}
            </button>
          </div>
          {showAudit && (
            <div className="mt-4 overflow-x-auto max-h-64">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-400 text-left">
                    <th className="pb-2">Action</th>
                    <th className="pb-2">User</th>
                    <th className="pb-2 text-right">Date &amp; Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(audit.logs || []).slice(0, 15).map((l: any) => (
                    <tr key={l.id}>
                      <td className="py-2 font-medium text-navy-950">{l.action}</td>
                      <td className="py-2 text-slate-600">{l.actor_email || 'system'}</td>
                      <td className="py-2 text-right text-slate-400">{new Date(l.created_at).toLocaleString('en-KE')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
