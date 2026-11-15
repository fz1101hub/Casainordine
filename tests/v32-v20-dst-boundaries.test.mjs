import test from 'node:test';
import assert from 'node:assert/strict';
import {formatV20Date, formatV20Timestamp} from '../lib/v20-timestamp.mjs';

const locales = ['it-IT', 'en-GB', 'es-ES', 'fr-FR', 'de-DE', 'pt-PT'];
const zone = 'Europe/Rome';

// DST boundary coverage: UTC instants are unambiguous even when Rome clocks
// repeat an hour or skip an hour. Never compare against the CI host timezone.
for (const locale of locales) {
  for (const instant of [
    '2026-03-29T00:30:00Z',
    '2026-03-29T01:30:00Z',
    '2026-10-25T00:30:00Z',
    '2026-10-25T01:30:00Z',
    '2026-12-31T23:30:00Z',
  ]) {
    test(`V20 DST and year boundary: ${locale} ${instant}`, () => {
      const date = new Date(instant);
      assert.equal(
        formatV20Date(instant, locale),
        new Intl.DateTimeFormat(locale, {timeZone: zone}).format(date),
      );
      assert.equal(
        formatV20Timestamp(instant, locale),
        date.toLocaleString(locale, {timeZone: zone}),
      );
    });
  }
  test(`V20 invalid date inputs do not reach UI: ${locale}`, () => {
    for (const input of [null, undefined, 42, {}, '2026-00-01', '2026-04-31', '2026-11-15T25:00:00Z', '2026-11-15T12:00:00+25:00', '2026-11-15T24:00:00Z', '2026-11-15T12:60:00Z', '2026-11-15T12:00:60Z', '2026-11-15T12:00:00+02:60']) {
      assert.equal(formatV20Timestamp(input, locale, 'not available'), 'not available');
    }
  });
}
