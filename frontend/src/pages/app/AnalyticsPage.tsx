import React, { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileUp,
  Globe,
  Package,
  Receipt,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Wallet,
} from 'lucide-react';
import { apiRequest } from '../../services/api';
import { useAuth } from '../../stores/authStore';
import { formatKes } from '../../i18n/translations';
import { PORTAL_CHART_COLORS } from '../../utils/chart-colors';

const SALES_CSV_TEMPLATE = `receipt_no,date,product,quantity,total,payment_method\n`;

export const AnalyticsPage: React.FC = () => {
  const { branches, selectedBranchId, hasPermission, language, activeOrg } = useAuth();
  const tr = (en: string, kiswahili: string) => language === 'sw' ? kiswahili : en;
  const [searchParams, setSearchParams] = useSearchParams();
  const allowedTabs = [hasPermission('sales:read') && 'sales', hasPermission('inventory:read') && 'inventory', hasPermission('finance:read') && 'finance', hasPermission('imports:read') && 'imports', hasPermission('analytics:read') && 'website'].filter(Boolean) as string[];
  const requestedTab = searchParams.get('tab');
  const initialTab = allowedTabs.includes(requestedTab || '') ? requestedTab as any : (allowedTabs[0] as any || 'sales');
  const [tab, setTab] = useState<'sales' | 'inventory' | 'finance' | 'imports' | 'website'>(initialTab);

  const [sales, setSales] = useState<any[]>([]);
  const [invData, setInvData] = useState<any>({ inventory: [], alerts: [], recentMovements: [] });
  const [finData, setFinData] = useState<any>({ expenses: [], categories: [], cashTransactions: [], reconciliationSummary: [], payables: [] });
  const [imports, setImports] = useState<any[]>([]);
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [websiteBusy, setWebsiteBusy] = useState(false);
  const [websiteResult, setWebsiteResult] = useState<any | null>(null);
  const [websiteSources, setWebsiteSources] = useState<any[]>([]);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [loadError, setLoadError] = useState('');
  const [dataLoading, setDataLoading] = useState(true);
  const loadRef = useRef(0);

  // Stock adjustment state
  const [adjForm, setAdjForm] = useState({ branchId: '', productId: '', adjustmentQuantity: 10, reasonCode: 'recount', notes: '' });
  // Expense create state
  const [expForm, setExpForm] = useState({ branchId: '', categoryId: '', vendorName: '', description: '', expenseDate: new Date().toISOString().slice(0, 10), amount: '', paymentMethod: 'mpesa' });
  // Import wizard state
  const [datasetType, setDatasetType] = useState('sales');
  const [activeImport, setActiveImport] = useState<any | null>(null);
  const [importErrors, setImportErrors] = useState<any[]>([]);
  const [importMapping, setImportMapping] = useState<Record<string, string>>({});
  const [busyImport, setBusyImport] = useState(false);
  const uploadableDatasets = [
    { code: 'sales', permission: 'sales:write', label: tr('Sales records', 'Rekodi za mauzo') },
    { code: 'expenses', permission: 'finance:write', label: tr('Expenses', 'Matumizi') },
    { code: 'products', permission: 'inventory:write', label: tr('Products & opening stock', 'Bidhaa na stoo ya mwanzo') },
    { code: 'customers', permission: 'customers:write', label: tr('Customers', 'Wateja') },
  ].filter((dataset) => hasPermission('imports:manage') && hasPermission(dataset.permission));
  useEffect(() => { if (uploadableDatasets.length && !uploadableDatasets.some((dataset) => dataset.code === datasetType)) setDatasetType(uploadableDatasets[0].code); }, [activeOrg?.id]);
  useEffect(() => { setActiveImport(null); setImportErrors([]); setWebsiteResult(null); setMsg(''); setErr(''); }, [activeOrg?.id, selectedBranchId]);

  const switchTab = (next: 'sales' | 'inventory' | 'finance' | 'imports' | 'website') => {
    setTab(next);
    setSearchParams({ tab: next });
    setMsg('');
    setErr('');
  };

  useEffect(() => {
    const qTab = searchParams.get('tab');
    if (qTab && allowedTabs.includes(qTab) && qTab !== tab) setTab(qTab as typeof tab);
    else if (!allowedTabs.includes(tab) && allowedTabs.length) setTab(allowedTabs[0] as typeof tab);
  }, [searchParams]);

  const loadData = async () => {
    const id = ++loadRef.current;
    setLoadError(''); setDataLoading(true);
    try {
      if (tab === 'sales' && hasPermission('sales:read')) {
        const res = await apiRequest(`/sales?branchId=${encodeURIComponent(selectedBranchId)}&limit=60`);
        if (id === loadRef.current) setSales(res.sales || []);
      } else if (tab === 'inventory' && hasPermission('inventory:read')) {
        const res = await apiRequest(`/inventory?branchId=${encodeURIComponent(selectedBranchId)}`);
        if (id === loadRef.current) setInvData(res);
      } else if (tab === 'finance' && hasPermission('finance:read')) {
        const res = await apiRequest(`/finance/overview?branchId=${encodeURIComponent(selectedBranchId)}`);
        if (id === loadRef.current) setFinData(res);
      } else if (tab === 'imports' && hasPermission('imports:read')) {
        const res = await apiRequest('/imports');
        if (id === loadRef.current) setImports(res.imports || []);
      } else if (tab === 'website' && hasPermission('analytics:read')) {
        const res = await apiRequest(`/analytics/website-sources?branchId=${encodeURIComponent(selectedBranchId)}`);
        if (id === loadRef.current) setWebsiteSources(res.sources || []);
      }
    } catch (e: any) {
      if (id === loadRef.current) setLoadError(e.message || 'Could not load records.');
    } finally {
      if (id === loadRef.current) setDataLoading(false);
    }
  };

  const handleAnalyzeWebsite = async (importCatalog = false, overrideUrl?: string) => {
    const targetUrl = (overrideUrl ?? websiteUrl).trim();
    if (!targetUrl) {
      setErr('Enter your business website link (e.g. https://yourbusiness.co.ke).');
      return;
    }
    setWebsiteBusy(true);
    setErr('');
    setMsg('');
    try {
      const res = await apiRequest('/analytics/website-analyze', {
        method: 'POST',
        body: { url: targetUrl, importCatalog, branchId: selectedBranchId },
      });
      setWebsiteResult(res);
      setWebsiteUrl(res.url || targetUrl);
      if (importCatalog) {
        setMsg(tr(`${res.importedCount} added, ${res.updatedCount} updated, ${res.skippedCount} skipped. Skips include missing or non-KES prices and SKUs already in use. No costs or stock quantities were assumed.`,
          `${res.importedCount} zimeongezwa, ${res.updatedCount} zimesasishwa, ${res.skippedCount} zimerukwa. Zilizorukwa zinaweza kukosa bei ya KES au kuwa na namba inayotumika. Gharama na kiasi cha stoo havikukadiriwa.`));
      } else {
        setMsg(tr(`Found ${res.pricing_stats?.total_items_found || 0} catalog item(s). This is a preview; no source or products were saved.`,
          `Bidhaa ${res.pricing_stats?.total_items_found || 0} zimepatikana. Huu ni ukaguzi tu; hakuna chanzo au bidhaa zilizohifadhiwa.`));
      }
      loadData();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setWebsiteBusy(false);
    }
  };

  useEffect(() => {
    if (allowedTabs.includes(tab)) loadData(); else setDataLoading(false);
    return () => { loadRef.current++; };
  }, [tab, selectedBranchId, activeOrg?.id]);

  const handleReverseSale = async (saleId: string) => {
    const reason = window.prompt('Enter audit reason for traceable sale reversal (original record is preserved):', 'Customer returned unopened item');
    if (!reason) return;
    try {
      await apiRequest(`/sales/${saleId}/return`, { method: 'POST', body: { reason } });
      setMsg(tr('The sale was reversed and the original record was kept.', 'Mauzo yamegeuzwa na rekodi ya awali imehifadhiwa.'));
      loadData();
    } catch (e: any) {
      setErr(e.message);
    }
  };

  const handleAdjustStock = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    setMsg('');
    try {
      await apiRequest('/inventory/adjustments', {
        method: 'POST',
        body: {
          ...adjForm,
          branchId: adjForm.branchId || branches[0]?.id,
          adjustmentQuantity: Number(adjForm.adjustmentQuantity),
        },
      });
      setMsg(tr('Stock adjustment saved.', 'Marekebisho ya stoo yamehifadhiwa.'));
      setAdjForm({ ...adjForm, notes: '' });
      loadData();
    } catch (e: any) {
      setErr(e.message);
    }
  };

  const handleCreateExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    setMsg('');
    try {
      await apiRequest('/finance/expenses', {
        method: 'POST',
        body: {
          ...expForm,
          branchId: expForm.branchId || branches[0]?.id,
          categoryId: expForm.categoryId || null,
          amount: Number(expForm.amount),
        },
      });
      setMsg(tr('Expense saved.', 'Matumizi yamehifadhiwa.'));
      setExpForm({ ...expForm, vendorName: '', description: '', amount: '' });
      loadData();
    } catch (e: any) {
      setErr(e.message);
    }
  };

  const handleReconcileTx = async (txId: string) => {
    try {
      await apiRequest(`/finance/reconcile/${txId}`, { method: 'POST' });
      setMsg(tr('Transaction marked as reconciled.', 'Muamala umewekwa kuwa umelinganishwa.'));
      loadData();
    } catch (e: any) {
      setErr(e.message);
    }
  };

  const downloadCsvTemplate = () => {
    const blob = new Blob([SALES_CSV_TEMPLATE], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'bizwave-sales-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const uploadFile = async (file: File) => {
    setBusyImport(true);
    setErr('');
    setMsg('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('datasetType', datasetType);
      if (branches[0]?.id) fd.append('branchId', selectedBranchId !== 'all' ? selectedBranchId : branches[0].id);
      const res: any = await apiRequest('/imports', { method: 'POST', body: fd, isFormData: true });
      setActiveImport(res.importJob);
      setImportMapping(res.importJob.column_mapping || {});
      setImportErrors([]);
      setMsg(tr(`File read (${res.importJob.total_records} rows). Check the matching columns and select Validate.`, `Faili imesomwa (mistari ${res.importJob.total_records}). Kagua safu zinazolingana kisha chagua Hakiki.`));
      loadData();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusyImport(false);
    }
  };

  const handleValidateImport = async () => {
    if (!activeImport) return;
    setBusyImport(true);
    setErr('');
    try {
      const res = await apiRequest(`/imports/${activeImport.id}/validate`, {
        method: 'POST',
        body: { columnMapping: importMapping },
      });
      setActiveImport(res.importJob);
      setImportErrors(res.errors || []);
      setMsg(
        tr(`Checked: ${res.summary.acceptedRecords} accepted, ${res.summary.rejectedRecords} rejected (${res.summary.duplicateRecords} duplicates).`, `Imekaguliwa: ${res.summary.acceptedRecords} zimekubaliwa, ${res.summary.rejectedRecords} zimekataliwa (${res.summary.duplicateRecords} ni nakala).`),
      );
      loadData();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusyImport(false);
    }
  };

  const handleCommitImport = async () => {
    if (!activeImport) return;
    setBusyImport(true);
    setErr('');
    try {
      const res = await apiRequest(`/imports/${activeImport.id}/commit`, { method: 'POST' });
      setActiveImport(res.importJob);
      setMsg(tr(`${res.insertedCount} checked records saved.`, `Rekodi ${res.insertedCount} zilizohakikiwa zimehifadhiwa.`));
      loadData();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusyImport(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="p-eyebrow">{tr('YOUR BUSINESS RECORDS', 'REKODI ZA BIASHARA')}</div>
        <h1 className="p-title">{tr('Analytics & records', 'Uchambuzi na rekodi')}</h1>
        <p className="p-subtitle">{tr('Review your sales, expenses and stock, or bring in records from a file.', 'Kagua mauzo, matumizi na stoo, au pakia rekodi kutoka kwenye faili.')}</p>
      </div>
      <div className="analytics-tabs" role="tablist" aria-label={tr('Record categories', 'Aina za rekodi')}>
        {[
          { id: 'sales', label: tr('Sales', 'Mauzo'), icon: Receipt, ok: hasPermission('sales:read') },
          { id: 'inventory', label: tr('Inventory', 'Stoo'), icon: Package, ok: hasPermission('inventory:read') },
          { id: 'finance', label: tr('Expenses', 'Matumizi'), icon: Wallet, ok: hasPermission('finance:read') },
          { id: 'imports', label: tr('Imports', 'Faili'), icon: FileUp, ok: hasPermission('imports:read') },
          { id: 'website', label: tr('Website sync', 'Unganisha tovuti'), icon: Globe, ok: hasPermission('analytics:read') },
        ].filter((item) => item.ok).map((item) => {
          const Icon = item.icon;
          return <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} onClick={() => switchTab(item.id as typeof tab)} className={tab === item.id ? 'active' : ''}><Icon size={15} />{item.label}</button>;
        })}
      </div>
      {!allowedTabs.length && <div className="p-panel p-6 p-empty">{tr('No record sections are available for your role.', 'Hakuna sehemu za rekodi zinazopatikana kwa jukumu lako.')}</div>}
      {dataLoading && <div className="p-panel p-6 p-empty" role="status">{tr('Loading records…', 'Inapakia rekodi…')}</div>}
      {loadError && <div className="p-alert p-alert-error" role="alert"><AlertCircle size={17} /><span className="flex-1">{tr('Could not load records.', 'Imeshindikana kupakia rekodi.')} {loadError}</span><button type="button" className="underline" onClick={loadData}>{tr('Try again', 'Jaribu tena')}</button></div>}

      {msg && <div className="p-3.5 rounded-xl bg-teal-50 border border-teal-200 text-teal-900 text-xs font-medium">{msg}</div>}
      {err && <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">{err}</div>}

      {/* SALES TAB */}
      {!dataLoading && !loadError && allowedTabs.includes(tab) && tab === 'sales' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-navy-950">{tr('Recent sales', 'Mauzo ya hivi karibuni')} ({sales.length})</h2>
            <span className="text-xs text-slate-400">{tr('Historical sales cannot be deleted; use traceable reversals', 'Mauzo ya awali hayafutwi; tumia njia ya kurejesha mauzo')}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-100 text-slate-400 text-left">
                  <th className="pb-2.5">{tr('Reference', 'Kumbukumbu')}</th>
                  <th className="pb-2.5">{tr('Date', 'Tarehe')}</th>
                  <th className="pb-2.5">{tr('Branch', 'Tawi')}</th>
                  <th className="pb-2.5">{tr('Customer', 'Mteja')}</th>
                  <th className="pb-2.5">{tr('Payment', 'Malipo')}</th>
                  <th className="pb-2.5 text-right">{tr('Total (KES)', 'Jumla (KES)')}</th>
                  <th className="pb-2.5 text-right">{tr('Status', 'Hali')}</th>
                  <th className="pb-2.5 text-right">{tr('Action', 'Hatua')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {!sales.length && <tr><td colSpan={8} className="py-8 text-center text-slate-400">{tr('No sales records yet.', 'Bado hakuna rekodi za mauzo.')} {hasPermission('imports:read') && <Link className="text-teal-600 font-semibold" to="/app/analytics?tab=imports">{tr('Import records', 'Pakia rekodi')} →</Link>}</td></tr>}
                {sales.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50/70">
                    <td className="py-2.5 font-mono text-[11px] font-semibold text-navy-950">{s.transaction_ref}</td>
                    <td className="py-2.5 text-slate-600">{new Date(s.transaction_date).toLocaleDateString('en-KE')}</td>
                    <td className="py-2.5 text-slate-700">{s.branch_name}</td>
                    <td className="py-2.5 text-slate-600">{s.customer_name || tr('Walk-in', 'Mteja wa dukani')}</td>
                    <td className="py-2.5 uppercase text-[10px] font-semibold text-slate-500">{s.payment_method === 'multiple' ? tr('Multiple', 'Nyingi') : s.payment_method || tr('Not recorded', 'Haijawekwa')}</td>
                    <td className="py-2.5 text-right font-semibold text-navy-950">{formatKes(s.total_amount)}</td>
                    <td className="py-2.5 text-right">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          s.payment_status === 'reversed' ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'
                        }`}
                      >
                        {s.payment_status}
                      </span>
                    </td>
                    <td className="py-2.5 text-right">
                      {hasPermission('sales:write') && s.payment_status !== 'reversed' && (
                        <button
                          type="button"
                          onClick={() => handleReverseSale(s.id)}
                          className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-rose-700"
                          title="Record traceable sales return"
                        >
                          <RotateCcw className="w-3 h-3" /> {tr('Reverse', 'Rejesha')}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* INVENTORY TAB */}
      {!dataLoading && !loadError && allowedTabs.includes(tab) && tab === 'inventory' && (
        <div className="space-y-5">
          {hasPermission('inventory:write') && invData.inventory.length > 0 && (
            <form onSubmit={handleAdjustStock} className="bg-white border border-slate-200 rounded-2xl p-5 grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
              <div className="md:col-span-2">
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">{tr('Product & Branch', 'Bidhaa na tawi')}</label>
                <select
                  required
                  value={`${adjForm.branchId}|${adjForm.productId}`}
                  onChange={(e) => {
                    const [branchId, productId] = e.target.value.split('|');
                    setAdjForm({ ...adjForm, branchId, productId });
                  }}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white"
                >
                  <option value="|">{tr('Select SKU to adjust...', 'Chagua bidhaa ya kurekebisha...')}</option>
                  {invData.inventory.map((it: any) => (
                    <option key={`${it.branch_id}-${it.product_id}`} value={`${it.branch_id}|${it.product_id}`}>
                      {it.product_name} ({it.branch_name} — {it.available_quantity} avail)
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">{tr('Qty Delta (+/-)', 'Mabadiliko ya idadi (+/-)')}</label>
                <input
                  type="number"
                  required
                  value={adjForm.adjustmentQuantity}
                  onChange={(e) => setAdjForm({ ...adjForm, adjustmentQuantity: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">{tr('Reason Code', 'Sababu')}</label>
                <select
                  value={adjForm.reasonCode}
                  onChange={(e) => setAdjForm({ ...adjForm, reasonCode: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white"
                >
                  <option value="recount">{tr('Physical Recount', 'Hesabu upya')}</option>
                  <option value="damaged">{tr('Damaged', 'Imeharibika')}</option>
                  <option value="expired">{tr('Expired', 'Muda umeisha')}</option>
                  <option value="shrinkage">{tr('Shrinkage', 'Upungufu')}</option>
                  <option value="reversal">{tr('Reversal', 'Rejesho')}</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">{tr('Audit Notes *', 'Maelezo *')}</label>
                <input
                  required
                  placeholder={tr('e.g. Delivery received', 'mf. Bidhaa zimewasili')}
                  value={adjForm.notes}
                  onChange={(e) => setAdjForm({ ...adjForm, notes: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg"
                />
              </div>
              <button type="submit" className="py-2 px-4 rounded-lg bg-navy-950 text-white text-xs font-semibold hover:bg-navy-800">
                {tr('Save adjustment', 'Hifadhi marekebisho')}
              </button>
            </form>
          )}

          <div className="bg-white border border-slate-200 rounded-2xl p-5 overflow-x-auto">
            <h2 className="text-sm font-bold text-navy-950 mb-3">{tr('Live Stock Balances (Available = On-Hand − Reserved)', 'Hali ya stoo (inayopatikana = iliyopo − iliyotengwa)')}</h2>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-100 text-slate-400 text-left">
                  <th className="pb-2">{tr('SKU / Product', 'Namba / Bidhaa')}</th>
                  <th className="pb-2">{tr('Branch', 'Tawi')}</th>
                  <th className="pb-2 text-right">{tr('On Hand', 'Iliyopo')}</th>
                  <th className="pb-2 text-right">{tr('Available', 'Inayopatikana')}</th>
                  <th className="pb-2 text-right">{tr('Reorder At', 'Agiza ikifikia')}</th>
                  {hasPermission('finance:read') && <th className="pb-2 text-right">{tr('Stock Value', 'Thamani ya stoo')}</th>}
                  <th className="pb-2 text-right">{tr('Status', 'Hali')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {!invData.inventory.length && <tr><td colSpan={7} className="py-8 text-center text-slate-400">{tr('No inventory records yet.', 'Bado hakuna rekodi za stoo.')}</td></tr>}
                {invData.inventory.map((it: any) => (
                  <tr key={`${it.branch_id}-${it.product_id}`}>
                    <td className="py-2.5">
                      <div className="font-semibold text-navy-950">{it.product_name}</div>
                      <div className="text-[11px] text-slate-400">{it.sku} · {it.category_name}</div>
                    </td>
                    <td className="py-2.5 text-slate-600">{it.branch_name}</td>
                    <td className="py-2.5 text-right">{it.on_hand_quantity}</td>
                    <td className="py-2.5 text-right font-semibold">{it.available_quantity}</td>
                    <td className="py-2.5 text-right text-slate-500">{it.reorder_level}</td>
                    {hasPermission('finance:read') && <td className="py-2.5 text-right">{formatKes(it.inventory_value_cost)}</td>}
                    <td className="py-2.5 text-right">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${
                          it.stock_status === 'stockout'
                            ? 'bg-rose-100 text-rose-700'
                            : it.stock_status === 'low_stock'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-emerald-50 text-emerald-700'
                        }`}
                      >
                        {it.stock_status.replace('_', ' ')}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* FINANCE & M-PESA TAB */}
      {!dataLoading && !loadError && allowedTabs.includes(tab) && tab === 'finance' && (
        <div className="space-y-5">
          {hasPermission('finance:write') && (
            <form onSubmit={handleCreateExpense} className="bg-white border border-slate-200 rounded-2xl p-5 grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">{tr('Vendor *', 'Muuzaji *')}</label>
                <input required value={expForm.vendorName} onChange={(e) => setExpForm({ ...expForm, vendorName: e.target.value })} placeholder="Kenya Power" className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">{tr('Description *', 'Maelezo *')}</label>
                <input required value={expForm.description} onChange={(e) => setExpForm({ ...expForm, description: e.target.value })} placeholder={tr('e.g. Monthly electricity', 'mf. Umeme wa mwezi')} className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg" />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">{tr('Category', 'Aina')}</label>
                <select value={expForm.categoryId} onChange={(e) => setExpForm({ ...expForm, categoryId: e.target.value })} className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white">
                  <option value="">{tr('General', 'Jumla')}</option>
                  {finData.categories.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">{tr('Amount (KES) *', 'Kiasi (KES) *')}</label>
                <input type="number" required min="1" value={expForm.amount} onChange={(e) => setExpForm({ ...expForm, amount: e.target.value })} placeholder="8500" className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg" />
              </div>
              <button type="submit" className="py-2 px-4 rounded-lg bg-navy-950 text-white text-xs font-semibold">{tr('Record Expense', 'Rekodi matumizi')}</button>
            </form>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="bg-white border border-slate-200 rounded-2xl p-5 overflow-x-auto">
              <h2 className="text-sm font-bold text-navy-950 mb-3">{tr('M-Pesa & Cash Reconciliation Queue', 'Ulinganisho wa M-Pesa na pesa taslimu')}</h2>
              <p className="text-[11px] text-slate-500 mb-3">{tr('Distinguishes recorded transactions from verified reconciled receipts.', 'Linganisha miamala iliyorekodiwa na risiti zilizothibitishwa.')}</p>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-400 text-left">
                    <th className="pb-2">{tr('Receipt / Account', 'Risiti / Akaunti')}</th>
                    <th className="pb-2 text-right">{tr('Amount', 'Kiasi')}</th>
                    <th className="pb-2 text-right">{tr('Status', 'Hali')}</th>
                    <th className="pb-2 text-right">{tr('Action', 'Hatua')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {finData.cashTransactions.slice(0, 14).map((tx: any) => (
                    <tr key={tx.id}>
                      <td className="py-2">
                        <div className="font-mono text-[11px] font-semibold text-navy-950">{tx.mpesa_receipt_no || tx.counterparty}</div>
                        <div className="text-[10px] text-slate-400">{tx.account_name} · {tx.direction}</div>
                      </td>
                      <td className={`py-2 text-right font-semibold ${tx.direction === 'inflow' ? 'text-emerald-700' : 'text-rose-700'}`}>
                        {tx.direction === 'inflow' ? '+' : '-'}{formatKes(tx.amount)}
                      </td>
                      <td className="py-2 text-right">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${tx.record_status === 'reconciled' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>
                          {tx.record_status}
                        </span>
                      </td>
                      <td className="py-2 text-right">
                        {tx.record_status !== 'reconciled' && hasPermission('finance:write') && (
                          <button type="button" onClick={() => handleReconcileTx(tx.id)} className="text-[11px] font-semibold text-teal-700 hover:underline">
                            Reconcile
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-5 overflow-x-auto">
              <h2 className="text-sm font-bold text-navy-950 mb-3">{tr('Recorded Operating Expenses', 'Matumizi yaliyorekodiwa')}</h2>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-400 text-left">
                    <th className="pb-2">{tr('Date', 'Tarehe')}</th>
                    <th className="pb-2">{tr('Vendor / Description', 'Muuzaji / Maelezo')}</th>
                    <th className="pb-2 text-right">{tr('Amount', 'Kiasi')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {finData.expenses.slice(0, 14).map((e: any) => (
                    <tr key={e.id}>
                      <td className="py-2 text-slate-500">{String(e.expense_date).slice(0, 10)}</td>
                      <td className="py-2">
                        <div className="font-semibold text-navy-950">{e.vendor_name}</div>
                        <div className="text-[11px] text-slate-400">{e.category_name || 'General'} · {e.description}</div>
                      </td>
                      <td className="py-2 text-right font-semibold text-navy-950">{formatKes(e.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* CSV / EXCEL IMPORT PIPELINE TAB */}
      {!dataLoading && !loadError && allowedTabs.includes(tab) && tab === 'imports' && (
        <div className="space-y-5">
          {uploadableDatasets.length > 0 ? <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-navy-950">{tr('1. Upload CSV, Excel (.xlsx), or JSON File', '1. Pakia faili ya CSV, Excel (.xlsx), au JSON')}</h2>
                <p className="text-xs text-slate-500">{tr('Every file passes security inspection, column detection, duplicate detection, and row-level validation.', 'Kila faili hukaguliwa kwa usalama, safu, nakala na usahihi wa rekodi.')}</p>
              </div>
              <select
                value={datasetType}
                onChange={(e) => setDatasetType(e.target.value)}
                className="px-3 py-2 text-xs font-semibold border border-slate-200 rounded-lg bg-white"
              >
                {uploadableDatasets.map((dataset) => <option key={dataset.code} value={dataset.code}>{dataset.label}</option>)}
              </select>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <label className="cursor-pointer inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-navy-950 text-white text-xs font-semibold hover:bg-navy-800">
                <FileUp className="w-4 h-4" />
                {tr('Choose a file', 'Chagua faili')}
                <input
                  type="file"
                  accept=".csv,.xlsx,.xls,.json"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) uploadFile(f);
                  }}
                />
              </label>

              <button
                type="button"
                onClick={downloadCsvTemplate}
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-xs font-semibold hover:bg-slate-50"
              >
                {tr('Download CSV template', 'Pakua kiolezo cha CSV')}
              </button>
            </div>
          </div> : <div className="p-panel p-5 p-panel-note">{tr('Your role can view import history but cannot upload records.', 'Jukumu lako linaweza kuona historia ya faili lakini haliwezi kupakia rekodi.')}</div>}

          {activeImport && (
            <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-teal-600">
                    {tr('Current file · Status', 'Faili ya sasa · Hali')}: {activeImport.status}
                  </div>
                  <div className="text-sm font-bold text-navy-950 mt-0.5">
                    {tr(`${activeImport.total_records} rows · ${activeImport.accepted_records} accepted · ${activeImport.rejected_records} rejected · ${activeImport.duplicate_records} duplicates`, `${activeImport.total_records} mistari · ${activeImport.accepted_records} imekubaliwa · ${activeImport.rejected_records} imekataliwa · ${activeImport.duplicate_records} ni nakala`)}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={busyImport}
                    onClick={handleValidateImport}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold"
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> {tr('2. Validate rows', '2. Hakiki mistari')}
                  </button>
                  {activeImport.status === 'validated' && activeImport.accepted_records > 0 && (
                    <button
                      type="button"
                      disabled={busyImport}
                      onClick={handleCommitImport}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-teal-600 text-white text-xs font-semibold hover:bg-teal-700"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" /> {tr(`3. Save ${activeImport.accepted_records} valid rows`, `3. Hifadhi mistari ${activeImport.accepted_records} sahihi`)}
                    </button>
                  )}
                </div>
              </div>

              {/* Editable Column Mapping */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                {Object.entries(importMapping).map(([target, src]) => (
                  <div key={target}>
                    <label className="block text-[10px] font-semibold uppercase text-slate-400 mb-1">{target}</label>
                    <select
                      value={src}
                      onChange={(e) => setImportMapping({ ...importMapping, [target]: e.target.value })}
                      className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-white"
                    >
                      <option value="">{tr('-- unmapped --', '-- haijalinganishwa --')}</option>
                      {(activeImport.detected_columns || []).map((col: string) => (
                        <option key={col} value={col}>{col}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              {/* Validation Error Table (Never silently discards bad rows!) */}
              {importErrors.length > 0 && (
                <div className="p-4 rounded-xl bg-rose-50/70 border border-rose-200 space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-rose-800">
                    <AlertCircle className="w-4 h-4" /> {tr(`Rows to review (${importErrors.length})`, `Mistari ya kukagua (${importErrors.length})`)}
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-rose-900">
                      <thead>
                        <tr className="border-b border-rose-200 text-left text-[11px]">
                          <th className="pb-1.5">{tr('Row #', 'Safu #')}</th>
                          <th className="pb-1.5">{tr('Column', 'Safu')}</th>
                          <th className="pb-1.5">{tr('Code', 'Msimbo')}</th>
                          <th className="pb-1.5">{tr('Explanation', 'Maelezo')}</th>
                          <th className="pb-1.5">{tr('Raw Value', 'Thamani ya awali')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-rose-200/60">
                        {importErrors.map((er) => (
                          <tr key={er.id}>
                            <td className="py-1.5 font-mono">{er.row_number}</td>
                            <td className="py-1.5">{er.column_name}</td>
                            <td className="py-1.5 font-semibold">{er.error_code}</td>
                            <td className="py-1.5">{er.error_message}</td>
                            <td className="py-1.5 font-mono">{er.raw_value}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Import History */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 overflow-x-auto">
            <h3 className="text-sm font-bold text-navy-950 mb-3">{tr('Import Provenance History', 'Historia ya faili')}</h3>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-100 text-slate-400 text-left">
                  <th className="pb-2">{tr('File', 'Faili')}</th>
                  <th className="pb-2">{tr('Dataset', 'Aina ya data')}</th>
                  <th className="pb-2">{tr('Status', 'Hali')}</th>
                  <th className="pb-2 text-right">{tr('Accepted / Total', 'Zilizokubaliwa / Jumla')}</th>
                  <th className="pb-2 text-right">{tr('Quality', 'Ubora')}</th>
                  <th className="pb-2 text-right">{tr('Created', 'Tarehe')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {imports.map((j) => (
                  <tr key={j.id} className="hover:bg-slate-50">
                    <td className="py-2 font-medium text-navy-950">{j.original_filename || j.id.slice(0, 8)}</td>
                    <td className="py-2 uppercase text-[10px] font-semibold text-slate-500">{j.dataset_type}</td>
                    <td className="py-2">{j.status}</td>
                    <td className="py-2 text-right">{j.accepted_records} / {j.total_records}</td>
                    <td className="py-2 text-right font-semibold text-teal-700">{j.quality_score ? `${j.quality_score}%` : '—'}</td>
                    <td className="py-2 text-right text-slate-400">{new Date(j.created_at).toLocaleString('en-KE')}</td>
                  </tr>
                ))}
                {imports.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-slate-400">{tr('No spreadsheet imports yet. Upload a CSV/XLSX above to begin.', 'Bado hakuna faili. Pakia CSV/XLSX hapo juu kuanza.')}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* BUSINESS WEBSITE URL FETCH, ANALYSIS & ONE-CLICK CATALOG IMPORT */}
      {!dataLoading && !loadError && allowedTabs.includes(tab) && tab === 'website' && (
        <div className="space-y-5">
          <div className="bg-[#041527] text-white rounded-2xl p-6 border border-[#2ED3C2]/25 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-[#2ED3C2] flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5" /> {tr('BUSINESS WEBSITE', 'TOVUTI YA BIASHARA')}
                </div>
                <h2 className="text-lg font-extrabold text-white mt-1">
                  {tr('Review your public website catalog', 'Kagua bidhaa za tovuti yako')}
                </h2>
                <p className="text-xs text-slate-300 mt-1 max-w-2xl">
                  {tr('Enter a public website or product feed to review the items and prices found. You can choose whether to import eligible KES-priced items.', 'Weka tovuti ya wazi au faili ya bidhaa ili kukagua bidhaa na bei zilizopatikana. Unaweza kuchagua kuingiza bidhaa zenye bei ya KES.')}
                </p>
              </div>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleAnalyzeWebsite(false);
              }}
              className="flex flex-col sm:flex-row gap-2.5"
            >
              <input
                type="text"
                aria-label={tr('Business website URL', 'Anwani ya tovuti ya biashara')}
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
                placeholder="https://yourbusiness.co.ke"
                className="flex-1 px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-sm text-white placeholder:text-slate-400 focus:outline-none focus:border-[#2ED3C2]"
              />
              <button
                type="submit"
                disabled={websiteBusy}
                className="inline-flex items-center justify-center gap-1.5 px-5 py-3 rounded-xl bg-[#2ED3C2] text-[#041527] text-xs font-extrabold hover:bg-[#5ce2d4] disabled:opacity-50 shrink-0"
              >
                <Sparkles className="w-4 h-4" />
                {websiteBusy ? tr('Checking…', 'Inakagua…') : tr('Review website', 'Kagua tovuti')}
              </button>
            </form>
          </div>

          {websiteResult && (
            <div className="space-y-5">
              {/* KPI Summary Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                  <div className="text-[11px] font-semibold text-slate-400 uppercase">{tr('Website & Platform', 'Tovuti na mfumo')}</div>
                  <div className="text-sm font-extrabold text-navy-950 mt-1 truncate">{websiteResult.business_profile?.name}</div>
                  <div className="text-xs text-teal-700 font-semibold mt-0.5">{websiteResult.business_profile?.platform}</div>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                  <div className="text-[11px] font-semibold text-slate-400 uppercase">{tr('Catalog Items Extracted', 'Bidhaa zilizopatikana')}</div>
                  <div className="text-2xl font-extrabold text-navy-950 mt-0.5">
                    {websiteResult.pricing_stats?.total_items_found || 0}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {websiteResult.pricing_stats?.priced_items_count || 0} {tr('with a detected price', 'zina bei iliyopatikana')}
                  </div>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                  <div className="text-[11px] font-semibold text-slate-400 uppercase">{tr('Median / Price Range', 'Wastani / Wigo wa bei')}</div>
                  <div className="text-lg font-extrabold text-teal-700 mt-0.5">
                    {websiteResult.pricing_stats?.median_price
                      ? `${websiteResult.pricing_stats.currency} ${Math.round(websiteResult.pricing_stats.median_price).toLocaleString()}`
                      : '—'}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {websiteResult.pricing_stats?.min_price
                      ? `Min ${Math.round(websiteResult.pricing_stats.min_price).toLocaleString()} · Max ${Math.round(websiteResult.pricing_stats.max_price).toLocaleString()}`
                      : tr('Prices unavailable or currencies differ', 'Bei hazipatikani au sarafu zinatofautiana')}
                  </div>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                  <div className="text-[11px] font-semibold text-slate-400 uppercase">{tr('Digital Readiness Score', 'Alama ya utayari wa kidijitali')}</div>
                  <div className="text-2xl font-extrabold text-navy-950 mt-0.5">
                    {websiteResult.business_profile?.readiness_score || 0}
                    <span className="text-xs font-semibold text-slate-400">/100</span>
                  </div>
                  <div className="text-[11px] text-slate-500">
                    WhatsApp: {websiteResult.business_profile?.has_whatsapp_link ? tr('Link found', 'Kiungo kimepatikana') : tr('No link found', 'Hakuna kiungo kilichopatikana')}
                  </div>
                </div>
              </div>

              {/* Pie Charts + Insights */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                <div className="bg-white border border-slate-200 rounded-2xl p-5">
                  <h3 className="text-sm font-bold text-navy-950 mb-1">{tr('Catalog Categories Pie', 'Mgawanyo wa aina za bidhaa')}</h3>
                  <p className="text-xs text-slate-400 mb-3">{tr('Item distribution by detected category', 'Mgawanyo wa bidhaa kwa aina')}</p>
                  {websiteResult.charts?.category_pie?.length > 0 ? (
                    <div className="h-52">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={websiteResult.charts.category_pie}
                            dataKey="value"
                            nameKey="label"
                            cx="50%"
                            cy="50%"
                            innerRadius={40}
                            outerRadius={70}
                            paddingAngle={3}
                            stroke="#142b48"
                            isAnimationActive={false}
                          >
                            {websiteResult.charts.category_pie.map((_: any, idx: number) => (
                              <Cell key={idx} fill={PORTAL_CHART_COLORS[idx % PORTAL_CHART_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip />
                          <Legend wrapperStyle={{ fontSize: 11 }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="h-44 flex items-center justify-center text-xs text-slate-400">{tr('No category clusters detected.', 'Hakuna aina za bidhaa zilizopatikana.')}</div>
                  )}
                </div>

                <div className="bg-white border border-slate-200 rounded-2xl p-5">
                  <h3 className="text-sm font-bold text-navy-950 mb-1">{tr('Price-Tier Distribution Pie', 'Mgawanyo wa viwango vya bei')}</h3>
                  <p className="text-xs text-slate-400 mb-3">{tr('Budget vs Mid-Tier vs Premium offerings', 'Bidhaa za bei ya chini, kati na juu')}</p>
                  {websiteResult.charts?.price_tier_pie?.length > 0 ? (
                    <div className="h-52">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={websiteResult.charts.price_tier_pie}
                            dataKey="value"
                            nameKey="label"
                            cx="50%"
                            cy="50%"
                            innerRadius={40}
                            outerRadius={70}
                            paddingAngle={3}
                            stroke="#142b48"
                            isAnimationActive={false}
                          >
                            {websiteResult.charts.price_tier_pie.map((_: any, idx: number) => (
                              <Cell key={idx} fill={PORTAL_CHART_COLORS[(idx + 1) % PORTAL_CHART_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip />
                          <Legend wrapperStyle={{ fontSize: 11 }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="h-44 flex items-center justify-center text-xs text-slate-400">{tr('No priced items detected on page.', 'Hakuna bei za bidhaa zilizopatikana.')}</div>
                  )}
                </div>

                <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
                  <h3 className="text-sm font-bold text-navy-950">{tr('Data Scientist Website Insights', 'Uchambuzi wa tovuti')}</h3>
                  <ul className="space-y-2 text-xs text-slate-700">
                    {(language === 'sw' && websiteResult.insights_sw ? websiteResult.insights_sw : websiteResult.insights || []).map((ins: string, idx: number) => (
                      <li key={idx} className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0 mt-0.5" />
                        <span>{ins}</span>
                      </li>
                    ))}
                  </ul>
                  {websiteResult.products?.some((item: any) => item.currency === 'KES' && Number(item.price) > 0) && hasPermission('inventory:write') && hasPermission('imports:manage') && (
                    <button
                      type="button"
                      disabled={websiteBusy}
                      onClick={() => handleAnalyzeWebsite(true, websiteResult.url)}
                      className="w-full py-2.5 rounded-xl bg-[#041527] text-[#2ED3C2] text-xs font-bold hover:bg-navy-800"
                    >
                      {tr('Import or update KES-priced items', 'Ingiza au sasisha bidhaa zenye bei ya KES')}
                    </button>
                  )}
                </div>
              </div>

              <p className="p-panel-note">{tr('Only an explicit positive KES price can be imported. Products not created by this website source are not overwritten. No purchase costs or stock counts are inferred.', 'Ni bei ya KES iliyoonyeshwa wazi pekee inayoweza kuingizwa. Bidhaa zisizotoka kwenye chanzo hiki hazitabadilishwa. Gharama na kiasi cha stoo havikadiriwi.')}</p>
              {/* Extracted Products Table */}
              {websiteResult.products?.length > 0 && (
                <div className="bg-white border border-slate-200 rounded-2xl p-5 overflow-x-auto">
                  <h3 className="text-sm font-bold text-navy-950 mb-3">
                    {tr('Items found on the website', 'Bidhaa zilizopatikana kwenye tovuti')} ({websiteResult.products.length})
                  </h3>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-100 text-slate-400 text-left">
                        <th className="pb-2">{tr('Product / Service', 'Bidhaa / Huduma')}</th>
                        <th className="pb-2">{tr('SKU', 'Namba ya bidhaa')}</th>
                        <th className="pb-2">{tr('Category', 'Aina')}</th>
                        <th className="pb-2 text-right">{tr('Listed Price', 'Bei iliyoonyeshwa')}</th>
                        <th className="pb-2 text-right">{tr('Source', 'Chanzo')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {websiteResult.products.slice(0, 50).map((item: any, idx: number) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="py-2 font-semibold text-navy-950">{item.name}</td>
                          <td className="py-2 font-mono text-slate-500">{item.sku || '—'}</td>
                          <td className="py-2 text-slate-600">{item.category || 'General'}</td>
                          <td className="py-2 text-right font-bold text-teal-700">
                            {item.price ? `${item.currency || tr('Currency unspecified', 'Sarafu haijawekwa')} ${Number(item.price).toLocaleString()}` : '—'}
                          </td>
                          <td className="py-2 text-right text-[10px] uppercase text-slate-400">{item.source}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Previously Synced Websites */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5">
            <h3 className="text-sm font-bold text-navy-950 mb-3">{tr('Connected Business Websites', 'Tovuti zilizounganishwa')}</h3>
            {websiteSources.length > 0 ? (
              <div className="space-y-2.5">
                {websiteSources.map((src) => (
                  <div key={src.id} className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-bold text-navy-950">{src.name}</div>
                      <div className="text-[11px] text-slate-500">
                        {src.config?.url} · {src.config?.pricing_stats?.total_items_found || 0} {tr('items', 'bidhaa')} · {tr('Readiness', 'Utayari')}{' '}
                        {src.config?.business_profile?.readiness_score || 0}/100 · {tr('Checked', 'Imekaguliwa')}{' '}
                        {src.last_synced_at ? new Date(src.last_synced_at).toLocaleString('en-KE') : tr('recently', 'hivi karibuni')}
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={websiteBusy}
                      onClick={() => handleAnalyzeWebsite(false, src.config?.url)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-semibold text-navy-950 hover:border-teal-500"
                    >
                      <RefreshCw className="w-3.5 h-3.5 text-teal-600" /> {tr('Check again', 'Kagua tena')}
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400">
                {tr('No website source has been saved yet. Import eligible items to save one.', 'Bado hakuna chanzo cha tovuti kilichohifadhiwa. Ingiza bidhaa zinazokubalika ili kuhifadhi chanzo.')}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
