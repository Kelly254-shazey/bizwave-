import assert from 'node:assert/strict';
import { formatKes, t, translations } from '../src/i18n/translations';
import { ApiError } from '../src/services/api';
import { formatCompactAxis, formatKesPrecise } from '../src/utils/format';

let passed = 0;
function unit(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  PASS [FU${passed}]: ${name}`);
}

console.log('=== BizWave Frontend Unit Test Suite ===');

unit('English and Kiswahili translation dictionaries have 100% key parity with zero empty strings', () => {
  const enKeys = Object.keys(translations.en).sort();
  const swKeys = Object.keys(translations.sw).sort();
  assert.deepEqual(enKeys, swKeys, 'Every English UI key must have a Kiswahili equivalent');
  for (const key of enKeys) {
    assert.ok(translations.en[key].trim().length > 0, `Empty EN string for ${key}`);
    assert.ok(translations.sw[key].trim().length > 0, `Empty SW string for ${key}`);
  }
});

unit('Translation helper t() resolves EN, SW, and gracefully falls back to key name if missing', () => {
  assert.equal(t('en', 'total_revenue'), 'Total Revenue');
  assert.equal(t('sw', 'total_revenue'), 'Jumla ya Mapato');
  assert.equal(t('en', 'nonexistent_future_key'), 'nonexistent_future_key');
});

unit('formatKes() formats positive, zero, negative reversal, null, undefined, and NaN values safely', () => {
  assert.equal(formatKes(0), 'KES 0');
  assert.equal(formatKes(125000), 'KES 125,000');
  assert.equal(formatKes(-4500), 'KES -4,500');
  assert.equal(formatKes(null), '—');
  assert.equal(formatKes(undefined), '—');
  assert.equal(formatKes(Number.NaN), '—');
});

unit('Precise KES labels show cents without turning missing amounts into zero', () => {
  assert.equal(formatKesPrecise(935), 'KES 935.00');
  assert.equal(formatKesPrecise('2162.16'), 'KES 2,162.16');
  assert.equal(formatKesPrecise(-1.5), 'KES -1.50');
  assert.equal(formatKesPrecise(null), '—');
  assert.equal(formatKesPrecise(''), '—');
  assert.equal(formatKesPrecise(Number.POSITIVE_INFINITY), '—');
});

unit('Compact chart labels keep the sign, use appropriate units, and handle invalid values', () => {
  assert.equal(formatCompactAxis(935), '935');
  assert.equal(formatCompactAxis(1_200), '1.2k');
  assert.equal(formatCompactAxis(1_200_000), '1.2m');
  assert.equal(formatCompactAxis(-2_000_000_000), '-2b');
  assert.equal(formatCompactAxis(Number.NaN), '—');
});

unit('ApiError preserves HTTP status code, readable message, and structured backend details', () => {
  const err = new ApiError('Plan upgrade required', 403, { code: 'PLAN_UPGRADE_REQUIRED' });
  assert.equal(err.status, 403);
  assert.equal(err.message, 'Plan upgrade required');
  assert.equal(err.details.code, 'PLAN_UPGRADE_REQUIRED');
  assert.ok(err instanceof Error);
});

unit('All 6 exact primary public navigation labels exist in i18n catalog', () => {
  const expected = ['Home', 'Benefits', 'How It Works', 'Contact', 'Login', 'Register'];
  const actual = [
    t('en', 'nav_home'),
    t('en', 'nav_benefits'),
    t('en', 'nav_how'),
    t('en', 'nav_contact'),
    t('en', 'nav_login'),
    t('en', 'nav_register'),
  ];
  assert.deepEqual(actual, expected);
});

console.log(`\nALL ${passed} FRONTEND UNIT TESTS PASSED!`);
