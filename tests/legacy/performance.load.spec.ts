import assert from 'node:assert/strict';

const API = process.env.BIZWAVE_API_URL || 'http://127.0.0.1:4000/api/v1';
const SAVANNAH_ID = '11111111-1111-4111-8111-111111111111';
const KIJIJI_ID = '22222222-2222-4222-8222-222222222222';

function percentile(sorted: number[], p: number): number {
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return Number(sorted[idx].toFixed(1));
}

async function runWave(
  label: string,
  count: number,
  concurrency: number,
  fn: (i: number) => Promise<{ ok: boolean; status: number }>,
  p95BudgetMs: number,
) {
  const latencies: number[] = [];
  let errors = 0;
  let nextIdx = 0;
  const started = performance.now();

  const workers = Array.from({ length: concurrency }, async () => {
    while (true) {
      const i = nextIdx++;
      if (i >= count) break;
      const t0 = performance.now();
      const res = await fn(i);
      latencies.push(performance.now() - t0);
      if (!res.ok) errors += 1;
    }
  });
  await Promise.all(workers);

  const totalSec = (performance.now() - started) / 1000;
  latencies.sort((a, b) => a - b);
  const p50 = percentile(latencies, 50);
  const p95 = percentile(latencies, 95);
  const p99 = percentile(latencies, 99);
  const rps = Number((count / totalSec).toFixed(1));

  console.log(
    `  BENCH [${label}]: n=${count} conc=${concurrency} | P50=${p50}ms P95=${p95}ms P99=${p99}ms | ${rps} req/s | errors=${errors}`,
  );
  assert.equal(errors, 0, `${label} had ${errors} failed requests!`);
  assert.ok(p95 <= p95BudgetMs, `${label} P95=${p95}ms exceeded SLA budget ${p95BudgetMs}ms!`);
  return { label, count, concurrency, p50, p95, p99, rps, errors };
}

async function main() {
  console.log('=== [SYSTEM-PERFORMANCE & SCALABILITY] Concurrent Load & Multi-Tenant Stress Suite ===');

  const amina = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'amina@savannahmart.co.ke', password: 'BizWave2026!' }),
  }).then((r) => r.json());

  const brian = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'brian@kijijiflame.co.ke', password: 'BizWave2026!' }),
  }).then((r) => r.json());

  // 1. Public Community Learn Catalog under concurrent load (60 reqs, 15 concurrent)
  await runWave(
    'Public Learn Catalog',
    60,
    15,
    async () => {
      const r = await fetch(`${API}/learn/catalog`);
      const d: any = await r.json();
      return { ok: r.status === 200 && d.modules?.length >= 26, status: r.status };
    },
    300,
  );

  // 2. Buyer Unit-Price Comparator CPU/JSON throughput (60 reqs, 20 concurrent)
  await runWave(
    'Buyer Unit Comparator',
    60,
    20,
    async () => {
      const r = await fetch(`${API}/learn/buyer-tools/unit-compare`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [
            { label: '500g', priceKes: 130, quantity: 500, unit: 'g' },
            { label: '2kg', priceKes: 560, quantity: 2, unit: 'kg' },
          ],
        }),
      });
      const d: any = await r.json();
      return { ok: r.status === 201 && d.bestValueLabel === '500g', status: r.status };
    },
    150,
  );

  // 3. SIMULTANEOUS MULTI-TENANT RLS ISOLATION UNDER CONCURRENCY (Savannah + Kijiji hammered in same tick!)
  let crossTenantLeaks = 0;
  await runWave(
    'Concurrent Multi-Tenant Analytics (Savannah + Kijiji)',
    40,
    12,
    async (i) => {
      const isSavannah = i % 2 === 0;
      const tid = isSavannah ? SAVANNAH_ID : KIJIJI_ID;
      const tok = isSavannah ? amina.accessToken : brian.accessToken;
      const r = await fetch(`${API}/sales?limit=5`, {
        headers: { Authorization: `Bearer ${tok}`, 'X-Tenant-Id': tid },
      });
      const d: any = await r.json();
      const sales: any[] = d.sales || [];
      const foreign = sales.filter((s) => s.tenant_id !== tid);
      if (foreign.length > 0) crossTenantLeaks += foreign.length;
      return { ok: r.status === 200 && sales.length > 0 && foreign.length === 0, status: r.status };
    },
    500,
  );
  assert.equal(crossTenantLeaks, 0, `CRITICAL: ${crossTenantLeaks} cross-tenant leaks under concurrent load!`);
  console.log('  PASS [SCALE-RLS]: Zero cross-tenant leakage across 40 simultaneous interleaved tenant transactions.');

  // 4. Analytics Dashboard KPI Aggregation under concurrency (30 reqs, 10 concurrent)
  await runWave(
    'Analytics Overview KPIs',
    30,
    10,
    async () => {
      const r = await fetch(`${API}/analytics/overview?days=30`, {
        headers: { Authorization: `Bearer ${amina.accessToken}`, 'X-Tenant-Id': SAVANNAH_ID },
      });
      const d: any = await r.json();
      return { ok: r.status === 200 && d.kpis?.totalRevenue?.value > 0, status: r.status };
    },
    600,
  );

  console.log('\nALL PERFORMANCE & CONCURRENT MULTI-TENANT SCALABILITY CHECKS PASSED!');
}

main().catch((err) => {
  console.error('PERFORMANCE TEST FAILED:', err);
  process.exit(1);
});
