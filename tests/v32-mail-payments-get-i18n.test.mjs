import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mailStartMessage } from '../lib/mail-api-i18n.mjs';

const locales = ['it','en','es','fr','de','pt'];
test('payment GET API errors are translated into six locales with Italian fallback', () => {
  for (const key of ['connectionsLogin','paymentsLoad','paymentsTrustedLoad']) {
    const values = locales.map(locale => mailStartMessage(key, locale));
    assert.equal(new Set(values).size, 6, key);
    assert.ok(values.every(value => typeof value === 'string' && value.length > 5), key);
    assert.equal(mailStartMessage(key, 'xx'), values[0]);
  }
});
test('payment GET localizes failures and preserves user-scoped queries', () => {
  const source = readFileSync(new URL('../app/api/mail/payments/route.js', import.meta.url), 'utf8');
  const get = source.split('export async function GET(request){')[1].split('export async function PATCH(request){')[0];
  for (const key of ['connectionsLogin','paymentsLoad','paymentsTrustedLoad']) {
    assert.ok(get.includes("message('" + key + "')"), key);
  }
  assert.match(get, /request\.headers\.get\('accept-language'\)/);
  assert.equal((get.match(/\.eq\('user_id',user\.id\)/g)||[]).length, 2);
  assert.equal((get.match(/\.limit\(100\)/g)||[]).length, 2);
});
