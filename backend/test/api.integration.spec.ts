import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { Pool } from 'pg';

// These tests write fixtures and immutable audit entries. They MUST target a
// disposable local database and the deterministic mock intelligence service.
const API = process.env.BIZWAVE_API_URL || 'http://127.0.0.1:4000/api/v1';
const ownerUrl = process.env.BIZWAVE_TEST_OWNER_DATABASE_URL || '';
if (process.env.BIZWAVE_ALLOW_TEST_FIXTURES !== '1' || !ownerUrl) {
  throw new Error('Integration tests require BIZWAVE_ALLOW_TEST_FIXTURES=1 and BIZWAVE_TEST_OWNER_DATABASE_URL for a disposable local DB.');
}
const dbUrl = new URL(ownerUrl);
const apiUrl = new URL(API);
const localHosts = ['localhost', '127.0.0.1', '::1', '[::1]'];
const dbName = dbUrl.pathname.replace(/^\//, '');
if (!localHosts.includes(dbUrl.hostname) || !localHosts.includes(apiUrl.hostname) || !/^(bw_qa_|bizwave_test|bizwave_ci)/.test(dbName)) {
  throw new Error('Refusing to create integration fixtures outside a local bw_qa_*, bizwave_test*, or bizwave_ci* database and API.');
}
const db = new Pool({ connectionString: ownerUrl });
const suffix = randomBytes(5).toString('hex');
const password = 'TestPassword2026!';
let passed = 0;

interface Actor { token: string; tenant: string; userId: string; }
async function req(path: string, options: { method?: string; body?: unknown; actor?: Actor; tenant?: string } = {}) {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.actor) {
    headers.Authorization = `Bearer ${options.actor.token}`;
    headers['X-Tenant-Id'] = options.tenant || options.actor.tenant;
  }
  const response = await fetch(`${API}${path}`, {
    method: options.method || 'GET', headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(30000),
  });
  const text = await response.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: response.status, json, headers: response.headers };
}
async function expect(status: number, path: string, options: Parameters<typeof req>[1] = {}) {
  const result = await req(path, options);
  assert.equal(result.status, status, `${options.method || 'GET'} ${path}: ${JSON.stringify(result.json)}`);
  return result.json;
}
async function test(name: string, run: () => Promise<void>) {
  await run(); passed++; console.log(`  PASS [${passed}]: ${name}`);
}
async function register(tag: string): Promise<Actor & { refreshToken: string; organizations: any[] }> {
  const email = `qa-${tag}-${suffix}@example.test`;
  const out = await expect(201, '/auth/register', { method: 'POST', body: {
    businessName: `QA ${tag} ${suffix}`, businessEmail: email, industryCode: 'retail',
    firstName: 'QA', lastName: tag, email, password, preferredLanguage: 'en',
  }});
  assert.equal(out.user.isPlatformAdmin, false);
  return { token: out.accessToken, tenant: out.activeTenantId, userId: out.user.id,
    refreshToken: out.refreshToken, organizations: out.organizations };
}
async function invite(owner: Actor, tag: string, roleCode: string, branchId: string): Promise<Actor> {
  const email = `qa-${tag}-${suffix}@example.test`;
  const r = await expect(201, '/admin/users/invite', { method: 'POST', actor: owner,
    body: { firstName: 'QA', lastName: tag, email, roleCode, branchIds: [branchId], temporaryPassword: password } });
  const login = await expect(201, '/auth/login', { method: 'POST', body: { email, password } });
  return { token: login.accessToken, tenant: owner.tenant, userId: r.invited.userId };
}

async function main() {
  console.log('=== Disposable BizWave portal API integration (mock website analyzer) ===');
  const current = await db.query('SELECT current_database() AS db, current_user AS usr');
  assert.equal(current.rows[0].db, dbName);
  const health = await expect(200, '/health');
  assert.equal(health.status, 'ok');
  await expect(401, '/business-network/businesses');

  // Prove the API points at this disposable DB *before* any registration or
  // other durable fixture. A unique temporary public catalog marker makes a
  // local API accidentally connected to a real DB fail closed without writes.
  const probe = `qa_probe_${suffix}`;
  await db.query(`INSERT INTO add_on_services (code,name,unit_label,unit_price_kes,description) VALUES ($1,'QA connection probe','probe',0,'temporary verification marker')`, [probe]);
  try {
    const catalog = await expect(200, '/subscriptions/plans');
    assert.ok(catalog.addOns.some((a: any) => a.code === probe), 'API and owner connection must target the same disposable DB before creating fixtures');
  } finally {
    await db.query(`DELETE FROM add_on_services WHERE code=$1`, [probe]);
  }

  const owner = await register('owner');
  const partner = await register('partner');
  const sameDb = await db.query('SELECT id FROM tenants WHERE id=$1', [owner.tenant]);
  assert.equal(sameDb.rowCount, 1, 'API and owner connection must point at the same disposable DB');
  await test('registration, Starter feature preview and cross-tenant denial', async () => {
    const features = owner.organizations[0].enabledFeatures;
    for (const f of ['predict_basic', 'predict_advanced', 'ai_assistant', 'connect_core']) assert.ok(features.includes(f), f);
    await expect(200, '/ai/conversations', { actor: owner });
    await expect(200, '/forecasts', { actor: owner });
    await expect(403, '/sales', { actor: owner, tenant: partner.tenant });
    await expect(403, '/business-network/profile', { actor: owner, tenant: partner.tenant });
  });

  const branchA = (await expect(200, '/branches', { actor: owner })).branches[0].id as string;
  const branchB = (await db.query(
    `INSERT INTO branches (tenant_id,code,name,city,county) VALUES ($1,'QA-B','QA Branch B','Nairobi','Nairobi') RETURNING id`,
    [owner.tenant],
  )).rows[0].id as string;
  const manager = await invite(owner, 'manager', 'branch_manager', branchA);
  const staff = await invite(owner, 'staff', 'staff_member', branchA);

  const published = { displayName: `QA Electronics ${suffix}`, sector: 'Electronics', county: 'Nairobi',
    description: 'Opt-in test directory listing', contactEmail: 'partner@example.test', website: 'https://partner.example.test', isPublished: false };
  await test('directory is opt-in and exposes contact fields only after publication', async () => {
    await expect(200, '/business-network/profile', { method: 'PUT', actor: partner, body: published });
    assert.equal((await expect(200, `/business-network/businesses?q=${suffix}`, { actor: owner })).total, 0);
    await expect(400, '/business-network/profile', { method: 'PUT', actor: partner, body: { ...published, isPublished: true, contactEmail: 'not-an-email' } });
    await expect(400, '/business-network/profile', { method: 'PUT', actor: partner, body: { ...published, isPublished: true, website: 'javascript:alert(1)' } });
    await expect(200, '/business-network/profile', { method: 'PUT', actor: partner, body: { ...published, isPublished: true } });
    const results = await expect(200, `/business-network/businesses?q=${suffix}&county=nairobi`, { actor: owner });
    assert.equal(results.total, 1);
    assert.equal(results.businesses[0].contact_email, 'partner@example.test');
    assert.equal(results.businesses[0].website, 'https://partner.example.test');
    assert.ok(!('tenant_id' in results.businesses[0]));
    await expect(403, '/business-network/profile', { method: 'PUT', actor: manager, body: { ...published, isPublished: true } });
    await expect(403, '/business-network/profile', { method: 'PUT', actor: owner, tenant: partner.tenant, body: { ...published, displayName: 'Tampered' } });
    await expect(403, '/business-network/businesses', { actor: staff });
    await expect(200, '/business-network/profile', { method: 'PUT', actor: partner, body: published });
    assert.equal((await expect(200, `/business-network/businesses?q=${suffix}`, { actor: owner })).total, 0);
    await expect(200, '/business-network/profile', { method: 'PUT', actor: partner, body: { ...published, isPublished: true } });
  });

  await db.query(`INSERT INTO products (tenant_id,sku,name,cost_price,selling_price,track_inventory)
    VALUES ($1,'QA-COLLISION','Original product',321,111,false)`, [owner.tenant]);
  await db.query(`INSERT INTO inventory (tenant_id,branch_id,product_id,opening_quantity,on_hand_quantity)
    SELECT $1,$2,id,10,10 FROM products WHERE tenant_id=$1 AND sku='QA-COLLISION'`, [owner.tenant, branchA]);
  await test('staff can see only assigned stock without cost fields, and expired roles grant nothing', async () => {
    const rows = (await expect(200, '/inventory?branchId=all', { actor: staff })).inventory;
    assert.ok(rows.some((r: any) => r.sku === 'QA-COLLISION'));
    assert.ok(rows.every((r: any) => !('cost_price' in r) && !('inventory_value_cost' in r)));
    await expect(403, `/inventory?branchId=${branchB}`, { actor: staff });
    await expect(403, '/finance/overview', { actor: staff });
    await db.query(`INSERT INTO user_roles(tenant_id,user_id,role_id,expires_at)
      SELECT $1,$2,id,NOW()-INTERVAL '1 day' FROM roles WHERE tenant_id IS NULL AND code='business_owner'`, [owner.tenant, staff.userId]);
    try { await expect(403, '/finance/overview', { actor: staff }); }
    finally { await db.query(`DELETE FROM user_roles WHERE tenant_id=$1 AND user_id=$2 AND role_id=(SELECT id FROM roles WHERE tenant_id IS NULL AND code='business_owner')`, [owner.tenant, staff.userId]); }
  });

  const shop = 'https://qa-catalog.example.test/shop';
  const sync = (url: string, branchId: string) => expect(201, '/analytics/website-analyze', { method: 'POST', actor: owner, body: { url, branchId, importCatalog: true } });
  await test('website review is read-only; explicit sync preserves colliding SKUs and imports only KES', async () => {
    const preview = await expect(201, '/analytics/website-analyze', { method: 'POST', actor: owner, body: { url: shop, branchId: branchA } });
    assert.equal(preview.sourceSaved, false);
    assert.equal((await expect(200, '/analytics/website-sources', { actor: owner })).sources.length, 0);
    const first = await sync(shop, branchA);
    assert.deepEqual([first.importedCount, first.updatedCount, first.skippedCount], [1, 0, 4]);
    const next = await sync(`${shop}?version=2`, branchA);
    assert.deepEqual([next.importedCount, next.updatedCount, next.skippedCount], [0, 1, 4]);
    const items = await db.query(`SELECT sku,name,selling_price,cost_price,track_inventory FROM products WHERE tenant_id=$1 AND sku IN ('QA-COLLISION','QA-OWNED') ORDER BY sku`, [owner.tenant]);
    assert.equal(items.rows[0].name, 'Original product');
    assert.equal(Number(items.rows[0].selling_price), 111);
    assert.equal(Number(items.rows[1].selling_price), 700);
    assert.equal(Number(items.rows[1].cost_price), 0);
    assert.equal(items.rows[1].track_inventory, false);
    const stock = await db.query(`SELECT count(*)::int AS n FROM inventory i JOIN products p ON p.tenant_id=i.tenant_id AND p.id=i.product_id WHERE p.tenant_id=$1 AND p.sku='QA-OWNED'`, [owner.tenant]);
    assert.equal(stock.rows[0].n, 0);
    await expect(403, '/analytics/website-analyze', { method: 'POST', actor: staff, body: { url: shop, importCatalog: true } });
  });
  await test('simultaneous website syncs serialize per source', async () => {
    const [one, two] = await Promise.all([sync('https://qa-catalog.example.test/concurrent', branchA), sync('https://qa-catalog.example.test/concurrent', branchA)]);
    assert.deepEqual([one.importedCount, two.importedCount].sort(), [0, 1]);
    assert.deepEqual([one.updatedCount, two.updatedCount].sort(), [0, 1]);
    const n = await db.query(`SELECT count(*)::int AS n FROM data_sources WHERE tenant_id=$1 AND config->>'url'=$2`, [owner.tenant, 'https://qa-catalog.example.test/concurrent']);
    assert.equal(n.rows[0].n, 1);
  });
  await test('website sources respect branches and a revoked branch sees no sources', async () => {
    await sync('https://qa-catalog.example.test/branch-b', branchB);
    const a = (await expect(200, '/analytics/website-sources?branchId=all', { actor: manager })).sources;
    assert.ok(a.some((s: any) => s.config.url === shop));
    assert.ok(a.every((s: any) => s.config.url !== 'https://qa-catalog.example.test/branch-b'));
    await expect(403, `/analytics/website-sources?branchId=${branchB}`, { actor: manager });
    await expect(403, '/analytics/website-analyze', { method: 'POST', actor: manager, body: { url: shop, branchId: branchB } });
    await db.query(`DELETE FROM user_branch_assignments WHERE tenant_id=$1 AND user_id=$2 AND branch_id=$3`, [owner.tenant, manager.userId, branchA]);
    try {
      assert.equal((await expect(200, '/analytics/website-sources?branchId=all', { actor: manager })).sources.length, 0);
      await expect(403, '/analytics/website-analyze', { method: 'POST', actor: manager, body: { url: shop } });
    } finally {
      await db.query(`INSERT INTO user_branch_assignments (tenant_id,user_id,branch_id,access_level) VALUES ($1,$2,$3,'manager')`, [owner.tenant, manager.userId, branchA]);
    }
  });

  await test('scoped communication permissions fail closed without blocking opt-in directory discovery', async () => {
    const role = (await db.query(`INSERT INTO roles(tenant_id,code,name,scope,is_system) VALUES ($1,'qa_scoped_connect','QA scoped connect','business',false) RETURNING id`, [owner.tenant])).rows[0].id;
    await db.query(`INSERT INTO role_permissions(role_id,permission_id) SELECT $1,id FROM permissions WHERE code IN ('connect:read','connect:send','connect:manage')`, [role]);
    await db.query(`INSERT INTO user_roles(tenant_id,user_id,role_id) VALUES ($1,$2,$3)`, [owner.tenant, manager.userId, role]);
    try {
      assert.equal((await expect(200, `/business-network/businesses?q=${suffix}`, { actor: manager })).total, 1);
      for (const path of ['/communications/overview','/communications/campaigns','/communications/reports']) await expect(403, path, { actor: manager });
      await expect(403, '/communications/messages', { method: 'POST', actor: manager, body: { channelType: 'sms', purpose: 'marketing', message: 'test' } });
    } finally {
      await db.query(`DELETE FROM user_roles WHERE tenant_id=$1 AND user_id=$2 AND role_id=$3`, [owner.tenant, manager.userId, role]);
      await db.query(`DELETE FROM roles WHERE tenant_id=$1 AND id=$2`, [owner.tenant, role]);
    }
  });
  await test('campaign consent is channel-specific and no provider delivery is claimed', async () => {
    const customer = (await expect(201, '/customers', { method: 'POST', actor: owner, body: {
      fullName: 'QA consent customer', phoneNumber: '+254700000001', preferredChannel: 'sms', marketingOptIn: true, branchId: branchA,
    }})).customer;
    await expect(201, '/communications/channels/configure', { method: 'POST', actor: owner, body: {
      channelType: 'sms', providerCode: 'africas_talking', senderId: 'QA', credentials: { API_KEY: 'dummy-for-test' },
    }});
    const template = (await expect(201, '/communications/templates', { method: 'POST', actor: owner, body: {
      name: `QA template ${suffix}`, channelType: 'sms', language: 'en', purpose: 'marketing', bodyTemplate: 'Hello {{name}}',
    }})).template;
    assert.equal(template.approval_status, 'draft');
    const sms = await expect(201, '/communications/campaigns', { method: 'POST', actor: owner, body: {
      name: 'QA consent SMS', channelType: 'sms', purpose: 'marketing', customMessage: 'Hello', customerIds: [customer.id],
    }});
    assert.equal(sms.providerConfigured, true);
    assert.equal(sms.deliveryEnabled, false);
    assert.equal(sms.campaign.status, 'blocked_provider_unconfigured');
    assert.equal(sms.campaign.sent_at, null);
    assert.equal(sms.campaign.consented_count, 1);
    assert.match(sms.honestNotice, /No messages were sent/);
    const whatsapp = await expect(201, '/communications/campaigns', { method: 'POST', actor: owner, body: {
      name: 'QA consent WhatsApp', channelType: 'whatsapp', purpose: 'marketing', customMessage: 'Hello', customerIds: [customer.id],
    }});
    assert.equal(whatsapp.campaign.consented_count, 0);
    assert.equal(whatsapp.campaign.skipped_no_consent_count, 1);
    const messages = (await expect(200, '/communications/overview', { actor: owner })).messages;
    assert.ok(messages.some((m: any) => m.delivery_status === 'provider_unconfigured'));
    assert.ok(messages.some((m: any) => m.delivery_status === 'rejected_no_consent'));
    assert.ok(messages.every((m: any) => !['sent','delivered','submitted'].includes(m.delivery_status)));
  });
  await test('AI conversation branch binding and cash-flow prerequisites remain enforced', async () => {
    const conversation = (await expect(201, '/ai/conversations', { method: 'POST', actor: manager, body: { language: 'en', branchId: branchA } })).conversation;
    await expect(403, '/ai/conversations', { method: 'POST', actor: manager, body: { language: 'en', branchId: branchB } });
    await expect(400, `/ai/conversations/${conversation.id}/messages`, { actor: owner });
    await expect(400, '/forecasts', { method: 'POST', actor: owner, body: { forecastType: 'cashflow', horizonDays: 14, branchId: 'all' } });
  });
  await test('unconfigured billing never marks an invoice paid or changes a plan', async () => {
    const before = await expect(200, '/subscriptions', { actor: owner });
    const catalog = await expect(200, '/subscriptions/plans');
    const featureLabels = catalog.plans.flatMap((p: any) => p.features.map((f: any) => f.label)).join(' ');
    assert.match(featureLabels, /no outbound delivery/i);
    assert.doesNotMatch(featureLabels, /automated data sources|M-Pesa sync|white.label|unlimited/i);
    assert.ok(catalog.addOns.every((a: any) => /not available/i.test(a.description)));
    await expect(503, '/subscriptions', { method: 'POST', actor: owner, body: { planCode: 'growth' } });
    await expect(503, '/subscriptions/add-ons', { method: 'POST', actor: owner, body: { addOnCode: 'extra_branch' } });
    await expect(403, '/subscriptions', { method: 'POST', actor: staff, body: { planCode: 'growth' } });
    const after = await expect(200, '/subscriptions', { actor: owner });
    assert.equal(after.subscription.plan_code, before.subscription.plan_code);
    assert.equal(after.invoices.length, before.invoices.length);
    assert.equal(after.activeAddOns.length, before.activeAddOns.length);
  });
  await test('immutable audit chain is valid and removed Learn route stays unavailable', async () => {
    const audit = await expect(200, '/admin/audit-logs', { actor: owner });
    assert.equal(audit.integrityChain.is_valid, true);
    assert.ok(Number(audit.integrityChain.checked_records) >= 3);
    await expect(404, '/learn/catalog');
  });
  console.log(`ALL ${passed} CURRENT API INTEGRATION CHECKS PASSED (fixtures remain in disposable DB).`);
}

main().catch((error) => { console.error('API INTEGRATION FAILED:', error); process.exitCode = 1; }).finally(() => db.end());
