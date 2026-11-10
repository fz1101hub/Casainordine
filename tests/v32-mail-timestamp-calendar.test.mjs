import test from 'node:test';
import assert from 'node:assert/strict';
import { formatMailDate } from '../lib/mail-date.mjs';

const locales = ['it-IT', 'en-GB', 'es-ES', 'fr-FR', 'de-DE', 'pt-PT'];

test('mail ISO timestamps reject impossible calendar dates in all six languages', () => {
  for (const locale of locales) {
    for (const input of [
      '2026-02-30T12:00:00Z',
      '2025-02-29T12:00:00+01:00',
      '2026-04-31T12:00:00Z',
      '2026-13-01T12:00:00Z',
      '2026-00-01T12:00:00Z',
      '2026-01-00T12:00:00Z'
    ]) {
      assert.equal(formatMailDate(input, locale, 'INVALID'), 'INVALID', `${locale}: ${input}`);
    }
    for (const input of ['2024-02-29', '2024-02-29T12:00:00Z', '2026-01-02T00:30:00Z']) {
      assert.notEqual(formatMailDate(input, locale, 'INVALID'), 'INVALID', `${locale}: ${input}`);
    }
  }
});
