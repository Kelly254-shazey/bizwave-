import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Download, Lock, MessageSquare, Send, Settings2, ShieldCheck, Users } from 'lucide-react';
import { apiRequest } from '../../services/api';
import { useAuth } from '../../stores/authStore';
import { formatKes } from '../../i18n/translations';

export const ConnectPage: React.FC = () => {
  const { activeOrg, hasPermission, hasFeature } = useAuth();
  const [tab, setTab] = useState<'customers' | 'campaigns' | 'templates' | 'providers'>('customers');
  const [customers, setCustomers] = useState<any[]>([]);
  const [commData, setCommData] = useState<any>({ channels: [], providers: [], templates: [], campaigns: [], messages: [] });
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const [campForm, setCampForm] = useState({ name: '', channelType: 'sms', purpose: 'marketing', templateId: '', customMessage: '' });
  const [tplForm, setTplForm] = useState({ name: '', channelType: 'sms', language: 'en', purpose: 'marketing', bodyTemplate: 'Hi {{name}}, ...' });
  const [provForm, setProvForm] = useState({ channelType: 'sms', providerCode: 'africas_talking', senderId: '', apiKey: '', username: '' });

  const allowed = hasFeature('connect_core');

  const loadAll = async () => {
    setErr('');
    try {
      const [cRes, commRes] = await Promise.all([
        hasPermission('customers:read') ? apiRequest('/customers') : Promise.resolve({ customers: [] }),
        allowed && hasPermission('connect:read') ? apiRequest('/communications/overview') : Promise.resolve({ channels: [], providers: [], templates: [], campaigns: [], messages: [] }),
      ]);
      setCustomers(cRes.customers || []);
      setCommData(commRes);
    } catch (e: any) {
      setErr(e.message);
    }
  };

  useEffect(() => {
    loadAll();
  }, [activeOrg?.id]);

  const toggleConsent = async (customerId: string, channel: string, currentOptIn: boolean) => {
    try {
      await apiRequest(`/customers/${customerId}/consents`, {
        method: 'PATCH',
        body: { channel, purpose: 'marketing', status: currentOptIn ? 'revoked' : 'granted' },
      });
      setMsg('Customer marketing consent updated and logged for Kenya DPA 2019 compliance.');
      loadAll();
    } catch (e: any) {
      setErr(e.message);
    }
  };

  const handleDpaExport = async (customerId: string, name: string) => {
    try {
      const data = await apiRequest(`/customers/${customerId}/dpa-export`);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `dpa-2019-export-${name.toLowerCase().replace(/\s+/g, '-')}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setMsg(`Kenya DPA 2019 Data Subject Access export downloaded for ${name}.`);
    } catch (e: any) {
      setErr(e.message);
    }
  };

  const launchCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg('');
    setErr('');
    try {
      const res = await apiRequest('/communications/campaigns', { method: 'POST', body: campForm });
      setMsg(
        `Campaign "${res.campaign.name}" processed: ${res.campaign.consented_count} consented, ${res.campaign.skipped_no_consent_count} blocked for missing consent. ${res.honestNotice}`,
      );
      setCampForm({ ...campForm, name: '', customMessage: '' });
      loadAll();
    } catch (e: any) {
      setErr(e.message);
    }
  };

  const saveTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/communications/templates', { method: 'POST', body: tplForm });
      setMsg('Communication template saved.');
      setTplForm({ ...tplForm, name: '' });
      loadAll();
    } catch (e: any) {
      setErr(e.message);
    }
  };

  const saveProvider = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/communications/channels/configure', {
        method: 'POST',
        body: {
          channelType: provForm.channelType,
          providerCode: provForm.providerCode,
          senderId: provForm.senderId,
          credentials: {
            ...(provForm.apiKey ? { API_KEY: provForm.apiKey } : {}),
            ...(provForm.username ? { USERNAME: provForm.username } : {}),
          },
        },
      });
      setMsg('Provider channel configuration saved (credentials encrypted at rest via AES-256-GCM).');
      setProvForm({ ...provForm, apiKey: '' });
      loadAll();
    } catch (e: any) {
      setErr(e.message);
    }
  };

  if (!allowed && !hasPermission('customers:read')) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-8 max-w-xl mx-auto text-center space-y-3">
        <Lock className="w-10 h-10 text-amber-500 mx-auto" />
        <h1 className="text-xl font-bold text-navy-950">BizWave Connect Requires Growth Plan or Higher</h1>
        <Link to="/app/billing" className="inline-block mt-2 px-5 py-2.5 rounded-xl bg-navy-950 text-white text-sm font-semibold">
          View Plans
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-navy-950">BizWave Connect &amp; Customer CRM</h1>
          <p className="text-sm text-slate-500">
            SMS, WhatsApp, Voice &amp; USSD adapters with Kenya DPA 2019 consent enforcement and honest delivery reconciliation.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5 bg-white p-1 rounded-xl border border-slate-200">
          {[
            { id: 'customers', label: 'Customers & Consent', icon: Users },
            { id: 'campaigns', label: 'Campaigns & Logs', icon: Send },
            { id: 'templates', label: 'EN/SW Templates', icon: MessageSquare },
            { id: 'providers', label: 'Providers (SMS/WA/Voice/USSD)', icon: Settings2 },
          ].map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id as any)}
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold ${
                  tab === t.id ? 'bg-navy-950 text-white' : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Icon className="w-3.5 h-3.5" /> {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {msg && <div className="p-3.5 rounded-xl bg-teal-50 border border-teal-200 text-teal-900 text-xs font-medium">{msg}</div>}
      {err && <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">{err}</div>}

      {tab === 'customers' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 overflow-x-auto">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-navy-950">Customer Directory &amp; Consent Governance ({customers.length})</h2>
            <span className="inline-flex items-center gap-1 text-[11px] text-teal-700 font-medium">
              <ShieldCheck className="w-3.5 h-3.5" /> Kenya DPA 2019 Consent Enforced
            </span>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-100 text-slate-400 text-left">
                <th className="pb-2">Customer</th>
                <th className="pb-2">Channel / Lang</th>
                <th className="pb-2 text-right">Orders</th>
                <th className="pb-2 text-right">Lifetime Value</th>
                <th className="pb-2 text-center">Marketing Consent</th>
                <th className="pb-2 text-right">DPA Rights</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {customers.map((c) => (
                <tr key={c.customer_id} className="hover:bg-slate-50/70">
                  <td className="py-2.5">
                    <div className="font-semibold text-navy-950">{c.full_name}</div>
                    <div className="text-[11px] text-slate-400">{c.phone_number} · {c.email}</div>
                  </td>
                  <td className="py-2.5 uppercase text-[10px] font-semibold text-slate-500">
                    {c.preferred_channel} · {c.preferred_language}
                  </td>
                  <td className="py-2.5 text-right">{c.total_orders}</td>
                  <td className="py-2.5 text-right font-semibold">{formatKes(c.lifetime_value)}</td>
                  <td className="py-2.5 text-center">
                    <button
                      type="button"
                      disabled={!hasPermission('customers:write')}
                      onClick={() => toggleConsent(c.customer_id, 'sms', Boolean(c.marketing_opt_in))}
                      className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                        c.marketing_opt_in ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                      }`}
                    >
                      {c.marketing_opt_in ? 'GRANTED' : 'REVOKED'}
                    </button>
                  </td>
                  <td className="py-2.5 text-right">
                    <button
                      type="button"
                      onClick={() => handleDpaExport(c.customer_id, c.full_name)}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-teal-700 hover:underline"
                    >
                      <Download className="w-3 h-3" /> Export
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'campaigns' && (
        <div className="space-y-5">
          {hasPermission('connect:send') && (
            <form onSubmit={launchCampaign} className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
              <div className="text-sm font-bold text-navy-950">Launch Consent-Verified Campaign</div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <input
                  required
                  placeholder="Campaign Name"
                  value={campForm.name}
                  onChange={(e) => setCampForm({ ...campForm, name: e.target.value })}
                  className="px-3 py-2 text-xs border border-slate-200 rounded-lg"
                />
                <select value={campForm.channelType} onChange={(e) => setCampForm({ ...campForm, channelType: e.target.value })} className="px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white">
                  <option value="sms">SMS (Africa&apos;s Talking)</option>
                  <option value="whatsapp">WhatsApp Cloud API</option>
                  <option value="voice">Voice Broadcast</option>
                  <option value="ussd">USSD Prompt</option>
                </select>
                <select value={campForm.purpose} onChange={(e) => setCampForm({ ...campForm, purpose: e.target.value })} className="px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white">
                  <option value="marketing">Marketing (Requires Explicit Opt-In)</option>
                  <option value="transactional">Transactional / Order Update</option>
                </select>
                <select value={campForm.templateId} onChange={(e) => setCampForm({ ...campForm, templateId: e.target.value })} className="px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white">
                  <option value="">Use Custom Message Below</option>
                  {commData.templates.map((t: any) => (
                    <option key={t.id} value={t.id}>{t.name} ({t.language.toUpperCase()})</option>
                  ))}
                </select>
              </div>
              {!campForm.templateId && (
                <textarea
                  rows={2}
                  placeholder="Message body — supports {{name}} variable..."
                  value={campForm.customMessage}
                  onChange={(e) => setCampForm({ ...campForm, customMessage: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg"
                />
              )}
              <button type="submit" className="px-5 py-2.5 rounded-xl bg-navy-950 text-white text-xs font-semibold hover:bg-navy-800">
                Execute Consent Check &amp; Dispatch
              </button>
            </form>
          )}

          <div className="bg-white border border-slate-200 rounded-2xl p-5 overflow-x-auto">
            <h3 className="text-sm font-bold text-navy-950 mb-3">Message Delivery &amp; Consent Log ({commData.messages.length})</h3>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-100 text-slate-400 text-left">
                  <th className="pb-2">Recipient</th>
                  <th className="pb-2">Channel</th>
                  <th className="pb-2">Status</th>
                  <th className="pb-2">Provider Note / Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {commData.messages.map((m: any) => (
                  <tr key={m.id}>
                    <td className="py-2">
                      <div className="font-semibold text-navy-950">{m.customer_name || m.recipient_address}</div>
                      <div className="text-[10px] text-slate-400">{m.recipient_address}</div>
                    </td>
                    <td className="py-2 uppercase text-[10px] font-semibold">{m.channel_type}</td>
                    <td className="py-2">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          m.delivery_status === 'rejected_no_consent'
                            ? 'bg-rose-100 text-rose-700'
                            : m.delivery_status === 'provider_unconfigured'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-emerald-50 text-emerald-700'
                        }`}
                      >
                        {m.delivery_status}
                      </span>
                    </td>
                    <td className="py-2 text-slate-600 max-w-md">{m.failure_reason || 'Confirmed by provider'}</td>
                  </tr>
                ))}
                {commData.messages.length === 0 && (
                  <tr><td colSpan={4} className="py-6 text-center text-slate-400">No messages dispatched yet. Launch a campaign above to see live consent filtering &amp; honest adapter status.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'templates' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <form onSubmit={saveTemplate} className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
            <h3 className="text-sm font-bold text-navy-950">Create English / Kiswahili Template</h3>
            <input required placeholder="Template Name" value={tplForm.name} onChange={(e) => setTplForm({ ...tplForm, name: e.target.value })} className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg" />
            <div className="grid grid-cols-2 gap-2">
              <select value={tplForm.channelType} onChange={(e) => setTplForm({ ...tplForm, channelType: e.target.value })} className="px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white">
                <option value="sms">SMS</option>
                <option value="whatsapp">WhatsApp</option>
              </select>
              <select value={tplForm.language} onChange={(e) => setTplForm({ ...tplForm, language: e.target.value })} className="px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white">
                <option value="en">English</option>
                <option value="sw">Kiswahili</option>
              </select>
            </div>
            <textarea required rows={3} value={tplForm.bodyTemplate} onChange={(e) => setTplForm({ ...tplForm, bodyTemplate: e.target.value })} className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg" />
            <button type="submit" className="w-full py-2.5 rounded-xl bg-navy-950 text-white text-xs font-semibold">Save Template</button>
          </form>
          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
            <h3 className="text-sm font-bold text-navy-950">Active Templates ({commData.templates.length})</h3>
            {commData.templates.map((t: any) => (
              <div key={t.id} className="p-3.5 rounded-xl border border-slate-200/80 bg-slate-50/50 text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-navy-950">{t.name}</span>
                  <span className="uppercase text-[10px] font-semibold text-teal-700">{t.channel_type} · {t.language}</span>
                </div>
                <p className="text-slate-600">{t.body_template}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'providers' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
            <h3 className="text-sm font-bold text-navy-950">Configured Communication Channels</h3>
            {commData.channels.map((ch: any) => (
              <div key={ch.id} className="p-4 rounded-xl border border-slate-200 text-xs space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-navy-950 uppercase">{ch.channel_type} — {ch.provider_name}</span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${ch.credential_status === 'configured' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-100 text-amber-800'}`}>
                    {ch.credential_status}
                  </span>
                </div>
                <div className="text-slate-500">Sender ID: <code>{ch.sender_id}</code></div>
                <div className="text-[11px] text-slate-500">Required keys: <code>{(ch.required_env_keys || []).join(', ')}</code></div>
              </div>
            ))}
          </div>

          <form onSubmit={saveProvider} className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
            <h3 className="text-sm font-bold text-navy-950 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-teal-600" /> Configure Provider Adapter (Encrypted at Rest)
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <select value={provForm.channelType} onChange={(e) => setProvForm({ ...provForm, channelType: e.target.value })} className="px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white">
                <option value="sms">SMS</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="voice">Voice</option>
                <option value="ussd">USSD</option>
              </select>
              <select value={provForm.providerCode} onChange={(e) => setProvForm({ ...provForm, providerCode: e.target.value })} className="px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white">
                <option value="africas_talking">Africa&apos;s Talking</option>
                <option value="meta_whatsapp">Meta WhatsApp Cloud API</option>
                <option value="twilio">Twilio</option>
              </select>
            </div>
            <input required placeholder="Sender ID / Phone Number ID" value={provForm.senderId} onChange={(e) => setProvForm({ ...provForm, senderId: e.target.value })} className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg" />
            <input placeholder="Provider Username / Account SID" value={provForm.username} onChange={(e) => setProvForm({ ...provForm, username: e.target.value })} className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg" />
            <input type="password" placeholder="API Key / Access Token (stored AES-256-GCM encrypted)" value={provForm.apiKey} onChange={(e) => setProvForm({ ...provForm, apiKey: e.target.value })} className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg" />
            <button type="submit" className="w-full py-2.5 rounded-xl bg-navy-950 text-white text-xs font-semibold">Save Encrypted Configuration</button>
          </form>
        </div>
      )}
    </div>
  );
};
