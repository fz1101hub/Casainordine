import test from 'node:test';
import assert from 'node:assert/strict';
import { formatMailDate } from '../lib/mail-date.mjs';

const locales = ['it-IT', 'en-GB', 'es-ES', 'fr-FR', 'de-DE', 'pt-PT'];

// Date-only values must be calendar days, while timestamps represent instants.
// Exercise explicit offsets independently of the machine's configured time zone.
for (const locale of locales) {
  test(`mail date calendar validation with ISO offsets: ${locale}`, () => {
    const fallback = 'INVALID';
    for (const bad of [
      '1900-02-29T12:00:00+01:00',
      '2026-04-31T12:00:00-10:00',
      '2026-02-30t12:00:00+14:00',
      '2026-13-01T12:00:00Z',
    ]) assert.equal(formatMailDate(bad, locale, fallback), fallback, bad);
    for (const good of [
      '2000-02-29T12:00:00+01:00',
      '2024-02-29T12:00:00-10:00',
      '2026-01-02T00:30:00+14:00',
    ]) assert.notEqual(formatMailDate(good, locale, fallback), fallback, good);
    assert.equal(
      formatMailDate('2026-01-02T00:30:00+14:00', locale, fallback),
      formatMailDate('2026-01-01T10:30:00Z', locale, fallback)
    );
  });
}
