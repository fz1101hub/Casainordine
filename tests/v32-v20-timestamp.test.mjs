import test from 'node:test';
import assert from 'node:assert/strict';
import {formatV20Timestamp, formatV20Date} from '../lib/v20-timestamp.mjs';

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

test('V20 history, trash and offline dates reject malformed values', () => {
  for (const value of [null, '', 'invalid', {}, 0]) {
    assert.equal(formatV20Timestamp(value, 'fr-FR'), '—');
    assert.equal(formatV20Date(value, 'de-DE'), '—');
  }
  const iso = '2026-11-14T08:00:00Z';
  for (const locale of ['it-IT', 'en-GB', 'es-ES', 'fr-FR', 'de-DE', 'pt-PT']) {
    assert.equal(formatV20Date(iso, locale), new Date(iso).toLocaleDateString(locale, {timeZone: 'Europe/Rome'}));
  }
});
