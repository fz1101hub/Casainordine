// Fase 1: regressione esplicita dei formati e isolamento delle chiavi locali.
import test from 'node:test';
import assert from 'node:assert/strict';
import { localeFor, formatMoney, formatDate, languageStorageKey } from '../lib/i18n-core.mjs';

const locales = {it:'it-IT',en:'en-GB',es:'es-ES',fr:'fr-FR',de:'de-DE',pt:'pt-PT'};
for (const [lang, locale] of Object.entries(locales)) {
  test(`V32: formati ${lang}, valuta invariata e data civile`, () => {
    assert.equal(localeFor(lang), locale);
    for (const currency of ['EUR','USD']) {
      const formatter = new Intl.NumberFormat(locale,{style:'currency',currency});
      for (const amount of [12345.67,-12345.67,0]) {
        assert.equal(formatMoney(amount,lang,currency),formatter.format(amount));
        assert.equal(formatMoney(String(amount),lang,currency),formatter.format(amount));
      }
    }
    for (const date of ['2024-02-29','2026-01-01','2026-12-31']) {
      const options = {day:'numeric',month:'long',year:'numeric'};
      const expected = new Intl.DateTimeFormat(locale,{...options,timeZone:'UTC'}).format(new Date(date+'T12:00:00Z'));
      assert.equal(formatDate(date,lang,options),expected);
    }
    assert.equal(formatDate('2026-02-29',lang),'—');
    assert.equal(formatMoney(null,lang),'—');
    assert.equal(formatMoney('1,25',lang),'—');
  });
}
test('V32: chiavi preferenza locale separate per account e ospite', () => {
  const keys = [languageStorageKey(),languageStorageKey('test-account-a'),languageStorageKey('test-account-b')];
  assert.equal(new Set(keys).size,3);
  assert.equal(languageStorageKey('test-account-a'),keys[1]);
});
