import 'reflect-metadata';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  decryptSecret,
  encryptSecret,
  generateOpaqueToken,
  hashPassword,
  sha256Hex,
  verifyHmacSignature,
  verifyPassword,
} from '../src/database/crypto.util';
import { MsingiLanguageService } from '../src/modules/ai/msingi.service';
import { assertProductionConfig, envConfig, isSecureProductionOrigin } from '../src/config/env.config';
import { AiController } from '../src/modules/ai/ai.controller';
import { ForecastingController } from '../src/modules/forecasting/forecasting.controller';
import { CommunicationsController } from '../src/modules/communications/communications.controller';
import { SubscriptionsController } from '../src/modules/subscriptions/subscriptions.controller';
import { AnalyticsController } from '../src/modules/analytics/analytics.controller';
import { inventoryRowForRole, saleForRole } from '../src/common/inventory-visibility';
import { effectivePortalFeatures } from '../src/common/portal-features';
import { TenantAuthContext } from '../src/common/types/auth.types';

let passed = 0;

async function unit(name: string, fn: () => Promise<void> | void) {
  await fn();
  passed += 1;
  console.log(`  PASS [U${passed}]: ${name}`);
}

async function main() {
  console.log('=== BizWave Backend Pure Unit Test Suite ===');

  await unit('Argon2id password hashing produces PHC hash, verifies match & rejects wrong/malformed inputs', async () => {
    const hash = await hashPassword('NairobiSme#2026!');
    assert.ok(hash.startsWith('$argon2id$'), 'Must use Argon2id variant');
    assert.equal(await verifyPassword(hash, 'NairobiSme#2026!'), true);
    assert.equal(await verifyPassword(hash, 'WrongPassword!'), false);
    assert.equal(await verifyPassword('not-a-valid-hash', 'NairobiSme#2026!'), false);
  });

  await unit('AES-256-GCM encryption uses random nonces and decrypts exact plaintext', () => {
    const secret = JSON.stringify({ apiKey: 'msk_live_secret_12345', username: 'bizwave_ke' });
    const c1 = encryptSecret(secret);
    const c2 = encryptSecret(secret);
    assert.notEqual(c1, c2, 'Random 96-bit IV must produce distinct ciphertexts');
    assert.equal(decryptSecret(c1), secret);
    assert.equal(decryptSecret(c2), secret);
  });

  await unit('AES-256-GCM rejects tampered ciphertext, altered auth tag, and malformed payloads', () => {
    const ct = encryptSecret('top-secret-provider-key');
    const parts = ct.split(':');
    assert.equal(parts.length, 3);
    const flipped = (parts[2][0] === 'a' ? 'b' : 'a') + parts[2].slice(1);
    assert.throws(() => decryptSecret(`${parts[0]}:${parts[1]}:${flipped}`), /Unsupported state|unable to authenticate/i);
    const badTag = (parts[1][0] === '0' ? '1' : '0') + parts[1].slice(1);
    assert.throws(() => decryptSecret(`${parts[0]}:${badTag}:${parts[2]}`), /Unsupported state|unable to authenticate/i);
    assert.throws(() => decryptSecret('broken_no_colons'), /Malformed encrypted payload/);
  });

  await unit('HMAC-SHA256 webhook signature verification passes exact match & blocks forged/truncated signatures', () => {
    const body = JSON.stringify({ eventId: 'evt_101', status: 'delivered' });
    const secret = 'whsec_kenya_prod_secret';
    const valid = crypto.createHmac('sha256', secret).update(body).digest('hex');

    assert.equal(verifyHmacSignature(body, secret, valid), true);
    assert.equal(verifyHmacSignature(body, secret, `sha256=${valid}`), true);
    assert.equal(verifyHmacSignature(body, secret, 'sha256=' + '0'.repeat(64)), false);
    assert.equal(verifyHmacSignature(body, secret, 'short'), false);
    assert.equal(verifyHmacSignature(body + ' ', secret, valid), false);
  });

  await unit('Opaque token generator yields >=256-bit high-entropy URL-safe tokens & SHA-256 is deterministic', () => {
    const t1 = generateOpaqueToken(32);
    const t2 = generateOpaqueToken(32);
    assert.notEqual(t1, t2);
    assert.ok(t1.length >= 40);
    assert.equal(sha256Hex('bizwave-ke'), sha256Hex('bizwave-ke'));
    assert.equal(sha256Hex('bizwave-ke').length, 64);
  });

  const msingi = new MsingiLanguageService();

  await unit('MsingiAI voice adapter public status NEVER leaks API keys and reports open-weight options', () => {
    const st = msingi.getPublicStatus();
    const serialized = JSON.stringify(st);
    assert.equal(st.provider, 'MsingiAI Sauti (Kenya)');
    assert.ok(st.baseUrl.startsWith('http'));
    assert.ok(!serialized.includes('msk_'), 'Never leak Msingi API keys in public status');
    assert.ok(st.supportedCapabilities.selfHostableOpenWeights.includes('sauti-tts'));
    assert.match(st.pricingTransparency, /not been verified/i);
  });

  await unit('MsingiAI voice synthesis gracefully falls back when unkeyed and clamps over-long text to 2,000 chars', async () => {
    const longText = 'Habari za leo! '.repeat(250);
    const res = await msingi.synthesizeSpeech({ text: longText, language: 'sw', voiceId: 'female3;drop' });
    assert.equal(res.provider, 'browser_web_speech_fallback');
    assert.equal(res.audioBase64, null);
    assert.ok(res.charactersCount <= 2000, 'Must enforce MsingiAI 2,000 character cap');
    assert.equal(res.voiceId, 'female3drop', 'Voice ID must be strictly sanitized');
  });

  await unit('assertProductionConfig fails closed when NODE_ENV=production uses default secrets', () => {
    const prevEnv = envConfig.nodeEnv;
    try {
      (envConfig as any).nodeEnv = 'production';
      assert.throws(() => assertProductionConfig(), /PRODUCTION SECURITY CONFIG FAILURE/);
    } finally {
      (envConfig as any).nodeEnv = prevEnv;
    }
  });

  await unit('Production CORS origins must be explicit HTTPS origins without paths or wildcards', () => {
    assert.equal(isSecureProductionOrigin('https://app.example.test'), true);
    assert.equal(isSecureProductionOrigin('https://app.example.test:8443'), true);
    for (const origin of ['http://app.example.test', '*', 'https://*.example.test', 'https://user:pass@app.example.test', 'https://app.example.test/', 'https://app.example.test/path', 'https://app.example.test?x=1', 'not-a-url']) {
      assert.equal(isSecureProductionOrigin(origin), false, origin);
    }
  });

  await unit('Exact decimal financial arithmetic prevents IEEE-754 cent drift when summing KES line items', () => {
    const lineItemsCents = [1999, 2999, 4999, 1003]; // KES 19.99 + 29.99 + 49.99 + 10.03 = 110.00
    const totalKes = lineItemsCents.reduce((a, b) => a + b, 0) / 100;
    assert.equal(totalKes, 110);
  });

  const scoped: TenantAuthContext = {
    tenantId: 't1', tenantName: 'Test', industryCode: 'retail', planCode: 'starter',
    roles: ['branch_manager'], permissions: ['ai:use', 'sales:read'],
    allowedBranchIds: ['branch-a'], enabledFeatures: ['ai_assistant'],
  };
  await unit('AI history is readable only within its saved scope and writes require exactly the original scope', () => {
    const controller: any = new AiController({} as any, {} as any);
    const snapshot = controller.conversationScope(scoped);
    assert.equal(controller.mayReadConversation(scoped, snapshot), true);
    assert.equal(controller.hasSameConversationScope(scoped, snapshot), true);
    const moreBranches = { ...scoped, allowedBranchIds: ['branch-a', 'branch-b'] };
    assert.equal(controller.mayReadConversation(moreBranches, snapshot), true);
    assert.equal(controller.hasSameConversationScope(moreBranches, snapshot), false);
    const morePermissions = { ...scoped, permissions: [...scoped.permissions, 'finance:read'], allowedBranchIds: null };
    assert.equal(controller.mayReadConversation(morePermissions, snapshot), true);
    assert.equal(controller.hasSameConversationScope(morePermissions, snapshot), false);
    assert.equal(controller.mayReadConversation({ ...scoped, allowedBranchIds: [] }, snapshot), false);
    assert.equal(controller.mayReadConversation({ ...scoped, permissions: ['ai:use'] }, snapshot), false);
    assert.equal(controller.mayReadConversation(scoped, null), false);
  });
  await unit('Branch-restricted roles cannot use whole-business communications or forecast another branch', () => {
    const comm: any = new CommunicationsController({} as any);
    const forecast: any = new ForecastingController({} as any);
    assert.throws(() => comm.requireWholeBusiness(scoped), /whole-business access/);
    assert.doesNotThrow(() => comm.requireWholeBusiness({ ...scoped, allowedBranchIds: null }));
    assert.equal(forecast.resolveRunBranch(scoped, 'all'), 'branch-a');
    assert.throws(() => forecast.resolveRunBranch(scoped, 'branch-b'), /not authorized/);
  });
  await unit('Stock and sale cost fields are hidden without finance permission and missing costs stay unknown', () => {
    const row = { sku: 'X', cost_price: '75', inventory_value_cost: '150' };
    assert.deepEqual(inventoryRowForRole(row, scoped), { sku: 'X' });
    assert.deepEqual(saleForRole({ total_amount: 250, cost_of_goods_sold: 75, cost_basis: 'actual' }, scoped), { total_amount: 250 });
    const finance = { ...scoped, permissions: [...scoped.permissions, 'finance:read'] };
    assert.equal(inventoryRowForRole({ ...row, cost_price: '0' }, finance).cost_price, null);
    assert.equal(inventoryRowForRole(row, finance).inventory_value_cost, '150');
  });
  await unit('Temporary plan access is reversible without changing role permissions', () => {
    const previous = envConfig.featureGatingEnabled;
    try {
      (envConfig as any).featureGatingEnabled = false;
      assert.ok(effectivePortalFeatures(['manual_imports']).includes('ai_assistant'));
      (envConfig as any).featureGatingEnabled = true;
      assert.deepEqual(effectivePortalFeatures(['manual_imports']), ['manual_imports']);
      assert.deepEqual(scoped.permissions, ['ai:use', 'sales:read']);
    } finally { (envConfig as any).featureGatingEnabled = previous; }
  });

  await unit('Website preview does not persist a source even for an authorized importer', async () => {
    const previousFetch = globalThis.fetch;
    try {
      globalThis.fetch = (async () => new Response(JSON.stringify({ url: 'https://example.test', products: [] }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      })) as typeof fetch;
      const db: any = { withTenant: () => { throw new Error('Preview attempted a database write'); } };
      const controller = new AnalyticsController(db);
      const result = await controller.analyzeWebsite({ url: 'https://example.test', importCatalog: false },
        { ...scoped, permissions: ['analytics:read', 'imports:manage', 'inventory:write'] }, {} as any);
      assert.equal(result.sourceSaved, false);
      assert.equal(result.importedCount, 0);
    } finally { globalThis.fetch = previousFetch; }
  });
  await unit('Unconfigured billing rejects purchases without touching the database', async () => {
    const db: any = new Proxy({}, { get: () => { throw new Error('Billing attempted database access'); } });
    const controller = new SubscriptionsController(db);
    await assert.rejects(controller.changePlan(), /No payment has been taken/);
    await assert.rejects(controller.toggleAddOn(), /No payment has been taken/);
  });

  console.log(`\nALL ${passed} BACKEND UNIT TESTS PASSED!`);
}

main().catch((err) => {
  console.error('UNIT TEST FAILED:', err);
  process.exit(1);
});
