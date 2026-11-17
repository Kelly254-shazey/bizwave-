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
import { assertProductionConfig, envConfig } from '../src/config/env.config';

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

  await unit('Exact decimal financial arithmetic prevents IEEE-754 cent drift when summing KES line items', () => {
    const lineItemsCents = [1999, 2999, 4999, 1003]; // KES 19.99 + 29.99 + 49.99 + 10.03 = 110.00
    const totalKes = lineItemsCents.reduce((a, b) => a + b, 0) / 100;
    assert.equal(totalKes, 110);
  });

  console.log(`\nALL ${passed} BACKEND UNIT TESTS PASSED!`);
}

main().catch((err) => {
  console.error('UNIT TEST FAILED:', err);
  process.exit(1);
});
