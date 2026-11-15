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

for (const locale of locales) {
  test(`V20 ISO calendar and timezone validation: ${locale}`, () => {
    const fallback = 'date unavailable';
    for (const invalid of [
      '2026-02-29', '1900-02-29', '2026-06-31', '0000-01-01',
      '2026-11-15T12:00:00+24:00', '2026-11-15T12:00:00-02:60',
      '2026-11-15T12:00:00.1234567890Z',
      '15/11/2026', '11/15/2026', '2026-11-15T12:00:00Z extra',
      '2026-11-15T12:00', '2026-11-15T12:00:00',
      '2026-11-15 12:00:00', '2026-11-15T12:00:00.123',
    ]) {
      assert.equal(formatV20Timestamp(invalid, locale, fallback), fallback, invalid);
      assert.equal(formatV20Date(invalid, locale, fallback), fallback, invalid);
    }
    for (const valid of [
      '2024-02-29', '2000-02-29', '2026-11-15T23:59:59Z',
      '2026-11-15T12:00:00.123456789Z', '2026-11-15T12:00:00+01:00',
    ]) {
      assert.notEqual(formatV20Timestamp(valid, locale, fallback), fallback, valid);
    }
  });

}

// Equivalent ISO instants must render identically regardless of provider offset.
// This guards against accidentally treating an explicit offset as local wall time.
for (const locale of locales) {
  test(`V20 equivalent instants across provider offsets: ${locale}`, () => {
    const variants = [
      '2026-03-29T01:30:00Z',
      '2026-03-29T03:30:00+02:00',
      '2026-03-28T20:30:00-05:00',
    ];
    const expected = new Date(variants[0]);
    for (const input of variants) {
      assert.equal(formatV20Timestamp(input, locale), expected.toLocaleString(locale, {timeZone: zone}), input);
      assert.equal(formatV20Date(input, locale), expected.toLocaleDateString(locale, {timeZone: zone}), input);
    }
  });
}


// The repeated Rome wall-clock hour at autumn DST transition represents two
// distinct instants. Verify both with Intl rather than assuming a fixed offset.
for (const locale of locales) {
  test(`V20 autumn DST repeated hour preserves both instants: ${locale}`, () => {
    const earlier = '2026-10-25T00:30:00Z';
    const later = '2026-10-25T01:30:00Z';
    for (const instant of [earlier, later]) {
      const expected = new Date(instant);
      assert.equal(formatV20Timestamp(instant, locale), expected.toLocaleString(locale, {timeZone: zone}));
      assert.equal(formatV20Date(instant, locale), expected.toLocaleDateString(locale, {timeZone: zone}));
    }
    // Both dates are the same even though their UTC instants differ.
    assert.equal(formatV20Date(earlier, locale), formatV20Date(later, locale));
  });
}

// Accepted ISO separators must behave consistently across browser and Node engines.
for (const locale of locales) {
  test(`V20 lowercase and space ISO separators: ${locale}`, () => {
    const canonical = '2026-11-15T12:30:00Z';
    for (const variant of ['2026-11-15t12:30:00z', '2026-11-15 12:30:00Z', '2026-11-15T12:30:00z']) {
      assert.equal(formatV20Timestamp(variant, locale), formatV20Timestamp(canonical, locale));
      assert.equal(formatV20Date(variant, locale), formatV20Date(canonical, locale));
    }
  });
}
