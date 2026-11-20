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
