import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  CheckCircle2,
  FileUp,
  Package,
  Receipt,
  RefreshCw,
  RotateCcw,
  Wallet,
} from 'lucide-react';
import { apiRequest } from '../../services/api';
import { useAuth } from '../../stores/authStore';
import { formatKes } from '../../i18n/translations';

const SALES_CSV_TEMPLATE = `receipt_no,date,product,quantity,total,payment_method\n`;

export const AnalyticsPage: React.FC = () => {
  const { branches, selectedBranchId, hasPermission } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = (searchParams.get('tab') as any) || 'sales';
  const [tab, setTab] = useState<'sales' | 'inventory' | 'finance' | 'imports'>(initialTab);

  const [sales, setSales] = useState<any[]>([]);
  const [invData, setInvData] = useState<any>({ inventory: [], alerts: [], recentMovements: [] });
  const [finData, setFinData] = useState<any>({ expenses: [], categories: [], cashTransactions: [], reconciliationSummary: [], payables: [] });
  const [imports, setImports] = useState<any[]>([]);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

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

  const switchTab = (next: 'sales' | 'inventory' | 'finance' | 'imports') => {
    setTab(next);
    setSearchParams({ tab: next });
    setMsg('');
    setErr('');
  };

  const loadData = async () => {
    setErr('');
    try {
      if (tab === 'sales' && hasPermission('sales:read')) {
        const res = await apiRequest(`/sales?branchId=${encodeURIComponent(selectedBranchId)}&limit=60`);
        setSales(res.sales || []);
      } else if (tab === 'inventory' && hasPermission('inventory:read')) {
        const res = await apiRequest(`/inventory?branchId=${encodeURIComponent(selectedBranchId)}`);
        setInvData(res);
      } else if (tab === 'finance' && hasPermission('finance:read')) {
        const res = await apiRequest(`/finance/overview?branchId=${encodeURIComponent(selectedBranchId)}`);
        setFinData(res);
      } else if (tab === 'imports' && hasPermission('imports:read')) {
        const res = await apiRequest('/imports');
        setImports(res.imports || []);
      }
    } catch (e: any) {
      setErr(e.message);
    }
  };

  useEffect(() => {
    loadData();
  }, [tab, selectedBranchId]);

  const handleReverseSale = async (saleId: string) => {
    const reason = window.prompt('Enter audit reason for traceable sale reversal (original record is preserved):', 'Customer returned unopened item');
    if (!reason) return;
    try {
      await apiRequest(`/sales/${saleId}/return`, { method: 'POST', body: { reason } });
      setMsg('Traceable sales return recorded and stock restored via immutable movement ledger.');
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
      setMsg('Auditable stock adjustment recorded in immutable inventory ledger.');
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
      setMsg('Expense recorded successfully.');
      setExpForm({ ...expForm, vendorName: '', description: '', amount: '' });
      loadData();
    } catch (e: any) {
      setErr(e.message);
    }
  };

  const handleReconcileTx = async (txId: string) => {
    try {
      await apiRequest(`/finance/reconcile/${txId}`, { method: 'POST' });
      setMsg('M-Pesa / Cash transaction marked as reconciled.');
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
      setMsg(`File inspected & parsed (${res.importJob.total_records} rows). Review field mappings and click Validate.`);
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
        `Validation complete: ${res.summary.acceptedRecords} accepted, ${res.summary.rejectedRecords} rejected (${res.summary.duplicateRecords} duplicates). Quality score: ${res.summary.qualityScore}%.`,
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
      setMsg(`Committed ${res.insertedCount} validated records to PostgreSQL and refreshed analytics views!`);
      loadData();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusyImport(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-navy-950">BizWave Analytics — Record &amp; Analyse</h1>
          <p className="text-sm text-slate-500">
            Record or import sales, M-Pesa logs, stock, and expenses for KPIs &amp; decision making (no customer payments are processed here).
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5 bg-white p-1 rounded-xl border border-slate-200">
          {[
            { id: 'sales', label: 'Sales Ledger', icon: Receipt, ok: hasPermission('sales:read') },
            { id: 'inventory', label: 'Inventory & Stock', icon: Package, ok: hasPermission('inventory:read') },
            { id: 'finance', label: 'Expenses & M-Pesa', icon: Wallet, ok: hasPermission('finance:read') },
            { id: 'imports', label: 'CSV / Excel Imports', icon: FileUp, ok: hasPermission('imports:read') },
          ]
            .filter((t) => t.ok)
            .map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => switchTab(t.id as any)}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors ${
                    tab === t.id ? 'bg-navy-950 text-white' : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {t.label}
                </button>
              );
            })}
        </div>
      </div>

      {msg && <div className="p-3.5 rounded-xl bg-teal-50 border border-teal-200 text-teal-900 text-xs font-medium">{msg}</div>}
      {err && <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">{err}</div>}

      {/* SALES TAB */}
      {tab === 'sales' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-navy-950">Recent Transactions ({sales.length})</h2>
            <span className="text-xs text-slate-400">Historical sales cannot be deleted; use traceable reversals</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-100 text-slate-400 text-left">
                  <th className="pb-2.5">Reference</th>
                  <th className="pb-2.5">Date</th>
                  <th className="pb-2.5">Branch</th>
                  <th className="pb-2.5">Customer</th>
                  <th className="pb-2.5">Payment</th>
                  <th className="pb-2.5 text-right">Total (KES)</th>
                  <th className="pb-2.5 text-right">Status</th>
                  <th className="pb-2.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sales.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50/70">
                    <td className="py-2.5 font-mono text-[11px] font-semibold text-navy-950">{s.transaction_ref}</td>
                    <td className="py-2.5 text-slate-600">{new Date(s.transaction_date).toLocaleDateString('en-KE')}</td>
                    <td className="py-2.5 text-slate-700">{s.branch_name}</td>
                    <td className="py-2.5 text-slate-600">{s.customer_name || 'Walk-in'}</td>
                    <td className="py-2.5 uppercase text-[10px] font-semibold text-slate-500">{s.payment_method || 'mpesa'}</td>
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
                          <RotateCcw className="w-3 h-3" /> Reverse
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
      {tab === 'inventory' && (
        <div className="space-y-5">
          {hasPermission('inventory:write') && invData.inventory.length > 0 && (
            <form onSubmit={handleAdjustStock} className="bg-white border border-slate-200 rounded-2xl p-5 grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
              <div className="md:col-span-2">
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Product &amp; Branch</label>
                <select
                  required
                  value={`${adjForm.branchId}|${adjForm.productId}`}
                  onChange={(e) => {
                    const [branchId, productId] = e.target.value.split('|');
                    setAdjForm({ ...adjForm, branchId, productId });
                  }}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white"
                >
                  <option value="|">Select SKU to adjust...</option>
                  {invData.inventory.map((it: any) => (
                    <option key={`${it.branch_id}-${it.product_id}`} value={`${it.branch_id}|${it.product_id}`}>
                      {it.product_name} ({it.branch_name} — {it.available_quantity} avail)
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Qty Delta (+/-)</label>
                <input
                  type="number"
                  required
                  value={adjForm.adjustmentQuantity}
                  onChange={(e) => setAdjForm({ ...adjForm, adjustmentQuantity: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Reason Code</label>
                <select
                  value={adjForm.reasonCode}
                  onChange={(e) => setAdjForm({ ...adjForm, reasonCode: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white"
                >
                  <option value="recount">Physical Recount</option>
                  <option value="damaged">Damaged</option>
                  <option value="expired">Expired</option>
                  <option value="shrinkage">Shrinkage</option>
                  <option value="reversal">Reversal</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Audit Notes *</label>
                <input
                  required
                  placeholder="e.g. Restock delivery received"
                  value={adjForm.notes}
                  onChange={(e) => setAdjForm({ ...adjForm, notes: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg"
                />
              </div>
              <button type="submit" className="py-2 px-4 rounded-lg bg-navy-950 text-white text-xs font-semibold hover:bg-navy-800">
                Record Adjustment
              </button>
            </form>
          )}

          <div className="bg-white border border-slate-200 rounded-2xl p-5 overflow-x-auto">
            <h2 className="text-sm font-bold text-navy-950 mb-3">Live Stock Balances (Available = On-Hand − Reserved)</h2>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-100 text-slate-400 text-left">
                  <th className="pb-2">SKU / Product</th>
                  <th className="pb-2">Branch</th>
                  <th className="pb-2 text-right">On Hand</th>
                  <th className="pb-2 text-right">Available</th>
                  <th className="pb-2 text-right">Reorder At</th>
                  <th className="pb-2 text-right">Stock Value</th>
                  <th className="pb-2 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
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
                    <td className="py-2.5 text-right">{formatKes(it.inventory_value_cost)}</td>
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
      {tab === 'finance' && (
        <div className="space-y-5">
          {hasPermission('finance:write') && (
            <form onSubmit={handleCreateExpense} className="bg-white border border-slate-200 rounded-2xl p-5 grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Vendor *</label>
                <input required value={expForm.vendorName} onChange={(e) => setExpForm({ ...expForm, vendorName: e.target.value })} placeholder="Kenya Power" className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Description *</label>
                <input required value={expForm.description} onChange={(e) => setExpForm({ ...expForm, description: e.target.value })} placeholder="Monthly prepaid tokens" className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg" />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Category</label>
                <select value={expForm.categoryId} onChange={(e) => setExpForm({ ...expForm, categoryId: e.target.value })} className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white">
                  <option value="">General</option>
                  {finData.categories.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Amount (KES) *</label>
                <input type="number" required min="1" value={expForm.amount} onChange={(e) => setExpForm({ ...expForm, amount: e.target.value })} placeholder="8500" className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg" />
              </div>
              <button type="submit" className="py-2 px-4 rounded-lg bg-navy-950 text-white text-xs font-semibold">Record Expense</button>
            </form>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="bg-white border border-slate-200 rounded-2xl p-5 overflow-x-auto">
              <h2 className="text-sm font-bold text-navy-950 mb-3">M-Pesa &amp; Cash Reconciliation Queue</h2>
              <p className="text-[11px] text-slate-500 mb-3">Distinguishes recorded transactions from verified reconciled receipts.</p>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-400 text-left">
                    <th className="pb-2">Receipt / Account</th>
                    <th className="pb-2 text-right">Amount</th>
                    <th className="pb-2 text-right">Status</th>
                    <th className="pb-2 text-right">Action</th>
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
              <h2 className="text-sm font-bold text-navy-950 mb-3">Recorded Operating Expenses</h2>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-400 text-left">
                    <th className="pb-2">Date</th>
                    <th className="pb-2">Vendor / Description</th>
                    <th className="pb-2 text-right">Amount</th>
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
      {tab === 'imports' && (
        <div className="space-y-5">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-navy-950">1. Upload CSV, Excel (.xlsx), or JSON File</h2>
                <p className="text-xs text-slate-500">Every file passes security inspection, column detection, duplicate detection, and row-level validation.</p>
              </div>
              <select
                value={datasetType}
                onChange={(e) => setDatasetType(e.target.value)}
                className="px-3 py-2 text-xs font-semibold border border-slate-200 rounded-lg bg-white"
              >
                <option value="sales">Sales Transactions</option>
                <option value="expenses">Expenses Ledger</option>
                <option value="products">Products &amp; Opening Stock</option>
                <option value="customers">Customer Directory</option>
              </select>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <label className="cursor-pointer inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-navy-950 text-white text-xs font-semibold hover:bg-navy-800">
                <FileUp className="w-4 h-4" />
                Choose CSV / XLSX File
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
                Download CSV Template
              </button>
            </div>
          </div>

          {activeImport && (
            <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-teal-600">
                    Active Import Job · Status: {activeImport.status}
                  </div>
                  <div className="text-sm font-bold text-navy-950 mt-0.5">
                    {activeImport.total_records} total rows · {activeImport.accepted_records} accepted · {activeImport.rejected_records} rejected · {activeImport.duplicate_records} duplicates
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={busyImport}
                    onClick={handleValidateImport}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold"
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> 2. Validate Rows
                  </button>
                  {activeImport.status === 'validated' && activeImport.accepted_records > 0 && (
                    <button
                      type="button"
                      disabled={busyImport}
                      onClick={handleCommitImport}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-teal-600 text-white text-xs font-semibold hover:bg-teal-700"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" /> 3. Commit {activeImport.accepted_records} Valid Rows
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
                      <option value="">-- unmapped --</option>
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
                    <AlertCircle className="w-4 h-4" /> Validation Errors Flagged ({importErrors.length}) — Preserved for Review
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-rose-900">
                      <thead>
                        <tr className="border-b border-rose-200 text-left text-[11px]">
                          <th className="pb-1.5">Row #</th>
                          <th className="pb-1.5">Column</th>
                          <th className="pb-1.5">Code</th>
                          <th className="pb-1.5">Explanation</th>
                          <th className="pb-1.5">Raw Value</th>
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
            <h3 className="text-sm font-bold text-navy-950 mb-3">Import Provenance History</h3>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-100 text-slate-400 text-left">
                  <th className="pb-2">File</th>
                  <th className="pb-2">Dataset</th>
                  <th className="pb-2">Status</th>
                  <th className="pb-2 text-right">Accepted / Total</th>
                  <th className="pb-2 text-right">Quality</th>
                  <th className="pb-2 text-right">Created</th>
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
                    <td colSpan={6} className="py-6 text-center text-slate-400">No spreadsheet imports yet. Upload a CSV/XLSX above to begin.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
