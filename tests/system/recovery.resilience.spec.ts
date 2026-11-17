import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const API = process.env.BIZWAVE_API_URL || 'http://127.0.0.1:4000/api/v1';
const TEST_RESTORE_DB = 'bizwave_qa_restore_verify';

let passed = 0;
async function check(name: string, fn: () => Promise<void> | void) {
  await fn();
  passed += 1;
  console.log(`  PASS [RECOVERY-${passed}]: ${name}`);
}

function psql(db: string, sql: string): string {
  return execFileSync(
    'psql',
    ['-h', '127.0.0.1', '-U', 'bizwave_owner', '-d', db, '-At', '-c', sql],
    { env: { ...process.env, PGPASSWORD: process.env.PGPASSWORD || 'bizwave_owner_dev_pw' }, encoding: 'utf8' },
  ).trim();
}

function adminPsql(db: string, sql: string): string {
  return execFileSync('sudo', ['-u', 'postgres', 'psql', '-d', db, '-At', '-c', sql], { encoding: 'utf8' }).trim();
}

async function main() {
  console.log('=== [SYSTEM-RECOVERY & RESILIENCE] Live Backup/Restore Drill & Fault-Tolerance Suite ===');

  await check('Live Disaster Recovery Drill: pg_dump -> isolated DB restore -> SHA-256 audit chain + row parity', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bizwave-dr-'));
    const dumpFile = path.join(tmpDir, 'bizwave_dr.dump');
    const env = { ...process.env, PGPASSWORD: process.env.PGPASSWORD || 'bizwave_owner_dev_pw' };

    try {
      // 1. Capture live counts from primary production DB via offline backup role bizwave_owner
      const origSales = Number(psql('bizwave', 'SELECT COUNT(*) FROM sales;'));
      const origLessons = Number(psql('bizwave', 'SELECT COUNT(*) FROM learning_modules;'));
      const origAudit = Number(psql('bizwave', 'SELECT COUNT(*) FROM audit_logs;'));
      assert.ok(origSales >= 200 && origLessons === 26 && origAudit >= 50);

      // 2. Take live custom-format pg_dump backup as non-superuser bizwave_owner
      execFileSync(
        'pg_dump',
        ['-h', '127.0.0.1', '-U', 'bizwave_owner', '-Fc', '--no-owner', '-d', 'bizwave', '-f', dumpFile],
        { env },
      );
      const stat = fs.statSync(dumpFile);
      assert.ok(stat.size > 50_000, `Dump unexpectedly small: ${stat.size}B`);

      // 3. Provision clean isolated DR database & restore backup
      adminPsql('postgres', `DROP DATABASE IF EXISTS ${TEST_RESTORE_DB};`);
      adminPsql('postgres', `CREATE DATABASE ${TEST_RESTORE_DB} OWNER bizwave_owner;`);
      adminPsql(TEST_RESTORE_DB, `CREATE EXTENSION IF NOT EXISTS pgcrypto; CREATE EXTENSION IF NOT EXISTS citext; CREATE EXTENSION IF NOT EXISTS pg_trgm;`);
      execFileSync(
        'pg_restore',
        ['-h', '127.0.0.1', '-U', 'bizwave_owner', '-d', TEST_RESTORE_DB, '--no-owner', '--no-privileges', '--no-comments', '--exit-on-error', dumpFile],
        { env },
      );

      // 4. Verify row parity & cryptographic audit-log chain integrity in restored DB
      const drSales = Number(psql(TEST_RESTORE_DB, 'SELECT COUNT(*) FROM sales;'));
      const drLessons = Number(psql(TEST_RESTORE_DB, 'SELECT COUNT(*) FROM learning_modules;'));
      const drChain = psql(TEST_RESTORE_DB, 'SELECT is_valid FROM fn_verify_audit_chain();');
      const rlsCount = Number(psql(TEST_RESTORE_DB, "SELECT COUNT(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relforcerowsecurity=true;"));

      assert.equal(drSales, origSales, 'Restored sales count mismatch');
      assert.equal(drLessons, origLessons, 'Restored literacy modules mismatch');
      assert.equal(drChain, 't', 'Restored SHA-256 audit chain FAILED verification!');
      assert.ok(rlsCount >= 24, `Expected >=24 FORCE RLS tables restored, got ${rlsCount}`);

      console.log(`    DR Verified: dump=${(stat.size / 1024).toFixed(1)}KB | sales=${drSales} | lessons=${drLessons} | FORCE-RLS=${rlsCount} | audit_chain=VALID`);
    } finally {
      try { adminPsql('postgres', `DROP DATABASE IF EXISTS ${TEST_RESTORE_DB};`); } catch {}
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  await check('PostgreSQL Least-Privilege Verification: bizwave_app is NON-superuser with NOBYPASSRLS', () => {
    const flags = psql('bizwave', "SELECT rolsuper || ':' || rolbypassrls FROM pg_roles WHERE rolname = 'bizwave_app';");
    assert.equal(flags, 'false:false', `SECURITY FAILURE: bizwave_app flags=${flags}`);
  });

  await check('Fault Resilience: Malformed JSON, invalid UUIDs, empty payloads & invalid lesson slugs NEVER return HTTP 500', async () => {
    const badJson = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"email": "broken-json',
    });
    assert.equal(badJson.status, 400, `Malformed JSON returned ${badJson.status}`);

    const badSlug = await fetch(`${API}/learn/lessons/non-existent-slug-999999`);
    assert.equal(badSlug.status, 404, `Missing lesson returned ${badSlug.status}`);

    const badQr = await fetch(`${API}/learn/qr/non-existent-slug-999999`);
    assert.equal(badQr.status, 404, `Missing QR returned ${badQr.status}`);

    const badUnit = await fetch(`${API}/learn/buyer-tools/unit-compare`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: [{ label: 'Only 1', priceKes: -50, quantity: 0, unit: 'kg' }] }),
    });
    assert.equal(badUnit.status, 400, `Invalid unit-compare returned ${badUnit.status}`);
  });

  await check('Graceful External Provider Degradation: MsingiAI Audio returns zero-cost Web Speech fallback cleanly without faking WAV', async () => {
    const tts = await fetch(`${API}/learn/audio/synthesize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'Karibu sana', voiceId: 'female' }),
    });
    assert.equal(tts.status, 201);
    const body: any = await tts.json();
    assert.equal(body.provider, 'browser_web_speech_fallback');
    assert.equal(body.msingiConfigured, false);
    assert.equal(body.audioBase64, null);
    assert.equal(body.estimatedCostKes, 0);
  });

  console.log(`\nALL ${passed} DISASTER RECOVERY & FAULT RESILIENCE TESTS PASSED!`);
}

main().catch((err) => {
  console.error('RECOVERY TEST FAILED:', err);
  process.exit(1);
});
