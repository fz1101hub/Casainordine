import test from 'node:test';
import assert from 'node:assert/strict';
import { formatMailDate } from '../lib/mail-date.mjs';

const locales = ['it-IT', 'en-GB', 'es-ES', 'fr-FR', 'de-DE', 'pt-PT'];

for (const locale of locales) {
  test(`mail dates ignore surrounding whitespace without changing calendar-day semantics: ${locale}`, () => {
    const fallback = 'UNKNOWN';
    const day = formatMailDate('2026-01-02', locale, fallback);
    assert.notEqual(day, fallback);
    assert.equal(formatMailDate(' 2026-01-02 ', locale, fallback), day);
    assert.equal(formatMailDate('\n2026-01-02\t', locale, fallback), day);
    const instant = formatMailDate('2026-01-02T00:30:00Z', locale, fallback);
    assert.equal(formatMailDate(' 2026-01-02T00:30:00Z ', locale, fallback), instant);
    assert.equal(formatMailDate('  ', locale, fallback), fallback);
    assert.equal(formatMailDate(' 2026-02-30 ', locale, fallback), fallback);
    assert.equal(formatMailDate(' 2026-02-30t12:00:00Z ', locale, fallback), fallback);
  });
}
