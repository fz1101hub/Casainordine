import test from 'node:test';
import assert from 'node:assert/strict';
import {acceptedLanguage, browserLanguage, interpolate} from '../lib/i18n-core.mjs';

test('v3.2 public pages negotiate six supported languages by quality and order', () => {
  const cases = [
    ['it-IT,it;q=0.8,en;q=0.5', 'it'],
    ['en-US,en;q=0.9,it;q=0.2', 'en'],
    ['es-MX,fr;q=0.8', 'es'],
    ['fr-CA,es;q=0.5', 'fr'],
    ['de-AT,en;q=0.6', 'de'],
    ['pt-BR,es;q=0.7', 'pt'],
    ['ja-JP,fr;q=0.7,en;q=0.9', 'en'],
    ['fr;q=0.5,de;q=0.5', 'fr'],
    ['*;q=1', 'it'],
    ['', 'it'],
  ];
  for (const [header, expected] of cases) assert.equal(acceptedLanguage(header), expected, header);
});

test('v3.2 rejects excluded and malformed Accept-Language weights', () => {
  const cases = [
    ['en;q=0,fr;q=0.6', 'fr'],
    ['en;q=1.1,pt;q=0.8', 'pt'],
    ['de;q=1e0,es;q=0.7', 'es'],
    ['en;q=0x1,fr;q=0.5', 'fr'],
    ['en;q=0.1234,de;q=0.3', 'de'],
    ['fr;q=0.8;q=0.2,it;q=0.7', 'it'],
    ['pt;foo=bar,es;q=0.6', 'es'],
    ['en;q=-1', 'it'],
    ['en;q=0.000', 'it'],
  ];
  for (const [header, expected] of cases) assert.equal(acceptedLanguage(header), expected, header);
});

test('v3.2 browser language and template placeholders are safe with missing values', () => {
  assert.equal(browserLanguage('PT_br'), 'pt');
  assert.equal(browserLanguage('malformed locale!'), 'it');
  assert.equal(interpolate('Ciao {name}, {missing}', {name:'Ada'}), 'Ciao Ada, {missing}');
  assert.equal(interpolate('{count} elementi', {count:0}), '0 elementi');
  assert.equal(interpolate('{name}', null), '{name}');
});
