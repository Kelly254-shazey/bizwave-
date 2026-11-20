import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AlertTriangle, Award, Lock, Play, ShieldAlert, TrendingUp, Users } from 'lucide-react';
import { apiRequest } from '../../services/api';
import { useAuth } from '../../stores/authStore';
import { formatKes } from '../../i18n/translations';
import { formatCompactAxis, formatKesPrecise } from '../../utils/format';


export const PredictPage: React.FC = () => {
  const { activeOrg, selectedBranchId, hasPermission, hasFeature, language } = useAuth();
  const tr = (en: string, sw: string) => language === 'sw' ? sw : en;
  const [forecastType, setForecastType] = useState<'sales' | 'demand' | 'cashflow'>(() => hasPermission('predict:sales') ? 'sales' : hasPermission('predict:demand') ? 'demand' : 'cashflow');
  const [horizonDays, setHorizonDays] = useState(30);
  const [startingCashBalance, setStartingCashBalance] = useState('');
  const [products, setProducts] = useState<any[]>([]);
  const [selectedProductId, setSelectedProductId] = useState('');

  const [activeRun, setActiveRun] = useState<any | null>(null);
  const [proBenchmark, setProBenchmark] = useState<any | null>(null);
  const [runHistory, setRunHistory] = useState<any[]>([]);
  const [anomalies, setAnomalies] = useState<any[]>([]);
  const [stockAlerts, setStockAlerts] = useState<any[]>([]);
  const [rfm, setRfm] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [forecastError, setForecastError] = useState(false);
  const [forecastLoading, setForecastLoading] = useState(true);
  const loadNumber = useRef(0);

  const canPredictBasic = hasFeature('predict_basic');
  const canPredictAdv = hasFeature('predict_advanced');

  const loadExisting = async (selectLatest = false) => {
    if (!canPredictBasic) { setForecastLoading(false); return; }
    const request = ++loadNumber.current;
    setForecastLoading(true); setForecastError(false);
    try {
      const [fcRes, invRes, proResult] = await Promise.all([
        apiRequest(`/forecasts?branchId=${encodeURIComponent(selectedBranchId)}`),
        hasPermission('inventory:read') ? apiRequest(`/inventory?branchId=${encodeURIComponent(selectedBranchId)}`) : Promise.resolve({ inventory: [] }),
        hasPermission('analytics:read') && hasPermission('sales:read') && hasPermission('predict:sales')
          ? apiRequest(`/analytics/pro-insights?days=45&branchId=${encodeURIComponent(selectedBranchId)}&horizon=14`)
              .then((data) => ({ data, failed: false })).catch(() => ({ data: null, failed: true }))
          : Promise.resolve({ data: null, failed: false }),
      ]);
      if (request !== loadNumber.current) return;
      setRunHistory(fcRes.forecastRuns || []);
      setAnomalies(fcRes.anomalies || []);
      setStockAlerts(fcRes.stockAlerts || []);
      setProBenchmark(proResult.data); setForecastError(proResult.failed);
      const uniqueProds: any[] = Array.from(new Map((invRes.inventory || []).map((i: any) => [i.product_id, i])).values());
      setProducts(uniqueProds);
      setSelectedProductId((previous) => uniqueProds.some((p) => p.product_id === previous) ? previous : (uniqueProds[0]?.product_id || ''));
      if (selectLatest && fcRes.forecastRuns?.[0]) {
        const detail = await apiRequest(`/forecasts/${fcRes.forecastRuns[0].id}`);
        if (request === loadNumber.current) setActiveRun(detail);
      }
    } catch (e: any) {
      if (request === loadNumber.current) { setError(e.message || 'Could not load forecasts.'); setForecastError(true); }
    } finally {
      if (request === loadNumber.current) setForecastLoading(false);
    }
  };

  useEffect(() => {
    setActiveRun(null); setProBenchmark(null); setRunHistory([]); setAnomalies([]); setStockAlerts([]); setRfm(null); setError('');
    loadExisting(true);
    return () => { loadNumber.current++; };
  }, [activeOrg?.id, selectedBranchId]);

  const handleRunForecast = async () => {
    if (forecastType === 'cashflow' && (startingCashBalance.trim() === '' || !Number.isFinite(Number(startingCashBalance)))) { setError(tr('Enter your current cash balance first.', 'Weka salio lako la sasa kwanza.')); return; }
    setBusy(true);
    setError('');
    try {
      const res = await apiRequest('/forecasts', {
        method: 'POST',
        body: {
          forecastType,
          horizonDays,
          branchId: selectedBranchId,
          productId: forecastType === 'demand' ? selectedProductId : undefined,
          startingCashBalance: forecastType === 'cashflow' ? Number(startingCashBalance) : undefined,
        },
      });
      setActiveRun(res);
      await loadExisting();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const handleScanAnomalies = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await apiRequest(`/forecasts/anomalies/scan?branchId=${encodeURIComponent(selectedBranchId)}`, {
        method: 'POST',
      });
      setAnomalies(res.anomalies || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const handleRunRfm = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await apiRequest('/forecasts/segmentation/rfm');
      setRfm(res);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (!canPredictBasic) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-8 max-w-xl mx-auto text-center space-y-3">
        <Lock className="w-10 h-10 text-amber-500 mx-auto" />
        <h1 className="text-xl font-bold text-navy-950">BizWave Predict Requires Growth or Higher</h1>
        <p className="text-sm text-slate-600">
          Your organization is currently on the <strong>{activeOrg?.plan_code.toUpperCase()}</strong> plan. Forecasting is not enabled for this plan. Online plan changes are not available yet; contact your administrator.
        </p>
        <Link to="/app/billing" className="inline-block mt-2 px-5 py-2.5 rounded-xl bg-navy-950 text-white text-sm font-semibold">
          View plan details
        </Link>
      </div>
    );
  }

  const forecastSeries = Array.isArray(proBenchmark?.forecast?.series) ? proBenchmark.forecast.series : [];
  const futurePoints = forecastSeries.filter((p: any) => p.is_forecast && p.predicted != null);
  const trendSlope = proBenchmark?.summary?.trend_slope_kes_day;
  const hasTrend = Number(proBenchmark?.recorded_days) >= 4 && trendSlope != null && Number.isFinite(Number(trendSlope));
  const recordedDays = proBenchmark?.recorded_days;
  const canReadSalesHistory = hasPermission('analytics:read') && hasPermission('sales:read');

  return (
    <div className="predict-page">
      <header className="predict-page-header">
        <div>
          <div className="p-eyebrow">{tr('BIZWAVE PREDICT', 'UTABIRI WA BIZWAVE')}</div>
          <h1 className="p-title">{tr('Plan for what’s next', 'Panga yajayo')}</h1>
          <p className="p-subtitle">{tr('Use your sales history to explore the 14 days after your most recent record.', 'Tumia historia ya mauzo kuona makadirio ya siku 14 baada ya rekodi yako ya mwisho.')}</p>
        </div>
        {hasPermission('predict:sales') && <div className="predict-horizon"><TrendingUp size={14} />{tr('14-day sales outlook', 'Makadirio ya mauzo ya siku 14')}</div>}
      </header>

      {hasPermission('predict:sales') && <>
      <div className="predict-kpis" aria-busy={forecastLoading}>
        <div className="p-panel dashboard-kpi"><div className="dashboard-kpi-top"><span>{tr('PROJECTED 14-DAY REVENUE', 'MAKADIRIO YA MAPATO SIKU 14')}</span><span className="dashboard-kpi-icon"><TrendingUp size={16} /></span></div>{forecastLoading ? <div className="dashboard-skeleton" /> : <div className={`dashboard-kpi-value ${futurePoints.length ? '' : 'is-empty'}`}>{futurePoints.length ? formatKesPrecise(proBenchmark.forecast.projected_14d_revenue) : '—'}</div>}<div className="dashboard-kpi-note">{tr('Estimate, not guaranteed revenue', 'Makadirio, si mapato ya uhakika')}</div></div>
        <div className="p-panel dashboard-kpi"><div className="dashboard-kpi-top"><span>{tr('RECENT TREND', 'MWENENDO WA HIVI KARIBUNI')}</span><span className="dashboard-kpi-icon"><TrendingUp size={16} /></span></div>{forecastLoading ? <div className="dashboard-skeleton" /> : <div className={`dashboard-kpi-value ${hasTrend ? '' : 'is-empty'}`}>{hasTrend ? Number(trendSlope) > 0 ? tr('Upward', 'Unaongezeka') : Number(trendSlope) < 0 ? tr('Downward', 'Unapungua') : tr('Steady', 'Hautofautiani') : '—'}</div>}<div className="dashboard-kpi-note">{tr('Based on recorded daily sales', 'Kulingana na mauzo yaliyorekodiwa')}</div></div>
        <div className="p-panel dashboard-kpi"><div className="dashboard-kpi-top"><span>{tr('RECORDED SALES DAYS', 'SIKU ZENYE MAUZO')}</span><span className="dashboard-kpi-icon"><Award size={16} /></span></div>{forecastLoading ? <div className="dashboard-skeleton" /> : <div className={`dashboard-kpi-value ${recordedDays == null ? 'is-empty' : ''}`}>{recordedDays != null && Number.isFinite(Number(recordedDays)) ? Number(recordedDays).toLocaleString('en-KE') : '—'}</div>}<div className="dashboard-kpi-note">{tr('Days available to the model', 'Siku zinazopatikana kwa utabiri')}</div></div>
      </div>
      <section className="p-panel dashboard-chart-panel predict-chart-panel">
        <div className="dashboard-panel-heading"><div><h2 className="p-panel-title">{tr('Sales forecast & estimate range', 'Utabiri wa mauzo na wigo wa makadirio')}</h2><p className="p-panel-note mt-1">{tr('The shaded area is an approximate range, not a validated probability. Missing days are treated as zero; forecasts can be wrong.', 'Eneo lenye kivuli ni wigo wa makadirio, si uwezekano uliothibitishwa. Siku zisizo na rekodi huhesabiwa kama sifuri; utabiri unaweza kukosea.')}</p></div></div>
        {forecastLoading ? <div className="dashboard-chart-placeholder animate-pulse" role="status" aria-label={tr('Loading forecast', 'Inapakia utabiri')} /> : futurePoints.length ? <div className="predict-chart" role="img" aria-label={tr('Recorded sales and a 14-day forecast with an approximate estimate range', 'Mauzo yaliyorekodiwa na utabiri wa siku 14 wenye wigo wa makadirio')}>
          <ResponsiveContainer width="100%" height="100%"><AreaChart data={forecastSeries.map((d: any) => ({ ...d, predicted: d.is_forecast ? d.predicted : null, band: d.lower_80 != null && d.upper_80 != null ? [Number(d.lower_80), Number(d.upper_80)] : null }))} margin={{ top: 20, right: 10, left: 2, bottom: 0 }}>
            <defs><linearGradient id="predictionRange" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#55dbff" stopOpacity={0.40} /><stop offset="100%" stopColor="#55dbff" stopOpacity={0.08} /></linearGradient></defs>
            <CartesianGrid stroke="#6089ad" strokeDasharray="2 5" />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#b1cee5' }} tickFormatter={(v) => String(v).slice(5)} axisLine={false} tickLine={false} minTickGap={28} />
            <YAxis tick={{ fontSize: 10, fill: '#b1cee5' }} axisLine={false} tickLine={false} tickFormatter={formatCompactAxis} width={50} />
            <Tooltip formatter={(value: any, name: any) => Array.isArray(value) ? [`${formatKesPrecise(value[0])} – ${formatKesPrecise(value[1])}`, tr('Estimate range', 'Wigo wa makadirio')] : [formatKesPrecise(value), name]} />
            <Area isAnimationActive={false} type="monotone" dataKey="band" name={tr('Estimate range', 'Wigo wa makadirio')} stroke="none" fill="url(#predictionRange)" />
            <Area isAnimationActive={false} type="monotone" dataKey="actual" name={tr('Recorded sales', 'Mauzo halisi')} stroke="#a6f7ff" strokeWidth={2.5} fill="none" />
            <Area isAnimationActive={false} type="monotone" dataKey="predicted" name={tr('Forecast', 'Utabiri')} stroke="#69ddff" strokeWidth={2.2} strokeDasharray="5 4" fill="none" dot={{ r: 2.5, fill: '#9df8ff', strokeWidth: 0 }} />
          </AreaChart></ResponsiveContainer>
        </div> : <div className="dashboard-empty-chart"><TrendingUp size={25} /><strong>{canReadSalesHistory ? tr('Your forecast starts with sales records', 'Utabiri huanza kwa rekodi za mauzo') : tr('Sales history is unavailable to your role', 'Jukumu lako haliruhusu kuona historia ya mauzo')}</strong><p>{!canReadSalesHistory ? tr('Ask your administrator about access to sales analytics.', 'Uliza msimamizi wako kuhusu ruhusa ya kuona uchambuzi wa mauzo.') : forecastError || error ? tr('Forecast data could not be loaded. Please try again.', 'Imeshindikana kupakia utabiri. Jaribu tena.') : tr('Record at least three days of sales or import your history to see a forecast.', 'Rekodi mauzo ya angalau siku tatu au pakia historia kuona utabiri.')}</p>{canReadSalesHistory && hasPermission('imports:read') && <Link to="/app/analytics?tab=imports" className="p-button-secondary">{tr('Import records', 'Pakia rekodi')}</Link>}</div>}
        <div className="dashboard-chart-footer"><div className="dashboard-legend"><span><i className="dashboard-legend-dot" />{tr('Recorded sales', 'Mauzo halisi')}</span><span><i className="dashboard-legend-forecast" />{tr('Forecast', 'Utabiri')}</span><span><i className="dashboard-legend-range" />{tr('Estimate range', 'Wigo wa makadirio')}</span></div><span>{futurePoints.length ? `${futurePoints[0].date} — ${futurePoints[futurePoints.length - 1].date}` : tr('14-day view', 'Mwonekano wa siku 14')}</span></div>
      </section>

      {/* Pro Data Scientist Multi-Model Champion Benchmark Panel */}
      {proBenchmark?.forecast?.model_benchmarks?.length > 0 && (
        <details className="p-panel predict-details"><summary>{tr('See how the forecast was selected', 'Angalia jinsi utabiri ulivyochaguliwa')}</summary>
        <div className="bg-[#041527] text-white rounded-2xl p-5 border border-[#2ED3C2]/25 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-[#2ED3C2] flex items-center gap-1.5">
                <Award className="w-3.5 h-3.5" /> {tr('Model selection', 'Uchaguzi wa modeli')}
              </div>
              <h2 className="text-base font-extrabold text-white mt-0.5">
                {proBenchmark.forecast.champion_model}
              </h2>
            </div>
            <div className="flex flex-wrap gap-3 text-xs">
              <div className="px-3 py-1.5 rounded-xl bg-white/10">
                <span className="text-slate-300">14d Projection:</span>{' '}
                <strong className="text-[#2ED3C2]">{formatKes(proBenchmark.forecast.projected_14d_revenue)}</strong>
              </div>
              <div className="px-3 py-1.5 rounded-xl bg-white/10">
                <span className="text-slate-300">30d Projection:</span>{' '}
                <strong className="text-white">{formatKes(proBenchmark.forecast.projected_30d_revenue)}</strong>
              </div>
              <div className="px-3 py-1.5 rounded-xl bg-white/10">
                <span className="text-slate-300">{tr('Daily break-even:', 'Kiwango cha kutopata hasara:')}</span>{' '}
                <strong className="text-white">{formatKes(proBenchmark.summary?.breakeven_daily_revenue)}</strong>
              </div>
            </div>
          </div>

          <p className="text-xs text-slate-300">{proBenchmark.forecast.has_holdout ? tr('These errors are from the same small holdout used to select the model; they are not an independent accuracy test.', 'Makosa haya yanatokana na data ndogo iliyotumika kuchagua modeli; si kipimo huru cha usahihi.') : tr('There is not enough history for a holdout test yet.', 'Bado hakuna historia ya kutosha kufanya jaribio.')}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {proBenchmark.forecast.model_benchmarks.map((m: any) => (
              <div
                key={m.model}
                className={`p-3.5 rounded-xl border ${
                  m.selected ? 'bg-[#2ED3C2]/15 border-[#2ED3C2]' : 'bg-white/5 border-white/10'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-white">{m.model}</span>
                  {m.selected && (
                    <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-[#2ED3C2] text-[#041527]">
                      CHAMPION
                    </span>
                  )}
                </div>
                <div className="mt-2 text-lg font-extrabold text-[#2ED3C2]">{m.mape_pct != null ? `${m.mape_pct}% MAPE` : tr('Not tested', 'Haijajaribiwa')}</div>
                <div className="text-[11px] text-slate-300 mt-0.5">
                  {m.rmse_kes != null ? `RMSE: ${formatKes(m.rmse_kes)}` : tr('More history needed', 'Historia zaidi inahitajika')}
                </div>
              </div>
            ))}
          </div>
        </div>
        </details>
      )}

      </>}

      {/* Forecast Control Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-wrap items-end gap-4">
        <div>
          <label className="block text-[11px] font-semibold text-slate-600 mb-1">{tr('Forecast type', 'Aina ya utabiri')}</label>
          <select
            value={forecastType}
            onChange={(e) => setForecastType(e.target.value as any)}
            className="px-3 py-2 text-xs font-semibold border border-slate-200 rounded-lg bg-white"
          >
            {hasPermission('predict:sales') && <option value="sales">{tr('Sales', 'Mauzo')}</option>}
            {hasPermission('predict:demand') && <option value="demand">{tr('Product demand', 'Mahitaji ya bidhaa')}</option>}
            {hasPermission('predict:cashflow') && (
              <option value="cashflow" disabled={!canPredictAdv}>
                {tr('Cash-flow estimate', 'Makadirio ya mtiririko wa fedha')} {!canPredictAdv ? tr('(Intelligence plan)', '(Mpango wa Intelligence)') : ''}
              </option>
            )}
          </select>
        </div>

        {forecastType === 'demand' && products.length > 0 && (
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">{tr('Product', 'Bidhaa')}</label>
            <select
              value={selectedProductId}
              onChange={(e) => setSelectedProductId(e.target.value)}
              className="px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white"
            >
              {products.map((p: any) => (
                <option key={p.product_id} value={p.product_id}>
                  {p.product_name} ({p.sku})
                </option>
              ))}
            </select>
          </div>
        )}

        {forecastType === 'cashflow' && <div className="max-w-md">
          <label htmlFor="starting-cash" className="block text-[11px] font-semibold text-slate-600 mb-1">{tr('Current whole-business cash balance (KES)', 'Salio la sasa la biashara nzima (KES)')}</label>
          <input id="starting-cash" type="number" step="0.01" value={startingCashBalance} onChange={(e) => setStartingCashBalance(e.target.value)} className="px-3 py-2 text-xs border border-slate-200 rounded-lg" />
          <p className="text-[11px] text-slate-500 mt-1">{tr('Enter the actual current balance. Estimates use reconciled cash records and may overlap with invoices; overdue items are excluded.', 'Weka salio halisi la sasa. Makadirio hutumia miamala iliyolinganishwa na yanaweza kuingiliana na ankara; madeni yaliyochelewa hayajumuishwi.')}</p>
        </div>}
        <div>
          <label className="block text-[11px] font-semibold text-slate-600 mb-1">{tr('Period', 'Kipindi')}</label>
          <select
            value={horizonDays}
            onChange={(e) => setHorizonDays(Number(e.target.value))}
            className="px-3 py-2 text-xs font-semibold border border-slate-200 rounded-lg bg-white"
          >
            <option value={14}>{tr('14 days', 'Siku 14')}</option>
            <option value={30}>{tr('30 days', 'Siku 30')}</option>
            <option value={60}>{tr('60 days', 'Siku 60')}</option>
          </select>
        </div>

        <button
          type="button"
          disabled={busy}
          onClick={handleRunForecast}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-navy-950 text-white text-xs font-semibold hover:bg-navy-800 disabled:opacity-50"
        >
          <Play className="w-3.5 h-3.5" />
          {busy ? tr('Calculating…', 'Inakokotoa…') : tr('Generate forecast', 'Tengeneza utabiri')}
        </button>
      </div>

      {error && <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">{error}</div>}

      {/* Active Forecast Visualization */}
      {activeRun && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-teal-600">
                  {activeRun.run.forecast_type} Forecast · {activeRun.run.horizon_days} Days
                </span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                    activeRun.run.status === 'completed'
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {activeRun.run.status}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500">{activeRun.run.status_message}</p>
            </div>
            <div className="min-w-0 text-left text-xs sm:text-right">
              <div className="font-semibold text-navy-950 break-words">Model: <code>{activeRun.run.selected_algorithm}</code></div>
              {activeRun.run.evaluation_metrics?.selected_model?.mape !== undefined && (
                <div className="text-slate-500">
                  Backtest MAPE: <strong>{activeRun.run.evaluation_metrics.selected_model.mape}%</strong> (Baseline:{' '}
                  {activeRun.run.evaluation_metrics.baseline_seasonal_naive?.mape}%)
                </div>
              )}
            </div>
          </div>

          {activeRun.run.forecast_type === 'cashflow' && activeRun.run.summary?.cashflow_provenance !== 'user_balance_and_reconciled_movements_v1' && <div className="p-3 rounded-lg bg-amber-50 text-amber-900 text-xs">{tr('This older estimate may use an opening balance rather than your current balance. Generate a new estimate before relying on it.', 'Makadirio haya ya zamani yanaweza kutumia salio la mwanzo badala ya salio la sasa. Tengeneza makadirio mapya kabla ya kuyatumia.')}</div>}
          {activeRun.run.status === 'insufficient_data' ? (
            <div className="p-5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-sm flex items-start gap-3">
              <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5" />
              <div>
                <div className="font-bold">Insufficient Historical Data — No Fabricated Prediction</div>
                <p className="text-xs mt-1">{activeRun.run.status_message}</p>
              </div>
            </div>
          ) : (
            <>
              {/* Summary Metrics */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {(activeRun.run.forecast_type === 'cashflow'
                  ? ['opening_cash_balance', 'projected_ending_balance', 'lowest_projected_balance', 'confirmed_obligations_total'].filter((key) => activeRun.run.summary?.[key] != null).map((key) => [key, activeRun.run.summary[key]])
                  : Object.entries(activeRun.run.summary || {}).filter(([key]) => !key.includes('provenance')).slice(0, 4)).map(([k, v]: any) => (
                  <div key={k} className="min-w-0 p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
                    <div className="text-[10px] uppercase tracking-wider text-slate-500 break-words">{k.replace(/_/g, ' ')}</div>
                    <div className="mt-1 text-base font-bold text-navy-950 break-words">
                      {typeof v === 'number' && !k.includes('days') && !k.includes('pct') && !k.includes('demand') && !k.includes('stock') && !k.includes('reorder')
                        ? formatKes(v)
                        : String(v)}
                    </div>
                  </div>
                ))}
              </div>

              {/* Shade the returned lower-to-upper estimate without inventing missing bounds. */}
              <div className="predict-run-chart" role="img" aria-label={tr('Forecast values and estimate range', 'Thamani za utabiri na wigo wa makadirio')}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={(activeRun.values || []).map((v: any) => ({
                      date: String(v.target_date).slice(5, 10),
                      predicted: v.predicted_value == null ? null : Number(v.predicted_value),
                      band: v.lower_bound != null && v.upper_bound != null ? [Number(v.lower_bound), Number(v.upper_bound)] : null,
                    }))}
                    margin={{ top: 12, right: 12, left: 0, bottom: 2 }}
                  >
                    <defs><linearGradient id="runEstimateRange" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#55dbff" stopOpacity={0.36} /><stop offset="100%" stopColor="#55dbff" stopOpacity={0.08} /></linearGradient></defs>
                    <CartesianGrid strokeDasharray="2 5" stroke="#6089ad" />
                    <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#b1cee5' }} minTickGap={24} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#b1cee5' }} tickFormatter={formatCompactAxis} width={48} />
                    <Tooltip formatter={(value: any, name: any) => [Array.isArray(value) ? value.map((v) => Number(v).toLocaleString('en-KE')).join(' – ') : Number(value).toLocaleString('en-KE'), name]} />
                    <Area isAnimationActive={false} type="monotone" dataKey="band" name={tr('Estimate range', 'Wigo wa makadirio')} stroke="none" fill="url(#runEstimateRange)" />
                    <Area isAnimationActive={false} type="monotone" dataKey="predicted" name={tr('Forecast', 'Utabiri')} stroke="#8ef0ff" fill="none" strokeWidth={2.4} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* Prediction Explanations */}
              {activeRun.explanations?.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {activeRun.explanations.map((ex: any, i: number) => (
                    <div key={i} className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/70 text-xs">
                      <div className="font-semibold text-navy-950 capitalize">{ex.feature_name.replace(/_/g, ' ')}</div>
                      <p className="mt-1 text-slate-600">{ex.explanation_text}</p>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Anomalies & Stock Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
          <h2 className="text-sm font-bold text-navy-950 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600" /> Detected Anomalies ({anomalies.length})
          </h2>
          {anomalies.length > 0 ? (
            anomalies.slice(0, 6).map((a: any, i: number) => (
              <div key={a.id || i} className="p-3.5 rounded-xl border border-amber-200/80 bg-amber-50/40 text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-navy-950 uppercase">{a.anomaly_type.replace('_', ' ')}</span>
                  <span className="text-slate-500">{String(a.event_date).slice(0, 10)} · {a.severity}</span>
                </div>
                <p className="text-slate-700">{a.explanation}</p>
              </div>
            ))
          ) : (
            <p className="text-xs text-slate-400">Click &ldquo;Scan Anomalies&rdquo; above to run statistical anomaly detection on recent sales and expenses.</p>
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
          <h2 className="text-sm font-bold text-navy-950 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-teal-600" /> Stockout &amp; Depletion Risk Alerts ({stockAlerts.length})
          </h2>
          {stockAlerts.length > 0 ? (
            stockAlerts.map((sa: any) => (
              <div key={sa.id} className="p-3.5 rounded-xl border border-slate-200 flex items-center justify-between gap-3 text-xs">
                <div>
                  <div className="font-semibold text-navy-950">{sa.product_name}</div>
                  <div className="text-slate-500">{sa.branch_name} · {sa.current_quantity} left (reorder at {sa.threshold_quantity})</div>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${sa.severity === 'critical' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-800'}`}>
                  {sa.predicted_days_left !== null ? `${sa.predicted_days_left}d left` : sa.alert_type}
                </span>
              </div>
            ))
          ) : (
            <p className="text-xs text-slate-400">No active stock depletion alerts.</p>
          )}
        </div>
      </div>

      {/* RFM Churn Segmentation */}
      {rfm && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-navy-950">RFM Customer Segmentation &amp; Churn Risk</h2>
            <div className="flex flex-wrap gap-2 text-xs">
              {Object.entries(rfm.segment_counts || {}).map(([seg, cnt]: any) => (
                <span key={seg} className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 font-semibold capitalize">
                  {seg.replace('_', ' ')}: {cnt}
                </span>
              ))}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-100 text-slate-400 text-left">
                  <th className="pb-2">Customer</th>
                  <th className="pb-2">Segment</th>
                  <th className="pb-2 text-right">Orders</th>
                  <th className="pb-2 text-right">Lifetime Value</th>
                  <th className="pb-2 text-right">Days Inactive</th>
                  <th className="pb-2 text-right">Churn Risk</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(rfm.customers || []).map((c: any) => (
                  <tr key={c.customer_id}>
                    <td className="py-2 font-semibold text-navy-950">{c.full_name}</td>
                    <td className="py-2 capitalize">{c.segment.replace('_', ' ')}</td>
                    <td className="py-2 text-right">{c.total_orders}</td>
                    <td className="py-2 text-right">{formatKes(c.lifetime_value)}</td>
                    <td className="py-2 text-right">{c.days_since_last_purchase ?? '—'}</td>
                    <td className="py-2 text-right">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${c.churn_probability >= 0.5 ? 'bg-rose-100 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>
                        {Math.round(c.churn_probability * 100)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Historical Forecast Runs */}
      {runHistory.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <h3 className="text-sm font-bold text-navy-950 mb-3">Forecast Governance History</h3>
          <div className="flex flex-wrap gap-2">
            {runHistory.slice(0, 8).map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={async () => { try { setError(''); setActiveRun(await apiRequest(`/forecasts/${r.id}`)); } catch (e: any) { setError(e.message || 'Could not load this forecast.'); } }}
                className="px-3 py-2 rounded-xl border border-slate-200 hover:border-teal-500 text-left text-xs bg-slate-50/70"
              >
                <div className="font-semibold text-navy-950 uppercase">{r.forecast_type} · {r.horizon_days}d</div>
                <div className="text-[11px] text-slate-500">{r.selected_algorithm} · {new Date(r.created_at).toLocaleDateString('en-KE')}</div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
