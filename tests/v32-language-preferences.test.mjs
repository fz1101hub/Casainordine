import test from 'node:test';
import assert from 'node:assert/strict';
import {LANGUAGES, DEFAULT_LANGUAGE, acceptedLanguage, browserLanguage, normalizeLanguage, languageStorageKey, localeFor} from '../lib/i18n-core.mjs';

// Fase 1 v3.2: preferenze lingua, fallback e intestazioni di pagine condivise.
test('language normalization supports six languages and regional variants', () => {
 for (const {code,locale} of LANGUAGES) {
  assert.equal(normalizeLanguage(code.toUpperCase()),code);
  assert.equal(normalizeLanguage(locale),code);
  assert.equal(browserLanguage(locale.replace('-','_')),code);
  assert.equal(localeFor(code),locale);
 }
 for (const value of [null,'','xx','<script>','unknown']) {
  assert.equal(normalizeLanguage(value),DEFAULT_LANGUAGE);
  assert.equal(browserLanguage(value),DEFAULT_LANGUAGE);
 }
});

test('Accept-Language honors quality, exclusions and stable tie ordering', () => {
 assert.equal(acceptedLanguage('fr-FR,fr;q=0.9,en;q=0.8'),'fr');
 assert.equal(acceptedLanguage('en;q=0.3,de-DE;q=0.9,it;q=0.2'),'de');
 assert.equal(acceptedLanguage('es;q=0,en;q=0.8'),'en');
 assert.equal(acceptedLanguage('pt;q=0,fr;q=0'),DEFAULT_LANGUAGE);
 assert.equal(acceptedLanguage('xx;q=1,es;q=0.5'),'es');
 assert.equal(acceptedLanguage('de;q=0.7,fr;q=0.7'),'de');
 assert.equal(acceptedLanguage('en;q=banana,pt;q=0.5'),'pt');
 assert.equal(acceptedLanguage(null),DEFAULT_LANGUAGE);
});

test('account-scoped language preference keys do not overlap', () => {
 const anonymous=languageStorageKey();
 const first=languageStorageKey('account-a');
 const second=languageStorageKey('account-b');
 assert.notEqual(first,second);
 assert.notEqual(first,anonymous);
 assert.notEqual(second,anonymous);
 assert.equal(languageStorageKey('account-a'),first);
});
