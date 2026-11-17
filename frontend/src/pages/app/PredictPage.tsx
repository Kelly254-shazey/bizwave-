import React, { useEffect, useState } from 'react';
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
import { AlertTriangle, Lock, Play, ShieldAlert, TrendingUp, Users } from 'lucide-react';
import { apiRequest } from '../../services/api';
import { useAuth } from '../../stores/authStore';
import { formatKes } from '../../i18n/translations';

export const PredictPage: React.FC = () => {
  const { activeOrg, selectedBranchId, hasPermission, hasFeature } = useAuth();
  const [forecastType, setForecastType] = useState<'sales' | 'demand' | 'cashflow'>('sales');
  const [horizonDays, setHorizonDays] = useState(30);
  const [products, setProducts] = useState<any[]>([]);
  const [selectedProductId, setSelectedProductId] = useState('');

  const [activeRun, setActiveRun] = useState<any | null>(null);
  const [runHistory, setRunHistory] = useState<any[]>([]);
  const [anomalies, setAnomalies] = useState<any[]>([]);
  const [stockAlerts, setStockAlerts] = useState<any[]>([]);
  const [rfm, setRfm] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const canPredictBasic = hasFeature('predict_basic');
  const canPredictAdv = hasFeature('predict_advanced');

  const loadExisting = async () => {
    if (!canPredictBasic) return;
    try {
      const [fcRes, invRes] = await Promise.all([
        apiRequest('/forecasts'),
        hasPermission('inventory:read') ? apiRequest('/analytics/inventory') : Promise.resolve({ inventory: [] }),
      ]);
      setRunHistory(fcRes.forecastRuns || []);
      setAnomalies(fcRes.anomalies || []);
      setStockAlerts(fcRes.stockAlerts || []);
      const uniqueProds = Array.from(
        new Map((invRes.inventory || []).map((i: any) => [i.product_id, i])).values(),
      );
      setProducts(uniqueProds);
      if (uniqueProds.length > 0 && !selectedProductId) {
        setSelectedProductId((uniqueProds[0] as any).product_id);
      }
      if (fcRes.forecastRuns?.[0] && !activeRun) {
        const detail = await apiRequest(`/forecasts/${fcRes.forecastRuns[0].id}`);
        setActiveRun(detail);
      }
    } catch (e: any) {
      setError(e.message);
    }
  };

  useEffect(() => {
    loadExisting();
  }, [activeOrg?.id, selectedBranchId]);

  const handleRunForecast = async () => {
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
          Your organization is currently on the <strong>{activeOrg?.plan_code.toUpperCase()}</strong> plan. Upgrade in Billing to unlock backtested forecasting, stockout prediction, and anomaly detection.
        </p>
        <Link to="/app/billing" className="inline-block mt-2 px-5 py-2.5 rounded-xl bg-navy-950 text-white text-sm font-semibold">
          Upgrade Subscription Plan
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-xs font-bold uppercase tracking-wider text-teal-600">Look Ahead Before Problems Hit</div>
          <h1 className="mt-1 text-2xl font-extrabold text-navy-950">BizWave Predict</h1>
          <p className="text-sm text-slate-500">
            Forecast upcoming sales, stock demand, and 30-day cash flow, spot unusual spikes or dips early, and identify customers at risk of churning.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canPredictAdv && hasPermission('predict:sales') && (
            <button
              type="button"
              disabled={busy}
              onClick={handleScanAnomalies}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-navy-950 hover:bg-slate-50"
            >
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600" /> Scan Anomalies
            </button>
          )}
          {canPredictAdv && (
            <button
              type="button"
              disabled={busy}
              onClick={handleRunRfm}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-navy-950 hover:bg-slate-50"
            >
              <Users className="w-3.5 h-3.5 text-teal-600" /> Run RFM Churn Model
            </button>
          )}
        </div>
      </div>

      {/* Forecast Control Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-wrap items-end gap-4">
        <div>
          <label className="block text-[11px] font-semibold text-slate-600 mb-1">Forecast Domain</label>
          <select
            value={forecastType}
            onChange={(e) => setForecastType(e.target.value as any)}
            className="px-3 py-2 text-xs font-semibold border border-slate-200 rounded-lg bg-white"
          >
            {hasPermission('predict:sales') && <option value="sales">Sales Revenue Forecast</option>}
            {hasPermission('predict:demand') && <option value="demand">Product Demand &amp; Stockout Forecast</option>}
            {hasPermission('predict:cashflow') && (
              <option value="cashflow" disabled={!canPredictAdv}>
                Cash-Flow Projection {!canPredictAdv ? '(Intelligence Plan)' : ''}
              </option>
            )}
          </select>
        </div>

        {forecastType === 'demand' && products.length > 0 && (
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">Product SKU</label>
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

        <div>
          <label className="block text-[11px] font-semibold text-slate-600 mb-1">Horizon</label>
          <select
            value={horizonDays}
            onChange={(e) => setHorizonDays(Number(e.target.value))}
            className="px-3 py-2 text-xs font-semibold border border-slate-200 rounded-lg bg-white"
          >
            <option value={14}>14 Days</option>
            <option value={30}>30 Days</option>
            <option value={60}>60 Days</option>
          </select>
        </div>

        <button
          type="button"
          disabled={busy}
          onClick={handleRunForecast}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-navy-950 text-white text-xs font-semibold hover:bg-navy-800 disabled:opacity-50"
        >
          <Play className="w-3.5 h-3.5" />
          {busy ? 'Running Python Engine...' : 'Generate Validated Forecast'}
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
            <div className="text-right text-xs">
              <div className="font-semibold text-navy-950">Model: <code>{activeRun.run.selected_algorithm}</code></div>
              {activeRun.run.evaluation_metrics?.selected_model?.mape !== undefined && (
                <div className="text-slate-500">
                  Backtest MAPE: <strong>{activeRun.run.evaluation_metrics.selected_model.mape}%</strong> (Baseline:{' '}
                  {activeRun.run.evaluation_metrics.baseline_seasonal_naive?.mape}%)
                </div>
              )}
            </div>
          </div>

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
                {Object.entries(activeRun.run.summary || {}).slice(0, 4).map(([k, v]: any) => (
                  <div key={k} className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
                    <div className="text-[10px] uppercase tracking-wider text-slate-500">{k.replace(/_/g, ' ')}</div>
                    <div className="mt-1 text-base font-bold text-navy-950">
                      {typeof v === 'number' && !k.includes('days') && !k.includes('pct') && !k.includes('demand') && !k.includes('stock') && !k.includes('reorder')
                        ? formatKes(v)
                        : String(v)}
                    </div>
                  </div>
                ))}
              </div>

              {/* Confidence Interval Area Chart */}
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={(activeRun.values || []).map((v: any) => ({
                      date: String(v.target_date).slice(5, 10),
                      predicted: Number(v.predicted_value),
                      lower: Number(v.lower_bound),
                      upper: Number(v.upper_bound),
                    }))}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748b' }} />
                    <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                    <Tooltip />
                    <Area type="monotone" dataKey="upper" name="Upper 90% CI" stroke="#94a3b8" fill="#cbd5e1" fillOpacity={0.25} strokeDasharray="3 3" />
                    <Area type="monotone" dataKey="predicted" name="Predicted" stroke="#0D9488" fill="#0D9488" fillOpacity={0.18} strokeWidth={2.4} />
                    <Area type="monotone" dataKey="lower" name="Lower 90% CI" stroke="#94a3b8" fill="#ffffff" fillOpacity={0.8} strokeDasharray="3 3" />
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
                onClick={async () => setActiveRun(await apiRequest(`/forecasts/${r.id}`))}
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
