import React, { useEffect, useState } from 'react';
import { Calendar, Download, FileSpreadsheet, Play } from 'lucide-react';
import { apiRequest, downloadCsvReport } from '../../services/api';
import { useAuth } from '../../stores/authStore';

const REPORT_TYPES = [
  { code: 'sales_summary', name: 'Daily Sales Summary', desc: 'Date, branch, sales records and recorded revenue.' },
  { code: 'expense_ledger', name: 'Operating Expense Ledger', desc: 'Vendor, expense category, payment method, and reconciliation status.' },
  { code: 'inventory_valuation', name: 'Inventory Stock Valuation & Alerts', desc: 'Available units, reorder thresholds, and stock cost value per branch.' },
  { code: 'customer_insights', name: 'Customer LTV & Consent Directory', desc: 'Repeat orders, lifetime KES spend, inactivity days & consent status.' },
  { code: 'branch_comparison', name: 'Multi-Branch Performance Comparison', desc: 'Compare recorded revenue across your branches.' },
  { code: 'cashflow_statement', name: 'Cash-Flow & M-Pesa Reconciliation Statement', desc: 'Daily inflows, outflows, and recorded vs reconciled status.' },
];

export const ReportsPage: React.FC = () => {
  const { hasPermission } = useAuth();
  const permissionFor: Record<string, string> = { sales_summary: 'sales:read', expense_ledger: 'finance:read', inventory_valuation: 'inventory:read', customer_insights: 'customers:read', branch_comparison: 'sales:read', cashflow_statement: 'finance:read' };
  const visibleReports = REPORT_TYPES.filter((report) => hasPermission(permissionFor[report.code]) && (report.code !== 'inventory_valuation' || hasPermission('finance:read')) && (report.code !== 'customer_insights' || hasPermission('sales:read')));
  const [selectedType, setSelectedType] = useState(visibleReports[0]?.code || 'sales_summary');
  const [days, setDays] = useState(30);
  const [previewRows, setPreviewRows] = useState<any[]>([]);
  const [history, setHistory] = useState<any>({ executions: [], schedules: [] });
  const [schedEmail, setSchedEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const loadHistory = async () => {
    try {
      const res = await apiRequest('/reports');
      setHistory(res);
    } catch {}
  };

  useEffect(() => {
    loadHistory();
  }, []);

  const runPreview = async () => {
    setBusy(true);
    setMsg('');
    try {
      const res = await apiRequest('/reports/generate', {
        method: 'POST',
        body: { reportType: selectedType, days, format: 'json' },
      });
      setPreviewRows(res.rows || []);
      setMsg(`Generated ${res.rowCount} rows from PostgreSQL.`);
      loadHistory();
    } catch (e: any) {
      setMsg(e.message || 'Could not generate the report.');
      setPreviewRows([]);
    } finally {
      setBusy(false);
    }
  };

  const handleSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schedEmail) return;
    setMsg('');
    try {
      const res = await apiRequest('/reports/schedule', {
        method: 'POST',
        body: { name: `Weekly ${selectedType.replace(/_/g, ' ')}`, reportType: selectedType, recipients: [schedEmail] },
      });
      setSchedEmail('');
      setMsg(res.message || 'Saved as a draft; automatic email delivery is not configured.');
      loadHistory();
    } catch (e: any) { setMsg(e.message || 'Could not save this draft.'); }
  };

  const cols = previewRows.length > 0 ? Object.keys(previewRows[0]) : [];

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs font-bold uppercase tracking-wider text-teal-600">Decision-Ready Business Summaries</div>
        <h1 className="mt-1 text-2xl font-extrabold text-navy-950">Reports &amp; Exports</h1>
        <p className="text-sm text-slate-500">
          Generate clean sales, profit, stock, and expense reports in one click for partners, lenders, or monthly reviews.
        </p>
      </div>

      {msg && <div className="p-3 rounded-xl bg-teal-50 border border-teal-200 text-teal-900 text-xs font-medium">{msg}</div>}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {visibleReports.map((rt) => (
          <button
            key={rt.code}
            type="button"
            onClick={() => setSelectedType(rt.code)}
            className={`text-left p-4 rounded-xl border transition-colors ${
              selectedType === rt.code ? 'bg-navy-950 text-white border-navy-950' : 'bg-white border-slate-200 hover:border-slate-300'
            }`}
          >
            <div className="flex items-center gap-2 font-bold text-xs">
              <FileSpreadsheet className={`w-4 h-4 ${selectedType === rt.code ? 'text-teal-400' : 'text-teal-600'}`} />
              {rt.name}
            </div>
            <p className={`mt-1.5 text-[11px] ${selectedType === rt.code ? 'text-slate-300' : 'text-slate-500'}`}>{rt.desc}</p>
          </button>
        ))}
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="px-3 py-2 text-xs font-semibold border border-slate-200 rounded-lg bg-white">
            <option value={7}>Last 7 Days</option>
            <option value={30}>Last 30 Days</option>
            <option value={60}>Last 60 Days</option>
            <option value={90}>Last 90 Days</option>
          </select>
          <button type="button" disabled={busy} onClick={runPreview} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-navy-950 text-white text-xs font-semibold">
            <Play className="w-3.5 h-3.5" /> {busy ? 'Running...' : 'Generate Preview'}
          </button>
          <button
            type="button"
            onClick={async () => { try { await downloadCsvReport(selectedType, days); } catch (e: any) { setMsg(e.message || 'Could not export this report.'); } }}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-teal-600 text-teal-700 text-xs font-semibold hover:bg-teal-50"
          >
            <Download className="w-3.5 h-3.5" /> Export CSV
          </button>
        </div>

        {hasPermission('reports:manage') && <form onSubmit={handleSchedule} className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
          <input
            type="email"
            required
            placeholder="Email for schedule draft..."
            value={schedEmail}
            onChange={(e) => setSchedEmail(e.target.value)}
            className="min-w-0 max-w-full px-3 py-2 text-xs border border-slate-200 rounded-lg w-52"
          />
          <button type="submit" className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-navy-950">
            <Calendar className="w-3.5 h-3.5" /> Save draft
          </button>
        </form>}
      </div>

      {previewRows.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 overflow-x-auto">
          <h3 className="text-sm font-bold text-navy-950 mb-3">Report Output ({previewRows.length} rows)</h3>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-100 text-slate-400 text-left">
                {cols.map((c) => <th key={c} className="pb-2 pr-4 capitalize">{c.replace(/_/g, ' ')}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {previewRows.slice(0, 30).map((row, idx) => (
                <tr key={idx}>
                  {cols.map((c) => <td key={c} className="py-2 pr-4 text-slate-700">{String(row[c] ?? '—')}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {history.schedules?.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <h3 className="text-sm font-bold text-navy-950 mb-3">Saved report schedules</h3><p className="text-xs text-slate-500 mb-3">Automatic email delivery is not configured. These schedules are drafts.</p>
          <div className="space-y-2 text-xs">
            {history.schedules.map((s: any) => (
              <div key={s.id} className="p-3 rounded-xl bg-slate-50 flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-navy-950 capitalize break-words">{s.report_name}</span>
                <span className="text-slate-500 break-all">Cron: <code>{s.cron_expression}</code> · Recipients: {(s.recipients || []).join(', ')}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
