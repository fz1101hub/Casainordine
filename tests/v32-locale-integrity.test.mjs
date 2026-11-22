import test from 'node:test';
import assert from 'node:assert/strict';
import {LANGUAGES, formatMoney, formatDate, localeFor} from '../lib/i18n-core.mjs';

// Fase 1 v3.2: le cifre e le date non devono cambiare significato cambiando lingua.
test('six locales preserve EUR value, sign and fractional cents', () => {
  for (const {code} of LANGUAGES) {
    const positive = formatMoney(1234.56, code);
    const negative = formatMoney(-1234.56, code);
    const zero = formatMoney(0, code);
    const formatter = new Intl.NumberFormat(localeFor(code), {style:'currency', currency:'EUR'});
    assert.equal(positive, formatter.format(1234.56), code);
    assert.equal(negative, formatter.format(-1234.56), code);
    assert.equal(zero, formatter.format(0), code);
    assert.equal(formatMoney('1234.56', code), positive, code+' numeric DB string');
    assert.notEqual(negative, positive, code+' signed amount');
  }
});
test('ISO calendar dates retain their day across all locales and DST boundaries', () => {
  for (const {code} of LANGUAGES) {
    for (const iso of ['2026-03-29','2026-10-25','2024-02-29','2026-12-31']) {
      const expected = new Intl.DateTimeFormat(localeFor(code), {
        day:'numeric', month:'short', year:'numeric', timeZone:'UTC'
      }).format(new Date(iso+'T12:00:00Z'));
      assert.equal(formatDate(iso, code), expected, code+' '+iso);
    }
    for (const invalid of ['2026-02-29','2026-04-31','2026-00-01','2026-13-01','2026-1-01','']) {
      assert.equal(formatDate(invalid, code), '—', code+' '+invalid);
    }
  }
});
