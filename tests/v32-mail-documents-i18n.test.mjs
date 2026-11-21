import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mailStartMessage } from '../lib/mail-api-i18n.mjs';

const locales = ['it','en','es','fr','de','pt'];
test('document loading errors have six localized variants', () => {
  const values = locales.map(locale => mailStartMessage('documentsLoad', locale));
  assert.equal(new Set(values).size, 6);
  for (const value of values) assert.ok(value.length > 12);
  assert.equal(mailStartMessage('documentsLoad', 'xx'), values[0]);
});
test('document GET keeps user scope and localizes its failures', () => {
  const source = readFileSync(new URL('../app/api/mail/documents/route.js', import.meta.url), 'utf8');
  assert.match(source, /\.eq\('user_id',user\.id\)/);
  assert.match(source, /mailStartMessage\('documentsLoad',request\.headers\.get\('accept-language'\)\)/);
  assert.match(source, /failure\(error,mailStartMessage\('documentsLoad'/);
});

test('document PATCH errors and warnings are translated in every locale', () => {
  const keys = ['connectionsLogin','documentsInvalid','documentsBillMissing','documentsRead',
    'documentsMissing','documentsUpdate','documentsProcessed','documentsLearning','documentsStorage'];
  for (const key of keys) {
    const variants = locales.map(locale => mailStartMessage(key, locale));
    assert.equal(variants.length, 6);
    assert.equal(new Set(variants).size, 6, key);
    assert.ok(variants.every(value => typeof value === 'string' && value.length > 5), key);
    assert.equal(mailStartMessage(key, 'xx'), variants[0]);
  }
});
test('document PATCH retains account-scoped reads and conditional update', () => {
  const source = readFileSync(new URL('../app/api/mail/documents/route.js', import.meta.url), 'utf8');
  for (const key of ['connectionsLogin','documentsInvalid','documentsBillMissing','documentsRead',
    'documentsMissing','documentsUpdate','documentsProcessed','documentsLearning','documentsStorage']) {
    assert.ok(source.includes("message('" + key + "')"), key);
  }
  assert.match(source, /export async function PATCH\(request\)/);
  assert.match(source, /\.eq\('user_id',user\.id\)\.eq\('id',id\)\.eq\('status','pending'\)/);
  assert.match(source, /\.eq\('id',bill_id\)\.eq\('user_id',user\.id\)/);
  assert.match(source, /request\.headers\.get\('accept-language'\)/);
});
