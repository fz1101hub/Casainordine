import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

// Exercise separate processes because Node's default time zone is process-wide.
// Calendar-only due dates must not change when the device time zone changes.
const zones = ['UTC', 'America/Los_Angeles', 'Pacific/Honolulu', 'Europe/Rome', 'Asia/Tokyo', 'Pacific/Auckland'];
const locales = ['it-IT', 'en-GB', 'es-ES', 'fr-FR', 'de-DE', 'pt-PT'];
const script = `
import { formatMailDate } from './lib/mail-date.mjs';
const locales = ['it-IT', 'en-GB', 'es-ES', 'fr-FR', 'de-DE', 'pt-PT'];
console.log(JSON.stringify(locales.map(locale => ({
  locale,
  dateOnly: formatMailDate('2026-01-02', locale, 'INVALID'),
  leapDay: formatMailDate('2024-02-29', locale, 'INVALID'),
  invalid: formatMailDate('2026-02-30', locale, 'INVALID')
}))));
`;

test('mail date-only rendering is independent of browser/system time zone in six languages', () => {
  const expected = locales.map(locale => ({
    locale,
    dateOnly: new Intl.DateTimeFormat(locale, {
      day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC'
    }).format(new Date('2026-01-02T12:00:00Z')),
    leapDay: new Intl.DateTimeFormat(locale, {
      day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC'
    }).format(new Date('2024-02-29T12:00:00Z')),
    invalid: 'INVALID'
  }));
  for (const TZ of zones) {
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
      cwd: process.cwd(),
      env: { ...process.env, TZ },
      encoding: 'utf8',
      timeout: 10000
    });
    assert.equal(result.status, 0, `${TZ}: ${result.stderr || result.error?.message}`);
    assert.deepEqual(JSON.parse(result.stdout), expected, TZ);
  }
});
