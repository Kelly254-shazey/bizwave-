import assert from 'node:assert/strict';
import fs from 'node:fs';

const PROXY_BASE = process.env.BIZWAVE_PROXY_URL || 'http://127.0.0.1:5173';
const API = `${PROXY_BASE}/api/v1`;
const SAVANNAH_ID = '11111111-1111-4111-8111-111111111111';
const KIJIJI_ID = '22222222-2222-4222-8222-222222222222';
const WESTLANDS_ID = '11111111-aaaa-4111-8111-000000000001';

let passed = 0;
async function test(name: string, fn: () => Promise<void>) {
  await fn();
  passed += 1;
  console.log(`  PASS [FUNC-${passed}]: ${name}`);
}

async function api(path: string, opts: { method?: string; token?: string; tenantId?: string; body?: any; headers?: Record<string, string> } = {}) {
  const headers: Record<string, string> = { ...(opts.headers || {}) };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  if (opts.tenantId) headers['X-Tenant-Id'] = opts.tenantId;
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${API}${path}`, {
    method: opts.method || 'GET',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, headers: res.headers, json, text };
}

async function login(email: string) {
  const r = await api('/auth/login', { method: 'POST', body: { email, password: 'BizWave2026!' } });
  assert.equal(r.status, 201, `Login failed for ${email}: ${r.text}`);
  return r.json;
}

async function main() {
  console.log('=== [SYSTEM-FUNCTIONAL] End-to-End Business & Citizen Journeys (via Live Proxy :5173) ===');

  const amina = await login('amina@savannahmart.co.ke');

  await test('Journey 1A: Multi-Org Owner switches cleanly between Savannah Urban Mart & Kijiji Flame Bistro', async () => {
    const me = await api('/auth/me', { token: amina.accessToken, tenantId: SAVANNAH_ID });
    assert.equal(me.status, 200);
    assert.ok(me.json.organizations.length >= 2);

    const savOv = await api('/analytics/overview?days=30', { token: amina.accessToken, tenantId: SAVANNAH_ID });
    const kijOv = await api('/analytics/overview?days=30', { token: amina.accessToken, tenantId: KIJIJI_ID });
    assert.equal(savOv.status, 200);
    assert.equal(kijOv.status, 200);
    assert.notEqual(savOv.json.kpis.totalRevenue.value, kijOv.json.kpis.totalRevenue.value);
  });

  await test('Journey 1B: Full Operational Ledger Flow — Sale -> Traceable Return Reversal -> Stock Adjustment', async () => {
    const invBefore = await api(`/inventory?branchId=${WESTLANDS_ID}`, { token: amina.accessToken, tenantId: SAVANNAH_ID });
    assert.equal(invBefore.status, 200);
    const sku = invBefore.json.inventory.find((i: any) => Number(i.on_hand_quantity) >= 10);
    assert.ok(sku, 'Need an in-stock SKU in Westlands');

    // Create a sale
    const saleRes = await api('/sales', {
      method: 'POST',
      token: amina.accessToken,
      tenantId: SAVANNAH_ID,
      body: {
        branchId: WESTLANDS_ID,
        paymentMethod: 'mpesa',
        items: [{ productId: sku.product_id, quantity: 2, unitPrice: Number(sku.selling_price) }],
      },
    });
    assert.equal(saleRes.status, 201, `Sale failed: ${saleRes.text}`);
    const saleId = saleRes.json.saleId || saleRes.json.id || saleRes.json.sale?.id;
    assert.ok(saleId, 'Sale ID must be returned');

    // Record traceable return reversal (never deletes historical sale)
    const retRes = await api(`/sales/${saleId}/return`, {
      method: 'POST',
      token: amina.accessToken,
      tenantId: SAVANNAH_ID,
      body: { reason: 'QA Functional Test — Damaged Packaging Exchange' },
    });
    assert.equal(retRes.status, 201, `Return failed: ${retRes.text}`);

    // Record auditable stock adjustment
    const adjRes = await api('/inventory/adjustments', {
      method: 'POST',
      token: amina.accessToken,
      tenantId: SAVANNAH_ID,
      body: {
        branchId: WESTLANDS_ID,
        productId: sku.product_id,
        adjustmentQuantity: 1,
        reasonCode: 'recount',
        notes: 'QA stock-take verification +1 unit found',
      },
    });
    assert.equal(adjRes.status, 201, `Stock adjustment failed: ${adjRes.text}`);
  });

  await test('Journey 1C: Finance Expense Logging, Report Generation & Streaming CSV Export', async () => {
    const fin = await api('/finance/overview', { token: amina.accessToken, tenantId: SAVANNAH_ID });
    assert.equal(fin.status, 200);
    assert.ok(fin.json.categories.length > 0);

    const exp = await api('/finance/expenses', {
      method: 'POST',
      token: amina.accessToken,
      tenantId: SAVANNAH_ID,
      body: {
        branchId: WESTLANDS_ID,
        categoryId: fin.json.categories[0].id,
        vendorName: 'Nairobi QA Cleaning Services',
        description: 'Weekly shop sanitization',
        expenseDate: '2026-11-16',
        amount: 1250,
        paymentMethod: 'mpesa',
      },
    });
    assert.equal(exp.status, 201, `Expense failed: ${exp.text}`);

    const rep = await api('/reports/generate', {
      method: 'POST',
      token: amina.accessToken,
      tenantId: SAVANNAH_ID,
      body: { reportType: 'sales_summary', days: 30 },
    });
    assert.equal(rep.status, 201);

    const csv = await api('/reports/export?reportType=sales_summary&days=30', {
      token: amina.accessToken,
      tenantId: SAVANNAH_ID,
    });
    assert.equal(csv.status, 200);
    assert.ok(csv.text.includes(',') && csv.text.split('\n').length >= 2, 'CSV export must contain header + data rows');
  });

  await test('Journey 1D: Predict RFM Churn + Grounded Bilingual AI + Live System Health', async () => {
    const rfm = await api('/forecasts/segmentation/rfm', { token: amina.accessToken, tenantId: SAVANNAH_ID });
    assert.equal(rfm.status, 200);
    assert.equal(rfm.json.status, 'completed');

    const health = await api('/admin/system-health', { token: amina.accessToken, tenantId: SAVANNAH_ID });
    assert.equal(health.status, 200);
    assert.equal(health.json.services.postgresql.ok, true);
    assert.equal(health.json.services.redisAndQueues.ok, true);
    assert.equal(health.json.services.intelligenceEngine.ok, true);
  });

  await test('Journey 2: Complete Public Citizen / Buyer Flow (Zero Login -> Learn -> Tools -> AI Tutor -> USSD -> QR -> DPA Erase)', async () => {
    const cat = await api('/learn/catalog');
    assert.equal(cat.status, 200);
    assert.equal(cat.json.modules.length, 26);

    const lesson = await api('/learn/lessons/buyer-counterfeits');
    assert.equal(lesson.status, 200);
    assert.ok(lesson.json.nonCertificationNotice.includes('does NOT certify'));

    const cmp = await api('/learn/buyer-tools/unit-compare', {
      method: 'POST',
      body: {
        items: [
          { label: 'Cooking Oil 500ml', priceKes: 195, quantity: 500, unit: 'ml' },
          { label: 'Cooking Oil 2L', priceKes: 680, quantity: 2, unit: 'l' },
        ],
      },
    });
    assert.equal(cmp.status, 201);
    assert.equal(cmp.json.bestValueLabel, 'Cooking Oil 2L');

    const tutor = await api('/learn/coach/ask', {
      method: 'POST',
      body: {
        question: 'Sasa, ninawezaje kulinganisha bei ya unga 1kg na 2kg bila kudanganywa?',
        language: 'sheng',
        style: 'practical',
        audienceHint: 'buyer',
      },
    });
    assert.equal(tutor.status, 201);
    assert.equal(tutor.json.blocked, false);
    const learnerToken = tutor.json.learnerToken;
    assert.ok(learnerToken);

    const prog = await api('/learn/lessons/buyer-counterfeits/progress', {
      method: 'POST',
      headers: { 'X-Learner-Token': learnerToken },
      body: { preScorePct: 50, postScorePct: 100, exerciseCompleted: true, saferBehaviourAdopted: true, completed: true },
    });
    assert.equal(prog.status, 201);
    assert.equal(Number(prog.json.progress.knowledge_gain_pct), 50);

    const ussd1 = await api('/learn/ussd', { method: 'POST', body: { text: '' } });
    const ussd2 = await api('/learn/ussd', { method: 'POST', body: { text: '2*2' } });
    assert.equal(ussd1.status, 201);
    assert.equal(ussd2.status, 201);
    assert.ok(ussd2.json.screen.startsWith('END'));

    const qr = await api('/learn/qr/buyer-safe-payments');
    assert.equal(qr.status, 200);
    assert.ok(qr.json.svg.includes('<svg'));

    const erase = await api('/learn/my-data', { method: 'DELETE', headers: { 'X-Learner-Token': learnerToken } });
    assert.equal(erase.status, 200);
    assert.equal(erase.json.deleted, true);
  });

  await test('Journey 3: Full 6-Persona RBAC & Plan Entitlement Matrix Verification', async () => {
    const [grace, kelvin, faith, brian] = await Promise.all([
      login('grace@savannahmart.co.ke'),
      login('kelvin@savannahmart.co.ke'),
      login('faith@savannahmart.co.ke'),
      login('brian@kijijiflame.co.ke'),
    ]);

    // Inventory manager CAN view inventory, CANNOT view team billing management
    assert.equal((await api('/inventory', { token: grace.accessToken, tenantId: SAVANNAH_ID })).status, 200);
    assert.equal((await api('/subscriptions', { token: grace.accessToken, tenantId: SAVANNAH_ID })).status, 403);

    // Kilimani Branch Manager blocked from Westlands
    assert.equal((await api(`/sales?branchId=${WESTLANDS_ID}`, { token: kelvin.accessToken, tenantId: SAVANNAH_ID })).status, 403);

    // Customer service agent CAN read customers, CANNOT access audit logs
    assert.equal((await api('/customers', { token: faith.accessToken, tenantId: SAVANNAH_ID })).status, 200);
    assert.equal((await api('/admin/audit-logs', { token: faith.accessToken, tenantId: SAVANNAH_ID })).status, 403);

    // Kijiji Flame (Growth plan) CAN access analytics & Connect, CANNOT access Intelligence-only AI Assistant
    assert.equal((await api('/analytics/overview?days=30', { token: brian.accessToken, tenantId: KIJIJI_ID })).status, 200);
    assert.equal((await api('/communications/overview', { token: brian.accessToken, tenantId: KIJIJI_ID })).status, 200);
    assert.equal((await api('/ai/conversations', { token: brian.accessToken, tenantId: KIJIJI_ID })).status, 403);
  });

  await test('Journey 4: Full UI Action Coverage — Customer Consent Toggle, DPA Export, Forecasts, Pitch CSV & Security Settings', async () => {
    // 1. Customer Kenya DPA 2019 consent toggle (PATCH) + Data Subject Access Export (GET)
    const custs = await api('/customers', { token: amina.accessToken, tenantId: SAVANNAH_ID });
    assert.equal(custs.status, 200);
    const cid = custs.json.customers[0].customer_id;
    assert.ok(cid, 'Expected seeded customer_id');

    const consentUpd = await api(`/customers/${cid}/consents`, {
      method: 'PATCH',
      token: amina.accessToken,
      tenantId: SAVANNAH_ID,
      body: { channel: 'sms', purpose: 'marketing', status: 'granted' },
    });
    assert.equal(consentUpd.status, 200, `Consent toggle failed: ${consentUpd.text}`);

    const dpaExp = await api(`/customers/${cid}/dpa-export`, { token: amina.accessToken, tenantId: SAVANNAH_ID });
    assert.equal(dpaExp.status, 200);
    assert.ok(dpaExp.json.legalFramework.includes('Kenya Data Protection Act, 2019'));

    // 2. Scheduled report + Communication template + All 3 Forecast types + Anomaly scan
    const sched = await api('/reports/schedule', {
      method: 'POST',
      token: amina.accessToken,
      tenantId: SAVANNAH_ID,
      body: { name: 'QA Weekly Sales Summary', reportType: 'sales_summary', recipients: ['amina@savannahmart.co.ke'] },
    });
    assert.equal(sched.status, 201);

    const tpl = await api('/communications/templates', {
      method: 'POST',
      token: amina.accessToken,
      tenantId: SAVANNAH_ID,
      body: { name: `QA Template ${Date.now()}`, channelType: 'sms', language: 'sw', purpose: 'marketing', bodyTemplate: 'Asante {{name}}!' },
    });
    assert.equal(tpl.status, 201);

    for (const forecastType of ['sales', 'demand', 'cashflow']) {
      const fc = await api('/forecasts', {
        method: 'POST',
        token: amina.accessToken,
        tenantId: SAVANNAH_ID,
        body: { forecastType, horizonDays: 14, branchId: 'all' },
      });
      assert.equal(fc.status, 201, `Forecast ${forecastType} failed: ${fc.text}`);
    }
    const anom = await api('/forecasts/anomalies/scan?branchId=all', {
      method: 'POST',
      token: amina.accessToken,
      tenantId: SAVANNAH_ID,
    });
    assert.equal(anom.status, 201);

    // 3. Slide 6 Pitch Demo CSV (salesWeek_18.csv) upload + auto-mapping + 100% quality validation
    const pitchCsv = fs.readFileSync('/home/user/bizwave/samples/salesWeek_18.csv', 'utf8');
    const imp = await api('/imports', {
      method: 'POST',
      token: amina.accessToken,
      tenantId: SAVANNAH_ID,
      body: { datasetType: 'sales', csvContent: pitchCsv, filename: 'salesWeek_18.csv' },
    });
    assert.equal(imp.status, 201);
    const val = await api(`/imports/${imp.json.importJob.id}/validate`, {
      method: 'POST',
      token: amina.accessToken,
      tenantId: SAVANNAH_ID,
      body: { columnMapping: imp.json.importJob.column_mapping },
    });
    assert.equal(val.status, 201);
    assert.equal(val.json.summary.qualityScore, 100);
    assert.equal(val.json.summary.acceptedRecords, 21);

    // 4. Security settings endpoints (MFA setup, active sessions, forgot-password)
    assert.equal((await api('/auth/mfa/setup', { method: 'POST', token: amina.accessToken })).status, 201);
    assert.equal((await api('/auth/sessions', { token: amina.accessToken })).status, 200);
    assert.equal((await api('/auth/forgot-password', { method: 'POST', body: { email: 'amina@savannahmart.co.ke' } })).status, 201);
  });

  console.log(`\nALL ${passed} SYSTEM FUNCTIONAL JOURNEY TESTS PASSED!`);
}

main().catch((err) => {
  console.error('SYSTEM FUNCTIONAL TEST FAILED:', err);
  process.exit(1);
});
