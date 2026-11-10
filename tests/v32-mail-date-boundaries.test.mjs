import test from 'node:test';
import assert from 'node:assert/strict';
import { formatMailDate } from '../lib/mail-date.mjs';

const locales = ['it-IT', 'en-GB', 'es-ES', 'fr-FR', 'de-DE', 'pt-PT'];

for (const locale of locales) {
  test(`mail due dates are stable calendar days in ${locale}`, () => {
    const expected = new Intl.DateTimeFormat(locale, {
      day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC'
    }).format(new Date('2026-01-02T12:00:00Z'));
    assert.equal(formatMailDate('2026-01-02', locale, '—'), expected);
    assert.equal(formatMailDate('2024-02-29', locale, '—'),
      new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })
        .format(new Date('2024-02-29T12:00:00Z')));
  });
  test(`invalid calendar days do not silently roll over in ${locale}`, () => {
    for (const value of ['2025-02-29', '2026-02-30', '2026-04-31', '2026-13-01', 'not a date', '', null]) {
      assert.equal(formatMailDate(value, locale, '—'), '—', String(value));
    }
  });
}

test('fallback is returned for invalid locale instead of throwing', () => {
  assert.equal(formatMailDate('2026-01-02', 'not_a_locale', '—'), '—');
});
