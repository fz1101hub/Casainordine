import test from 'node:test';
import assert from 'node:assert/strict';
import {formatV20Date, formatV20Timestamp} from '../lib/v20-timestamp.mjs';

// Regression coverage for all six v3.2 UI locales. These are format checks,
// not translations of provider/user-generated text.
const locales = ['it-IT', 'en-GB', 'es-ES', 'fr-FR', 'de-DE', 'pt-PT'];
for (const locale of locales) {
  test(`V20 dates use the selected locale (${locale})`, () => {
    const expected = new Intl.DateTimeFormat(locale, {timeZone:'Europe/Rome'}).format(new Date('2026-11-15T12:30:00Z'));
    assert.equal(formatV20Date('2026-11-15T12:30:00Z', locale), expected);
    assert.ok(!formatV20Timestamp('2026-11-15T12:30:00Z', locale).includes('Invalid Date'));
  });
  test(`V20 refuses ambiguous or invalid provider dates (${locale})`, () => {
    for (const invalid of ['', '03/04/2026', '2026-02-30', '2025-02-29', '2026-13-01', 'not a date']) {
      assert.equal(formatV20Date(invalid, locale, 'n/a'), 'n/a');
    }
    assert.notEqual(formatV20Date('2028-02-29', locale, 'n/a'), 'n/a');
  });
}
