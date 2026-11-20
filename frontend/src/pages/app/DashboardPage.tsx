import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertCircle, ArrowRight, BarChart3, CalendarDays, CheckCircle2, CircleDollarSign, ClipboardList, FileUp, Plus, RefreshCw, Sparkles, TrendingUp, Wallet, X } from 'lucide-react';
import { apiRequest } from '../../services/api';
import { useAuth } from '../../stores/authStore';
import { KpiMetric } from '../../types';
import { formatCompactAxis, formatKesPrecise } from '../../utils/format';

const money = formatKesPrecise;

type CheckinForm = { recordDate: string; branchId: string; mpesa: string; cash: string; bank: string; expenses: string; costPercent: string; notes: string };
const emptyForm: CheckinForm = { recordDate: '', branchId: '', mpesa: '', cash: '', bank: '', expenses: '', costPercent: '', notes: '' };

export const DashboardPage: React.FC = () => {
  const { activeOrg, branches, selectedBranchId, language, hasPermission, user } = useAuth();
  const sw = language === 'sw';
  const tr = (en: string, kiswahili: string) => sw ? kiswahili : en;
  const [days, setDays] = useState(30);
  const [data, setData] = useState<any>(null);
  const [insights, setInsights] = useState<any>(null);
  const [checkin, setCheckin] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [insightError, setInsightError] = useState(false);
  const [refreshCount, setRefreshCount] = useState(0);
  const [chartMode, setChartMode] = useState<'actual' | 'forecast'>('actual');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<CheckinForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [success, setSuccess] = useState('');
  const requestNumber = useRef(0);

  useEffect(() => {
    if (!activeOrg || !hasPermission('analytics:read') || !hasPermission('sales:read')) { setLoading(false); return; }
    const id = ++requestNumber.current;
    setLoading(true); setError(''); setInsightError(false);
    const branch = encodeURIComponent(selectedBranchId);
    Promise.allSettled([
      apiRequest(`/analytics/overview?days=${days}&branchId=${branch}`),
      hasPermission('predict:sales') ? apiRequest(`/analytics/pro-insights?days=${Math.max(days, 30)}&branchId=${branch}&horizon=14`) : Promise.resolve(null),
      apiRequest(`/analytics/daily-checkin-status?branchId=${branch}`),
    ]).then(([overview, pro, daily]) => {
      if (id !== requestNumber.current) return;
      if (overview.status === 'fulfilled') setData(overview.value);
      else { setData(null); setError(overview.reason?.message || 'Unable to load your overview.'); }
      if (pro.status === 'fulfilled') setInsights(pro.value);
      else { setInsights(null); setInsightError(true); }
      if (daily.status === 'fulfilled') {
        setCheckin(daily.value);
        setForm((previous) => ({ ...previous, recordDate: daily.value.todayDate || previous.recordDate }));
      } else setCheckin(null);
      setLoading(false);
    });
    return () => { requestNumber.current++; };
  }, [activeOrg?.id, selectedBranchId, days, refreshCount]);

  const openForm = () => {
    setFormError('');
    setForm((previous) => ({ ...previous, branchId: selectedBranchId !== 'all' ? selectedBranchId : branches.length === 1 ? branches[0].id : '', recordDate: checkin?.todayDate || previous.recordDate }));
    setShowForm(true);
  };
  const submitCheckin = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.branchId) { setFormError(tr('Choose a branch for this record.', 'Chagua tawi kwa rekodi hii.')); return; }
    const values = [form.mpesa, form.cash, form.bank, form.expenses].map((v) => Number(v || 0));
    if (values.some((v) => !Number.isFinite(v) || v < 0) || values.every((v) => v === 0)) {
      setFormError(tr('Enter at least one valid sales or expense amount.', 'Weka angalau kiasi kimoja sahihi cha mauzo au matumizi.')); return;
    }
    if (form.costPercent !== '' && (!Number.isFinite(Number(form.costPercent)) || Number(form.costPercent) < 0 || Number(form.costPercent) > 100)) {
      setFormError(tr('Cost percentage must be between 0 and 100.', 'Asilimia ya gharama lazima iwe kati ya 0 na 100.')); return;
    }
    setSaving(true); setFormError(''); setSuccess('');
    try {
      await apiRequest('/analytics/daily-checkin', { method: 'POST', body: {
        recordDate: form.recordDate, branchId: form.branchId,
        mpesaSales: values[0], cashSales: values[1], cardBankSales: values[2], totalExpenses: values[3],
        ...(form.costPercent !== '' ? { cogsEstimatePct: Number(form.costPercent) } : {}), notes: form.notes,
      }});
      setShowForm(false); setForm({ ...emptyForm, recordDate: checkin?.todayDate || '' });
      setSuccess(tr('Your daily record was saved.', 'Rekodi yako ya siku imehifadhiwa.')); setRefreshCount((n) => n + 1);
    } catch (e: any) { setFormError(e.message || tr('Could not save the record.', 'Imeshindikana kuhifadhi rekodi.')); }
    finally { setSaving(false); }
  };

  if (!hasPermission('analytics:read') || !hasPermission('sales:read')) return <div className="p-panel p-7 max-w-2xl space-y-4"><div className="p-eyebrow">{tr('YOUR WORKSPACE', 'NAFASI YAKO YA KAZI')}</div><h1 className="p-title">{tr('Welcome', 'Karibu')}, {user?.firstName}</h1><p className="p-subtitle">{tr('Your workspace shows the tools available to your role. Choose an item from the navigation to get started.', 'Nafasi yako inaonyesha zana zinazopatikana kwa jukumu lako. Chagua sehemu kwenye menyu kuanza.')}</p>{hasPermission('connect:read') && <Link to="/app/connect" className="p-button-secondary">{tr('Open business network', 'Fungua mtandao wa biashara')} <ArrowRight size={15} /></Link>}</div>;

  const metrics: { label: string; metric: KpiMetric | undefined; icon: React.ElementType; note: string; count?: boolean }[] = [
    { label: tr('TOTAL REVENUE', 'JUMLA YA MAPATO'), metric: data?.kpis?.totalRevenue, icon: TrendingUp, note: tr('Recorded sales in this period', 'Mauzo yaliyorekodiwa katika kipindi hiki') },
    { label: tr('SALES RECORDS', 'REKODI ZA MAUZO'), metric: data?.kpis?.orderVolume, icon: ClipboardList, note: tr('Includes daily summary entries', 'Inajumuisha muhtasari wa kila siku'), count: true },
    ...(hasPermission('finance:read') ? [
      { label: tr('OPERATING EXPENSES', 'MATUMIZI YA UENDESHAJI'), metric: data?.kpis?.totalExpenses, icon: Wallet, note: tr('Recorded business expenses', 'Matumizi yaliyorekodiwa') },
      { label: tr('NET PROFIT', 'FAIDA HALISI'), metric: data?.kpis?.netProfit, icon: CircleDollarSign, note: data?.dataQuality?.costsEstimated ? tr('Includes your cost estimates', 'Inajumuisha makadirio ya gharama') : tr('After recorded costs and expenses', 'Baada ya gharama na matumizi') },
    ] : []),
  ];
  const revenueTrend = Array.isArray(data?.revenueTrend) ? data.revenueTrend : [];
  const forecast = Array.isArray(insights?.forecast?.series) ? insights.forecast.series.map((row: any) => ({ ...row, predicted: row.is_forecast ? row.predicted : null, band: row.lower_80 != null && row.upper_80 != null ? [Number(row.lower_80), Number(row.upper_80)] : null })) : [];
  const payments = Array.isArray(data?.paymentMix) ? data.paymentMix.filter((item: any) => Number(item.total) > 0) : [];
  const paymentTotal = payments.reduce((sum: number, item: any) => sum + Number(item.total), 0);
  const paymentName = (method: string) => ({ mpesa: 'M-Pesa', cash: tr('Cash', 'Pesa taslimu'), card: tr('Card', 'Kadi'), bank_transfer: tr('Bank transfer', 'Benki'), credit: tr('Credit', 'Mkopo') } as Record<string, string>)[method] || method.replace(/_/g, ' ');
  const needsCosts = Number(data?.dataQuality?.unknownCostRecords || 0) > 0;
  const hasForecast = forecast.some((row: any) => row.is_forecast && row.predicted != null);

  return <div className="dashboard-page">
    <header className="dashboard-page-header">
      <div className="dashboard-heading">
        <div className="p-eyebrow">{tr('BUSINESS OVERVIEW', 'MUHTASARI WA BIASHARA')} <span className="dashboard-eyebrow-divider">/</span> {activeOrg?.display_name || activeOrg?.name}</div>
        <h1 className="p-title">{tr('Your business at a glance', 'Biashara yako kwa muhtasari')}</h1>
        <p className="p-subtitle">{tr('A clear view of your sales, expenses and performance.', 'Tazama mauzo, matumizi na mwenendo wa biashara yako kwa urahisi.')}</p>
      </div>
      <div className="dashboard-toolbar">
        <div className="dashboard-periods" role="group" aria-label={tr('Choose reporting period', 'Chagua kipindi cha ripoti')}>
          {[7, 30, 60, 90].map((d) => <button type="button" key={d} aria-pressed={days === d} className={days === d ? 'active' : ''} onClick={() => setDays(d)}>{d} {tr('days', 'siku')}</button>)}
        </div>
        {hasPermission('imports:manage') && <Link to="/app/analytics?tab=imports" className="p-button-secondary"><FileUp size={15} /> {tr('Import records', 'Pakia rekodi')}</Link>}
        {hasPermission('sales:write') && <button type="button" onClick={openForm} className="p-button"><Plus size={16} /> {tr('Add daily record', 'Weka rekodi ya siku')}</button>}
      </div>
    </header>
    {success && <div className="p-alert p-alert-success" role="status"><CheckCircle2 size={17} />{success}</div>}
    {error && <div className="p-alert p-alert-error" role="alert"><AlertCircle size={17} /><div className="flex-1"><strong>{tr('We could not load your overview.', 'Imeshindikana kupakia muhtasari.')}</strong><div>{error}</div></div><button type="button" onClick={() => setRefreshCount((n) => n + 1)} className="underline font-semibold">{tr('Try again', 'Jaribu tena')}</button></div>}
    <div className="dashboard-kpis" aria-busy={loading}>
      {metrics.map(({ label, metric, icon: Icon, note, count }) => <div className="p-panel dashboard-kpi" key={label}>
        <div className="dashboard-kpi-top"><span>{label}</span><span className="dashboard-kpi-icon"><Icon size={16} /></span></div>
        {loading ? <div className="dashboard-skeleton" /> : <div className={`dashboard-kpi-value ${!metric?.available ? 'is-empty' : ''}`}>{metric?.available ? count ? Number(metric.value || 0).toLocaleString('en-KE') : money(metric.value) : '—'}</div>}
        <div className="dashboard-kpi-note">{metric?.available ? note : tr('More records needed', 'Rekodi zaidi zinahitajika')}</div>
      </div>)}
    </div>
    {needsCosts && <div className="p-alert p-alert-warning dashboard-cost-alert">
      <span className="dashboard-alert-icon"><AlertCircle size={17} /></span>
      <div className="dashboard-alert-copy">
        <div className="dashboard-alert-heading"><strong>{tr('Gross profit status', 'Hali ya faida ya jumla')}</strong><span>{tr('Cost information needed', 'Taarifa za gharama zinahitajika')}</span></div>
        <div>{tr('Some sales do not have a known cost. Profit is hidden until costs are available.', 'Baadhi ya mauzo hayana gharama inayojulikana. Faida haitonyeshwa hadi gharama zipatikane.')}</div>
      </div>
      {hasPermission('imports:read') && <Link to="/app/analytics?tab=imports" className="dashboard-alert-link">{tr('Review records', 'Kagua rekodi')} <ArrowRight size={13} /></Link>}
    </div>}
    <div className="dashboard-main-grid">
      <section className="p-panel dashboard-chart-panel">
        <div className="dashboard-panel-heading">
          <div><h2 className="p-panel-title">{chartMode === 'actual' ? tr('Daily revenue trend', 'Mwenendo wa mapato ya kila siku') : tr('Sales forecast', 'Utabiri wa mauzo')}</h2><p className="p-panel-note mt-1">{chartMode === 'actual' ? tr('Sales recorded by day', 'Mauzo yaliyorekodiwa kwa siku') : tr('A rough estimate after the last recorded day. Missing days count as zero; the range is not a guarantee.', 'Makadirio baada ya siku ya mwisho iliyorekodiwa. Siku zisizo na rekodi ni sifuri; si uhakika.')}</p></div>
          <div className="dashboard-chart-toggle"><button type="button" className={chartMode === 'actual' ? 'active' : ''} aria-pressed={chartMode === 'actual'} onClick={() => setChartMode('actual')}>{tr('Actual', 'Halisi')}</button>{hasPermission('predict:sales') && <button type="button" className={chartMode === 'forecast' ? 'active' : ''} aria-pressed={chartMode === 'forecast'} onClick={() => setChartMode('forecast')}>{tr('Forecast', 'Utabiri')}</button>}</div>
        </div>
        {loading ? <div className="dashboard-chart-placeholder animate-pulse" role="status" aria-label={tr('Loading revenue', 'Inapakia mapato')} /> : (chartMode === 'actual' ? revenueTrend.length > 0 : hasForecast) ? <div className="dashboard-chart" role="img" aria-label={chartMode === 'actual' ? tr('Daily recorded revenue for the selected period', 'Mapato ya kila siku kwa kipindi kilichochaguliwa') : tr('Recorded revenue and forecast, with an approximate estimate range', 'Mapato halisi na utabiri pamoja na wigo wa makadirio')}>
          <ResponsiveContainer width="100%" height="100%"><AreaChart data={chartMode === 'actual' ? revenueTrend : forecast} margin={{ top: 16, right: 8, left: 2, bottom: 0 }}>
            <defs>
              <linearGradient id="overviewRevenue" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#57e9ff" stopOpacity={.64} /><stop offset="95%" stopColor="#25a4ee" stopOpacity={.05} /></linearGradient>
              <linearGradient id="overviewBand" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#55dbff" stopOpacity={.34} /><stop offset="100%" stopColor="#55dbff" stopOpacity={.08} /></linearGradient>
            </defs>
            <CartesianGrid stroke="#6089ad" strokeDasharray="2 5" />
            <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#b1cee5' }} tickFormatter={(v) => String(v).slice(5)} minTickGap={25} />
            <YAxis axisLine={false} tickLine={false} width={45} tick={{ fontSize: 10, fill: '#b1cee5' }} tickFormatter={formatCompactAxis} />
            <Tooltip formatter={(value: any, name: any) => Array.isArray(value) ? [`${money(value[0])} – ${money(value[1])}`, tr('Estimate range', 'Wigo wa makadirio')] : [money(value), name]} labelStyle={{ color: '#e6f6ff' }} />
            {chartMode === 'forecast' && <Area isAnimationActive={false} type="monotone" dataKey="band" name={tr('Estimate range', 'Wigo wa makadirio')} stroke="none" fill="url(#overviewBand)" />}
            {chartMode === 'actual' ? <Area isAnimationActive={false} type="monotone" dataKey="revenue" name={tr('Revenue', 'Mapato')} stroke="#9cf5ff" strokeWidth={2.6} fill="url(#overviewRevenue)" /> : <>
              <Area isAnimationActive={false} type="monotone" dataKey="actual" name={tr('Actual', 'Halisi')} stroke="#a6f7ff" strokeWidth={2.4} fill="none" />
              <Area isAnimationActive={false} type="monotone" dataKey="predicted" name={tr('Forecast', 'Utabiri')} stroke="#69ddff" strokeWidth={2.2} strokeDasharray="5 4" fill="none" dot={{ r: 2, fill: '#9df8ff', strokeWidth: 0 }} />
            </>}
          </AreaChart></ResponsiveContainer>
        </div> : <div className="dashboard-empty-chart"><BarChart3 size={25} /><strong>{chartMode === 'actual' ? tr('No sales for this period', 'Hakuna mauzo katika kipindi hiki') : tr('Not enough data for a forecast', 'Data haitoshi kwa utabiri')}</strong><p>{chartMode === 'actual' ? tr('Add a daily record or import sales to see your trend.', 'Weka rekodi ya siku au pakia mauzo kuona mwenendo.') : insightError ? tr('Forecasts are temporarily unavailable. Try again later.', 'Utabiri haupatikani kwa sasa. Jaribu tena baadaye.') : tr('Add at least three days of sales to start a forecast.', 'Weka mauzo ya angalau siku tatu ili kuanza utabiri.')}</p></div>}
        <div className="dashboard-chart-footer">
          <div className="dashboard-legend"><span><i className="dashboard-legend-dot" />{tr('Recorded revenue', 'Mapato yaliyorekodiwa')}</span>{chartMode === 'forecast' && <><span><i className="dashboard-legend-forecast" />{tr('Forecast', 'Utabiri')}</span><span><i className="dashboard-legend-range" />{tr('Estimate range', 'Wigo wa makadirio')}</span></>}</div>
          {chartMode === 'forecast' && hasForecast ? <span>{forecast.find((row: any) => row.is_forecast)?.date} — {forecast.filter((row: any) => row.is_forecast).slice(-1)[0]?.date}</span> : data?.period && <span>{data.period.startDate} — {data.period.endDate}</span>}
        </div>
      </section>
      <section className="p-panel dashboard-payment-panel">
        <div className="dashboard-panel-heading"><div><h2 className="p-panel-title">{tr('Payment channels', 'Njia za malipo')}</h2><p className="p-panel-note mt-1">{tr('Share of recorded payments', 'Mgawanyo wa malipo yaliyorekodiwa')}</p></div><span className="dashboard-kpi-icon"><Wallet size={16} /></span></div>
        {loading ? <div className="dashboard-chart-placeholder animate-pulse" /> : payments.length ? <div className="dashboard-payment-list">{payments.map((p: any, index: number) => <div className="dashboard-payment" key={p.method}>
          <div className="flex justify-between items-center gap-2"><strong>{paymentName(p.method)}</strong><span>{paymentTotal ? (Number(p.total) / paymentTotal * 100).toFixed(1) : '0.0'}%</span></div>
          <div className="dashboard-payment-track"><i style={{ width: `${paymentTotal ? Number(p.total) / paymentTotal * 100 : 0}%`, background: index === 0 ? '#69e9fb' : index === 1 ? '#74b9ff' : '#ad9efa' }} /></div>
          <div className="flex justify-between gap-2 dashboard-payment-meta"><span>{Number(p.count).toLocaleString()} {tr('payments', 'malipo')}</span><span>{money(p.total)}</span></div>
        </div>)}</div> : <div className="dashboard-payment-empty"><Wallet size={24} /><p>{tr('Payment channels will appear once payment methods are recorded.', 'Njia za malipo zitaonekana baada ya kurekodiwa.')}</p></div>}
      </section>
    </div>
    <div className="dashboard-bottom-grid"><section className="p-panel dashboard-lower-card"><div className="dashboard-lower-icon"><CalendarDays size={18} /></div><div className="flex-1"><div className="p-panel-title">{tr('Keep your records up to date', 'Sasisha rekodi zako')}</div><p className="p-panel-note mt-1">{checkin?.todayLogged ? tr('Sales have been recorded today. You can add another entry.', 'Mauzo yamewekwa leo. Unaweza kuongeza rekodi nyingine.') : tr('Add today’s sales and expenses to keep your overview current.', 'Weka mauzo na matumizi ya leo ili muhtasari uwe sahihi.')}</p>{checkin?.streakDays > 0 && <div className="dashboard-pill">{checkin.streakDays} {tr('day recording streak', 'siku mfululizo za kurekodi')}</div>}</div>{hasPermission('sales:write') && <button type="button" onClick={openForm} className="p-button-secondary">{tr('Add record', 'Weka rekodi')} <ArrowRight size={14} /></button>}</section><section className="p-panel dashboard-lower-card"><div className="dashboard-lower-icon violet"><Sparkles size={18} /></div><div className="flex-1"><div className="p-panel-title">{tr('Need a clearer answer?', 'Unahitaji maelezo zaidi?')}</div><p className="p-panel-note mt-1">{tr('Ask about your business in English or Kiswahili.', 'Uliza kuhusu biashara yako kwa Kiingereza au Kiswahili.')}</p></div>{hasPermission('ai:use') && <Link to="/app/ai" className="p-button-secondary">{tr('Ask assistant', 'Uliza msaidizi')} <ArrowRight size={14} /></Link>}</section></div>
    {data?.topProducts?.length > 0 && <section className="p-panel p-5"><div className="flex items-center justify-between gap-3 mb-4"><div><h2 className="p-panel-title">{tr('Top products', 'Bidhaa zinazoongoza')}</h2><p className="p-panel-note mt-1">{tr('Based on itemised sales in this period', 'Kulingana na mauzo ya bidhaa katika kipindi hiki')}</p></div><Link className="text-xs font-semibold text-teal-600" to="/app/analytics?tab=sales">{tr('View sales', 'Tazama mauzo')} →</Link></div><div className="overflow-x-auto"><table className="dashboard-table"><thead><tr><th>{tr('PRODUCT', 'BIDHAA')}</th><th>{tr('UNITS', 'IDADI')}</th><th>{tr('REVENUE', 'MAPATO')}</th></tr></thead><tbody>{data.topProducts.slice(0, 5).map((p: any) => <tr key={p.id}><td><strong>{p.name}</strong><small>{p.category}</small></td><td>{Number(p.units_sold).toLocaleString()}</td><td>{money(p.revenue)}</td></tr>)}</tbody></table></div></section>}
    {showForm && <div className="dashboard-modal" role="dialog" aria-modal="true" aria-labelledby="checkin-title"><button type="button" className="dashboard-modal-backdrop" onClick={() => !saving && setShowForm(false)} aria-label={tr('Close form', 'Funga fomu')} /><form onSubmit={submitCheckin} className="p-panel dashboard-modal-card"><div className="flex justify-between items-start gap-4"><div><div className="p-eyebrow">{tr('DAILY RECORD', 'REKODI YA SIKU')}</div><h2 id="checkin-title" className="text-lg font-bold text-white mt-1">{tr('Add a daily record', 'Weka rekodi ya siku')}</h2><p className="p-panel-note mt-1">{tr('Enter the totals you know. Leave unknown costs blank.', 'Weka jumla unazojua. Acha gharama usizojua wazi.')}</p></div><button type="button" className="portal-icon-button" disabled={saving} onClick={() => setShowForm(false)} aria-label={tr('Close form', 'Funga fomu')}><X size={19} /></button></div><div className="dashboard-form-grid"><label>{tr('Date', 'Tarehe')}<input className="p-control" type="date" value={form.recordDate} required onChange={(e) => setForm({ ...form, recordDate: e.target.value })} /></label><label>{tr('Branch', 'Tawi')}<select className="p-control" value={form.branchId} required onChange={(e) => setForm({ ...form, branchId: e.target.value })}><option value="">{tr('Select a branch', 'Chagua tawi')}</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>{([['mpesa','M-Pesa sales','Mauzo ya M-Pesa'], ['cash','Cash sales','Mauzo ya taslimu'], ['bank','Card / bank sales','Mauzo ya kadi / benki'], ['expenses','Operating expenses','Matumizi ya uendeshaji']] as const).filter(([key]) => key !== 'expenses' || hasPermission('finance:write')).map(([key, en, swText]) => <label key={key}>{tr(en, swText)} <span>(KES)</span><input className="p-control" type="number" min="0" step="0.01" placeholder="0.00" value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} /></label>)}<label>{tr('Estimated cost of goods', 'Makadirio ya gharama ya bidhaa')} <span>({tr('optional', 'si lazima')} %)</span><input className="p-control" type="number" min="0" max="100" step="0.01" placeholder={tr('Leave blank if unknown', 'Acha wazi kama hujui')} value={form.costPercent} onChange={(e) => setForm({ ...form, costPercent: e.target.value })} /></label><label>{tr('Notes', 'Maelezo')} <span>({tr('optional', 'si lazima')})</span><input className="p-control" maxLength={240} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder={tr('Add a note', 'Ongeza maelezo')} /></label></div>{formError && <div className="p-alert p-alert-error" role="alert"><AlertCircle size={16} />{formError}</div>}<div className="flex justify-end gap-2"><button type="button" className="p-button-secondary" disabled={saving} onClick={() => setShowForm(false)}>{tr('Cancel', 'Ghairi')}</button><button type="submit" className="p-button" disabled={saving}>{saving && <RefreshCw size={14} className="animate-spin" />}{saving ? tr('Saving…', 'Inahifadhi…') : tr('Save record', 'Hifadhi rekodi')}</button></div></form></div>}
  </div>;
};
