import test from 'node:test';
import assert from 'node:assert/strict';
import {formatV20Timestamp} from '../lib/v20-timestamp.mjs';

test('V20 timestamp rejects missing and invalid provider values', () => {
  for (const value of [null, undefined, '', '   ', 'not-a-date', {}, 0, NaN]) {
    assert.equal(formatV20Timestamp(value, 'it-IT', 'Mai'), 'Mai');
  }
  assert.equal(formatV20Timestamp('2026-11-14T08:00:00Z', 'invalid_locale!', 'Mai'), 'Mai');
});

test('V20 timestamp uses the account locale and Europe/Rome timezone', () => {
  const iso = '2026-11-14T08:00:00Z';
  for (const locale of ['it-IT', 'en-GB', 'es-ES', 'fr-FR', 'de-DE', 'pt-PT']) {
    assert.equal(formatV20Timestamp(iso, locale, 'Mai'), new Date(iso).toLocaleString(locale, {timeZone: 'Europe/Rome'}));
  }
});
