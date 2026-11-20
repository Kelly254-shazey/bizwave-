import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, ArrowUpRight, Building2, Globe2, Mail, MapPin, Search, ShieldCheck, Store, Users, X } from 'lucide-react';
import { apiRequest } from '../../services/api';
import { useAuth } from '../../stores/authStore';

type Profile = { display_name: string; sector: string; county: string; description: string; contact_email: string | null; website: string | null; is_published: boolean };
type Business = Profile & { id: string };
type ProfileForm = { displayName: string; sector: string; county: string; description: string; contactEmail: string; website: string; isPublished: boolean };

export const ConnectPage: React.FC = () => {
  const { activeOrg, language, hasPermission } = useAuth();
  const sw = language === 'sw';
  const tr = (en: string, kiswahili: string) => sw ? kiswahili : en;
  const [query, setQuery] = useState('');
  const [county, setCounty] = useState('');
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [total, setTotal] = useState(0);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(true);
  const [error, setError] = useState('');
  const [profileError, setProfileError] = useState('');
  const [message, setMessage] = useState('');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<ProfileForm>({ displayName: '', sector: '', county: '', description: '', contactEmail: '', website: '', isPublished: false });
  const requestRef = useRef(0);

  useEffect(() => {
    if (!hasPermission('connect:read')) { setLoading(false); return; }
    const id = ++requestRef.current;
    setLoading(true); setError('');
    const timer = window.setTimeout(() => {
      apiRequest(`/business-network/businesses?q=${encodeURIComponent(query.trim())}&county=${encodeURIComponent(county.trim())}`)
        .then((result) => { if (id === requestRef.current) { setBusinesses(result.businesses || []); setTotal(result.total || 0); } })
        .catch((e) => { if (id === requestRef.current) { setBusinesses([]); setError(e.message || 'Unable to load the business directory.'); } })
        .finally(() => { if (id === requestRef.current) setLoading(false); });
    }, 250);
    return () => { window.clearTimeout(timer); requestRef.current++; };
  }, [activeOrg?.id, query, county]);

  useEffect(() => {
    if (!activeOrg || !hasPermission('org:read')) { setProfileLoading(false); return; }
    let current = true;
    setProfileLoading(true); setProfileError('');
    apiRequest('/business-network/profile').then((result) => { if (current) setProfile(result.profile); })
      .catch((e) => { if (current) setProfileError(e.message || 'Unable to load your profile.'); })
      .finally(() => { if (current) setProfileLoading(false); });
    return () => { current = false; };
  }, [activeOrg?.id]);

  const editProfile = () => {
    setForm({ displayName: profile?.display_name || activeOrg?.display_name || '', sector: profile?.sector || '', county: profile?.county || '', description: profile?.description || '', contactEmail: profile?.contact_email || '', website: profile?.website || '', isPublished: profile?.is_published || false });
    setProfileError(''); setMessage(''); setEditing(true);
  };
  const saveProfile = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true); setProfileError(''); setMessage('');
    try {
      const result = await apiRequest('/business-network/profile', { method: 'PUT', body: form });
      setProfile(result.profile); setEditing(false);
      setMessage(result.profile.is_published ? tr('Your profile is visible to other BizWave businesses.', 'Wasifu wako unaonekana kwa biashara nyingine za BizWave.') : tr('Your profile is private and is not listed in the directory.', 'Wasifu wako ni wa faragha na haupo kwenye orodha.'));
    } catch (e: any) { setProfileError(e.message || tr('Could not save your profile.', 'Imeshindikana kuhifadhi wasifu.')); }
    finally { setSaving(false); }
  };

  return <div className="space-y-5">
    <div className="flex flex-wrap justify-between items-end gap-4"><div><div className="p-eyebrow">BIZWAVE CONNECT</div><h1 className="p-title">{tr('Find businesses to grow with', 'Tafuta biashara za kushirikiana nazo')}</h1><p className="p-subtitle">{tr('Explore businesses on BizWave by what they do and where they are.', 'Tafuta biashara za BizWave kulingana na huduma zao na zilipo.')}</p></div>{hasPermission('customers:read') && <Link to="/app/customer-communications" className="p-button-secondary"><Users size={15} />{tr('Customer communications', 'Mawasiliano ya wateja')}</Link>}</div>
    {message && <div className="p-alert p-alert-success" role="status"><ShieldCheck size={17} />{message}</div>}
    <div className="network-intro p-panel"><div className="network-intro-icon"><Globe2 size={23} /></div><div><div className="p-panel-title">{tr('A business network, not a customer list', 'Mtandao wa biashara, si orodha ya wateja')}</div><p className="p-panel-note mt-1">{tr('Only businesses that choose to publish are listed. Your sales and financial records are never shared here.', 'Biashara zinazochagua kujitokeza pekee ndizo zinaonekana. Rekodi zako za mauzo na fedha hazishirikiwi hapa.')}</p></div></div>
    <div className="network-grid"><section className="space-y-4"><div className="p-panel network-search"><div className="network-search-header"><div><h2 className="p-panel-title">{tr('Discover businesses', 'Tafuta biashara')}</h2><p className="p-panel-note mt-1">{tr('Search by business, product or sector.', 'Tafuta kwa jina la biashara, bidhaa au sekta.')}</p></div><span className="network-count">{loading ? '—' : total} {tr('found', 'zimepatikana')}</span></div><div className="network-search-fields"><label className="network-input"><Search size={17} /><span className="sr-only">{tr('Search businesses or sector', 'Tafuta biashara au sekta')}</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={tr('e.g. electronics, agriculture', 'mf. vifaa vya umeme, kilimo')} /></label><label className="network-input"><MapPin size={17} /><span className="sr-only">{tr('Search county', 'Tafuta kaunti')}</span><input value={county} onChange={(e) => setCounty(e.target.value)} placeholder={tr('County or location', 'Kaunti au eneo')} /></label></div><p className="network-disclaimer">{tr('Results and counts cover opted-in BizWave businesses only. They are not market demand or sector statistics.', 'Matokeo na idadi ni za biashara za BizWave zilizokubali pekee. Si takwimu za soko au mahitaji ya sekta.')}</p></div>
      {error ? <div className="p-alert p-alert-error" role="alert"><AlertCircle size={17} />{error}</div> : loading ? <div className="p-panel p-8 p-empty">{tr('Loading businesses…', 'Inapakia biashara…')}</div> : businesses.length ? <div className="network-results">{businesses.map((business) => <article key={business.id} className="p-panel network-business"><div className="flex gap-3 items-start"><div className="network-business-icon"><Store size={18} /></div><div className="min-w-0 flex-1"><h3>{business.display_name}</h3><div className="network-business-meta"><span>{business.sector}</span><span>•</span><MapPin size={12} /><span>{business.county}</span></div></div></div>{business.description && <p>{business.description}</p>}<div className="network-business-links">{business.contact_email && <a href={`mailto:${business.contact_email}`}><Mail size={14} />{tr('Email business', 'Tuma barua pepe')}</a>}{business.website && <a href={business.website} target="_blank" rel="noreferrer noopener"><Globe2 size={14} />{tr('Visit website', 'Tembelea tovuti')} <ArrowUpRight size={13} /></a>}{!business.contact_email && !business.website && <span>{tr('No contact details shared', 'Hakuna mawasiliano yaliyowekwa')}</span>}</div></article>)}</div> : <div className="p-panel network-empty"><div className="network-empty-icon"><Search size={22} /></div><h3>{tr('No businesses found', 'Hakuna biashara zilizopatikana')}</h3><p>{query || county ? tr('Try a broader search or another location.', 'Jaribu utafutaji mpana zaidi au eneo lingine.') : tr('Published business profiles will appear here as the network grows.', 'Wasifu wa biashara utaonekana hapa kadri mtandao unavyokua.')}</p>{(query || county) && <button type="button" className="p-button-secondary" onClick={() => { setQuery(''); setCounty(''); }}>{tr('Clear filters', 'Ondoa vichujio')}</button>}</div>}
      {!loading && total > businesses.length && <p className="p-empty">{tr('Showing the first 50 matches. Narrow your search to see more.', 'Tunaonyesha matokeo 50 ya kwanza. Boresha utafutaji kuona zaidi.')}</p>}
    </section><aside className="space-y-4"><section className="p-panel network-profile"><div className="network-profile-icon"><Building2 size={20} /></div><h2 className="p-panel-title mt-4">{tr('Your business profile', 'Wasifu wa biashara yako')}</h2><p className="p-panel-note mt-2">{tr('Choose what other businesses can see. Publishing is optional and you can remove your listing at any time.', 'Chagua taarifa ambazo biashara nyingine zitaona. Kuchapisha si lazima na unaweza kujiondoa wakati wowote.')}</p><div className={`network-profile-status ${profile?.is_published ? 'published' : ''}`}><span />{profileLoading ? tr('Checking status…', 'Inakagua hali…') : profile?.is_published ? tr('Visible in directory', 'Inaonekana kwenye orodha') : tr('Not published', 'Haijachapishwa')}</div>{profileError && !editing && <p className="text-xs text-rose-700 mt-3" role="alert">{profileError}</p>}{hasPermission('org:manage') && <button type="button" onClick={editProfile} className="p-button-secondary w-full mt-4" disabled={profileLoading}>{profile ? tr('Manage profile', 'Simamia wasifu') : tr('Create profile', 'Unda wasifu')}</button>}</section><section className="p-panel p-5"><div className="flex items-start gap-3"><ShieldCheck size={18} className="text-teal-600 shrink-0" /><div><h3 className="p-panel-title">{tr('You control what is shared', 'Unadhibiti unachoshiriki')}</h3><p className="p-panel-note mt-2">{tr('Only the profile details you enter and publish are visible. Private records stay in your workspace.', 'Ni taarifa za wasifu ulizoweka na kuchapisha pekee zinazoonekana. Rekodi binafsi zinabaki kwenye nafasi yako.')}</p></div></div></section></aside></div>
    {editing && <div className="dashboard-modal" role="dialog" aria-modal="true" aria-labelledby="business-profile-title"><button type="button" className="dashboard-modal-backdrop" onClick={() => !saving && setEditing(false)} aria-label={tr('Close form', 'Funga fomu')} /><form onSubmit={saveProfile} className="p-panel dashboard-modal-card"><div className="flex justify-between gap-3"><div><div className="p-eyebrow">{tr('BUSINESS NETWORK', 'MTANDAO WA BIASHARA')}</div><h2 id="business-profile-title" className="text-lg font-bold text-white mt-1">{tr('Business profile', 'Wasifu wa biashara')}</h2><p className="p-panel-note mt-1">{tr('These details are shared only if you choose to publish.', 'Taarifa hizi zitashirikiwa tu ukichagua kuzichapisha.')}</p></div><button type="button" className="portal-icon-button" onClick={() => setEditing(false)} aria-label={tr('Close form', 'Funga fomu')}><X size={19} /></button></div><div className="dashboard-form-grid"><label>{tr('Business name', 'Jina la biashara')}<input className="p-control" required minLength={2} maxLength={160} value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} /></label><label>{tr('Sector or products', 'Sekta au bidhaa')}<input className="p-control" maxLength={100} value={form.sector} onChange={(e) => setForm({ ...form, sector: e.target.value })} placeholder={tr('e.g. Electronics', 'mf. Vifaa vya umeme')} /></label><label>{tr('County or location', 'Kaunti au eneo')}<input className="p-control" maxLength={100} value={form.county} onChange={(e) => setForm({ ...form, county: e.target.value })} placeholder={tr('e.g. Nairobi', 'mf. Nairobi')} /></label><label>{tr('Contact email', 'Barua pepe ya mawasiliano')} <span>({tr('optional', 'si lazima')})</span><input className="p-control" type="email" maxLength={255} value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} /></label><label className="sm:col-span-2">{tr('Website', 'Tovuti')} <span>({tr('optional', 'si lazima')})</span><input className="p-control" type="url" maxLength={500} placeholder="https://..." value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} /></label><label className="sm:col-span-2">{tr('About your business', 'Kuhusu biashara yako')} <span>({tr('optional', 'si lazima')})</span><textarea className="p-control" rows={3} maxLength={600} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label></div><label className="network-consent"><input type="checkbox" checked={form.isPublished} onChange={(e) => setForm({ ...form, isPublished: e.target.checked })} /><span>{tr('Publish this profile to other signed-in BizWave businesses. I understand the information above will be visible to them.', 'Chapisha wasifu huu kwa biashara nyingine zilizoingia BizWave. Ninaelewa taarifa zilizo hapo juu zitaonekana kwao.')}</span></label><p className="p-panel-note">{tr('A sector and location are required to publish. Uncheck the box to remove your listing.', 'Sekta na eneo zinahitajika ili kuchapisha. Ondoa alama ili kuondoa wasifu wako.')}</p>{profileError && <div className="p-alert p-alert-error" role="alert"><AlertCircle size={16} />{profileError}</div>}<div className="flex justify-end gap-2"><button type="button" className="p-button-secondary" disabled={saving} onClick={() => setEditing(false)}>{tr('Cancel', 'Ghairi')}</button><button type="submit" className="p-button" disabled={saving}>{saving ? tr('Saving…', 'Inahifadhi…') : tr('Save profile', 'Hifadhi wasifu')}</button></div></form></div>}
  </div>;
};
