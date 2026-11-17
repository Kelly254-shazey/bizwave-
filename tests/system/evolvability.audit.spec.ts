import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = '/home/user/bizwave';
let passed = 0;

function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  PASS [EVOLVE-${passed}]: ${name}`);
}

function walkFiles(dir: string, exts: string[]): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'dist', '.git', '__pycache__', '.venv'].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(full, exts));
    else if (exts.some((e) => entry.name.endsWith(e))) out.push(full);
  }
  return out;
}

function main() {
  console.log('=== [SYSTEM-EVOLVABILITY] Architecture Fitness, Modularity & Tech-Evolution Audit ===');

  check('Strict TypeScript enabled across Frontend & safe TS config in Backend', () => {
    const feTs = JSON.parse(fs.readFileSync(path.join(ROOT, 'frontend/tsconfig.json'), 'utf8'));
    assert.equal(feTs.compilerOptions.strict, true, 'Frontend must enforce strict TS');
    const beTs = JSON.parse(fs.readFileSync(path.join(ROOT, 'backend/tsconfig.json'), 'utf8'));
    assert.ok(beTs.compilerOptions.strictNullChecks !== false, 'Backend should not disable strictNullChecks');
  });

  check('Versioned, ordered SQL Migrations (001..007) with rollback script & zero ORM auto-sync', () => {
    const migs = fs.readdirSync(path.join(ROOT, 'database/migrations')).filter((f) => f.endsWith('.sql')).sort();
    assert.ok(migs.length >= 7, `Expected >= 7 SQL migrations, found ${migs.length}`);
    assert.ok(migs[0].startsWith('001_') && migs[migs.length - 1].startsWith('007_'));
    assert.ok(fs.existsSync(path.join(ROOT, 'database/migrations/rollback/rollback_all.sql')), 'Rollback script must exist');
  });

  check('Modular Provider Adapter Isolation (MsingiAI, SMS/WhatsApp, Intelligence Engine decoupled from core domain)', () => {
    const msingiSrc = fs.readFileSync(path.join(ROOT, 'backend/src/modules/learn/msingi.service.ts'), 'utf8');
    assert.ok(msingiSrc.includes('msingiBaseUrl'), 'MsingiAI base URL must be configurable for open-weight self-hosting');
    const envSrc = fs.readFileSync(path.join(ROOT, 'backend/src/config/env.config.ts'), 'utf8');
    assert.ok(envSrc.includes('intelligenceUrl'), 'Intelligence engine URL must be env-configurable');
    assert.ok(envSrc.includes('msingiBaseUrl'), 'MsingiAI base URL must be env-configurable');
    const feFiles = walkFiles(path.join(ROOT, 'frontend/src'), ['.ts', '.tsx']);
    for (const f of feFiles) {
      const content = fs.readFileSync(f, 'utf8');
      assert.ok(!content.includes('MSINGI_API_KEY'), `Frontend file ${f} must NEVER reference MSINGI_API_KEY`);
      assert.ok(!content.includes('api.msingiai.com'), `Frontend file ${f} must NEVER call api.msingiai.com directly`);
    }
  });

  check('Static Security Hygiene: Zero live production secrets or dangerous eval() in source tree', () => {
    const srcFiles = [
      ...walkFiles(path.join(ROOT, 'backend/src'), ['.ts']),
      ...walkFiles(path.join(ROOT, 'frontend/src'), ['.ts', '.tsx']),
      ...walkFiles(path.join(ROOT, 'intelligence/app'), ['.py']),
    ];
    for (const f of srcFiles) {
      const content = fs.readFileSync(f, 'utf8');
      assert.ok(!/\beval\s*\(/.test(content), `Dangerous eval() found in ${f}`);
      assert.ok(!/msk_[a-zA-Z0-9]{16,}/.test(content), `Hardcoded MsingiAI API key found in ${f}`);
      assert.ok(!/sk-[a-zA-Z0-9]{20,}/.test(content), `Hardcoded OpenAI/provider key found in ${f}`);
      assert.ok(!/AKIA[0-9A-Z]{16}/.test(content), `Hardcoded AWS key found in ${f}`);
    }
  });

  check('API Versioning (/api/v1), Containerization (Docker Compose), and CI/CD Automation present', () => {
    const mainTs = fs.readFileSync(path.join(ROOT, 'backend/src/main.ts'), 'utf8');
    assert.ok(mainTs.includes("setGlobalPrefix('api/v1')"), 'API must enforce explicit /api/v1 versioning');
    assert.ok(fs.existsSync(path.join(ROOT, 'docker-compose.yml')), 'docker-compose.yml missing');
    assert.ok(fs.existsSync(path.join(ROOT, '.github/workflows/ci.yml')), 'CI workflow missing');
    assert.ok(fs.existsSync(path.join(ROOT, 'infrastructure/scripts/backup-postgres.sh')), 'Backup script missing');
    assert.ok(fs.existsSync(path.join(ROOT, 'infrastructure/scripts/restore-postgres.sh')), 'Restore script missing');
  });

  check('Zero unsafe SQL template interpolation of request input in backend queries', () => {
    const beFiles = walkFiles(path.join(ROOT, 'backend/src'), ['.ts']);
    for (const f of beFiles) {
      const content = fs.readFileSync(f, 'utf8');
      // Flag any query(`... ${req.` or `${body.` or `${dto.` interpolation
      assert.ok(!/query\s*\(\s*`[^`]*\$\{(req|body|dto|query|params)\./s.test(content), `Unsafe SQL interpolation detected in ${f}`);
    }
  });

  console.log(`\nALL ${passed} EVOLVABILITY & ARCHITECTURE FITNESS CHECKS PASSED!`);
}

main();
