import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Activity, AlertTriangle, CheckCircle2, Sparkles, Upload, ArrowRight, ShieldAlert, ShieldCheck } from 'lucide-react';
import { apiRequest } from '../../services/api';
import { useAuth } from '../../stores/authStore';
import { KpiCard } from '../../components/KpiCard';
import { formatKes, t } from '../../i18n/translations';

export const DashboardPage: React.FC = () => {
  const { activeOrg, selectedBranchId, language, hasPermission, hasFeature } = useAuth();
  const [days, setDays] = useState(30);
  const [data, setData] = useState<any | null>(null);
  const [briefing, setBriefing] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!activeOrg) return;
    if (!hasPermission('analytics:read')) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    Promise.all([
      apiRequest(`/analytics/overview?days=${days}&branchId=${encodeURIComponent(selectedBranchId)}`),
      apiRequest(`/ai/briefing?branchId=${encodeURIComponent(selectedBranchId)}`).catch(() => null),
    ])
      .then(([res, brief]) => {
        setData(res);
        setBriefing(brief);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [activeOrg?.id, selectedBranchId, days]);

  // Role-adapted portal view for Customer Service Agent (who has no financial analytics permission)
  if (!hasPermission('analytics:read')) {
    return (
      <div className="space-y-6">
        <div className="bg-white border border-slate-200 rounded-2xl p-6">
          <div className="text-xs font-semibold uppercase tracking-wider text-teal-600">Customer Service Workspace</div>
          <h1 className="mt-1 text-2xl font-bold text-navy-950">{activeOrg?.display_name} — Customer Care Desk</h1>
          <p className="mt-2 text-sm text-slate-600">
            Your role ({activeOrg?.roles.join(', ').replace(/_/g, ' ')}) provides authorized access to customer records, consent management, and BizWave Connect messaging while keeping financial ledgers and cash-flow forecasts restricted.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link to="/app/connect" className="px-4 py-2.5 rounded-xl bg-navy-950 text-white text-sm font-semibold">
              Open BizWave Connect &amp; Customer Directory →
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const brandColor = activeOrg?.brand_color || '#0D9488';
  const industryLabel = (activeOrg?.industry_code || 'general_sme').replace(/_/g, ' ');
  const isRestaurant = activeOrg?.industry_code === 'restaurant';

  return (
    <div className="space-y-6">
      {/* Header + Period Selector */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider" style={{ color: brandColor }}>
            <span className="capitalize">{industryLabel} Daily Command Center</span>
            <span>·</span>
            <span className="capitalize">{activeOrg?.roles[0]?.replace(/_/g, ' ')} View</span>
          </div>
          <h1 className="mt-1 text-2xl sm:text-3xl font-extrabold tracking-tight text-navy-950">
            {activeOrg?.display_name}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Your live business pulse — revenue, profit, stock alerts, and priority actions at a glance.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {[7, 30, 60, 90].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDays(d)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                days === d
                  ? 'bg-navy-950 text-white'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {error && <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm">{error}</div>}

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-28 rounded-xl bg-white border border-slate-200 animate-pulse" />
          ))}
        </div>
      ) : data ? (
        <>
          {/* Non-Custodial Clarity & Executive Health Score Banner */}
          <div className="bg-[#041527] text-white rounded-2xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 border border-[#2ED3C2]/20">
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 rounded-2xl bg-[#2ED3C2]/15 border border-[#2ED3C2]/40 flex flex-col items-center justify-center shrink-0">
                <span className="text-xl font-extrabold text-[#2ED3C2]">
                  {briefing?.hasData && briefing?.diagnostics ? briefing.diagnostics.overall_health_score : '—'}
                </span>
                <span className="text-[9px] uppercase tracking-wider text-slate-300">/100</span>
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-[#2ED3C2] flex items-center gap-1">
                    <Activity className="w-3.5 h-3.5" /> BizWave Health Score
                  </span>
                  {briefing?.hasData && briefing?.diagnostics && (
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/10 text-white font-semibold">
                      {briefing.diagnostics.grade}
                    </span>
                  )}
                </div>
                <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-2xl">
                  {briefing?.hasData && briefing?.diagnostics?.drivers?.[0]
                    ? `${briefing.diagnostics.drivers[0].headline} — ${briefing.diagnostics.drivers[0].detail}`
                    : 'Record or upload your sales, M-Pesa entries, stock, and expenses to unlock automated health diagnostics and forecasts.'}
                </p>
                <div className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-slate-400">
                  <ShieldCheck className="w-3.5 h-3.5 text-[#2ED3C2]" />
                  <span>Record &amp; Analyse Portal — BizWave never processes customer payments; only platform subscription &amp; add-on fees apply.</span>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 shrink-0">
              <Link
                to="/app/analytics?tab=imports"
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-semibold"
              >
                <Upload className="w-3.5 h-3.5 text-[#2ED3C2]" /> Record / Upload Data
              </Link>
              <Link
                to={hasFeature('ai_assistant') ? '/app/ai' : '/app/billing'}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#2ED3C2] text-[#041527] text-xs font-bold hover:bg-[#5ce2d4]"
              >
                <Sparkles className="w-3.5 h-3.5" /> Ask BizWave AI
              </Link>
            </div>
          </div>

          {/* KPI Grid (6 verified KPIs with documented formulas & period deltas) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            <KpiCard label={t(language, 'total_revenue')} metric={data.kpis.totalRevenue} vsLabel={t(language, 'vs_prev')} />
            <KpiCard label={t(language, 'gross_profit')} metric={data.kpis.grossProfit} vsLabel={t(language, 'vs_prev')} />
            {hasPermission('finance:read') && (
              <KpiCard label={t(language, 'total_expenses')} metric={data.kpis.totalExpenses} vsLabel={t(language, 'vs_prev')} invertDeltaColor />
            )}
            {hasPermission('finance:read') && (
              <KpiCard label={t(language, 'net_profit')} metric={data.kpis.netProfit} vsLabel={t(language, 'vs_prev')} />
            )}
            <KpiCard label={t(language, 'order_volume')} metric={data.kpis.orderVolume} unit="count" vsLabel={t(language, 'vs_prev')} />
            <KpiCard label={t(language, 'avg_order_value')} metric={data.kpis.avgOrderValue} vsLabel={t(language, 'vs_prev')} />
          </div>

          {/* Data Coverage & Inventory Health Strip */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between">
              <div>
                <div className="text-xs text-slate-500 font-medium">Data Coverage Score</div>
                <div className="text-xl font-bold text-navy-950 mt-0.5">{data.dataQuality.coveragePct}%</div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  {data.dataQuality.counts.sales} sales · {data.dataQuality.counts.expenses} expenses · {data.dataQuality.counts.products} SKUs
                </div>
              </div>
              <CheckCircle2 className="w-8 h-8 text-teal-600/80" />
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between">
              <div>
                <div className="text-xs text-slate-500 font-medium">Inventory Stock Health</div>
                <div className="text-xl font-bold text-navy-950 mt-0.5">
                  {data.inventorySummary.stockoutCount} stockout · {data.inventorySummary.lowStockCount} low
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Stock Cost Value: {formatKes(data.inventorySummary.totalInventoryValue)}
                </div>
              </div>
              {data.inventorySummary.stockoutCount > 0 ? (
                <AlertTriangle className="w-8 h-8 text-amber-500" />
              ) : (
                <CheckCircle2 className="w-8 h-8 text-emerald-500" />
              )}
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between">
              <div>
                <div className="text-xs text-slate-500 font-medium">BizWave AI Assistant</div>
                <div className="text-sm font-bold text-navy-950 mt-1">
                  {hasFeature('ai_assistant') ? 'Ask in English or Kiswahili' : 'Upgrade to Intelligence Plan'}
                </div>
                <Link
                  to={hasFeature('ai_assistant') ? '/app/ai' : '/app/billing'}
                  className="text-xs font-semibold text-teal-700 hover:underline mt-1 inline-flex items-center gap-1"
                >
                  {hasFeature('ai_assistant') ? 'Open Assistant' : 'View Plans'} <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
              <Sparkles className="w-8 h-8 text-teal-600/80" />
            </div>
          </div>

          {/* Primary Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <div className="lg:col-span-8 bg-white border border-slate-200 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-sm font-bold text-navy-950">Daily Revenue &amp; Gross Profit Trend (KES)</h2>
                  <p className="text-xs text-slate-400">
                    {data.period.startDate} to {data.period.endDate} · Timezone: Africa/Nairobi
                  </p>
                </div>
              </div>
              {data.revenueTrend.length > 0 ? (
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data.revenueTrend}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={(v) => v.slice(5)} />
                      <YAxis tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                      <Tooltip formatter={(val: any) => formatKes(Number(val))} />
                      <Area type="monotone" dataKey="revenue" name="Revenue" stroke={brandColor} fill={brandColor} fillOpacity={0.14} strokeWidth={2.2} />
                      <Area type="monotone" dataKey="grossProfit" name="Gross Profit" stroke="#041527" fill="#041527" fillOpacity={0.06} strokeWidth={1.8} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-60 flex items-center justify-center text-sm text-slate-400">
                  No sales recorded in this period.
                </div>
              )}
            </div>

            <div className="lg:col-span-4 bg-white border border-slate-200 rounded-2xl p-5">
              <h2 className="text-sm font-bold text-navy-950 mb-1">
                {data.salesByBranch.length > 1 ? 'Sales by Branch (KES)' : 'Sales by Category (KES)'}
              </h2>
              <p className="text-xs text-slate-400 mb-4">
                {isRestaurant ? 'Menu & Courtyard breakdown' : 'Authorized branch / category distribution'}
              </p>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={
                      data.salesByBranch.length > 1
                        ? data.salesByBranch.map((b: any) => ({ name: b.branchName, revenue: b.revenue }))
                        : data.salesByCategory.map((c: any) => ({ name: c.category, revenue: c.revenue }))
                    }
                    layout="vertical"
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis type="number" tick={{ fontSize: 10, fill: '#64748b' }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                    <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11, fill: '#334155' }} />
                    <Tooltip formatter={(v: any) => formatKes(Number(v))} />
                    <Bar dataKey="revenue" fill={brandColor} radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Bottom Grid: Top Products + Actionable Recommendations */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-bold text-navy-950">
                  {isRestaurant ? 'Top Performing Menu Items' : 'Top Performing Products'}
                </h2>
                <Link to="/app/analytics" className="text-xs font-semibold text-teal-700 hover:underline">
                  Full Analytics →
                </Link>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 text-slate-400 text-left">
                      <th className="pb-2.5 font-medium">Product</th>
                      <th className="pb-2.5 font-medium text-right">Units</th>
                      <th className="pb-2.5 font-medium text-right">Revenue</th>
                      <th className="pb-2.5 font-medium text-right">Gross Profit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.topProducts.map((p: any) => (
                      <tr key={p.id} className="hover:bg-slate-50/70">
                        <td className="py-2.5">
                          <div className="font-semibold text-navy-950">{p.name}</div>
                          <div className="text-[11px] text-slate-400">{p.category} · {p.sku}</div>
                        </td>
                        <td className="py-2.5 text-right text-slate-700">{p.units_sold}</td>
                        <td className="py-2.5 text-right font-medium text-slate-800">{formatKes(p.revenue)}</td>
                        <td className="py-2.5 text-right font-semibold text-teal-700">{formatKes(p.gross_profit)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-navy-950">Grounded Recommendations</h2>
                <Link to="/app/predict" className="text-xs font-semibold text-teal-700 hover:underline">
                  Open Predict →
                </Link>
              </div>
              {data.recommendations.length > 0 ? (
                data.recommendations.map((rec: any) => (
                  <div key={rec.id} className="p-3.5 rounded-xl border border-slate-200/80 bg-slate-50/60 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-xs text-navy-950">{rec.title}</span>
                      <span
                        className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${
                          rec.priority === 'urgent' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {rec.priority}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600">{rec.observation}</p>
                    <p className="text-xs text-teal-800 font-medium">Action: {rec.suggested_action}</p>
                  </div>
                ))
              ) : (
                <div className="p-4 rounded-xl bg-slate-50 text-xs text-slate-500 flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-slate-400" />
                  Run a forecast or anomaly scan in BizWave Predict to generate new recommendations.
                </div>
              )}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
};
