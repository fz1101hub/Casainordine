import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mailStartMessage } from '../lib/mail-api-i18n.mjs';

const source = readFileSync(new URL('../app/api/mail/payments/route.js', import.meta.url), 'utf8');
const keys = ['connectionsLogin','paymentsInvalid','paymentsEvidenceRead','paymentsProcessed','paymentsDismiss','paymentsChooseBill','paymentsBillMissing','paymentsPermissionCheck','paymentsForbidden','paymentsAlreadyPaid','paymentsAmountMismatch','paymentsBillUpdate','paymentsBillUpdated','paymentsArchiveWarning','paymentsTrustWarning','paymentsId','paymentsRevoke'];

test('payment review messages are present and translated for all six languages', () => {
  for (const key of keys) {
    const values = ['it','en','es','fr','de','pt'].map(lang => mailStartMessage(key, lang));
    assert.equal(values.length, 6);
    for (const value of values) assert.ok(typeof value === 'string' && value.trim().length > 0);
    assert.equal(new Set(values).size, 6, key);
    assert.ok(source.includes(`message('${key}')`), key);
  }
});

test('payment review API respects preferred language and Italian fallback', () => {
  assert.equal(mailStartMessage('paymentsInvalid', 'fr-FR, en;q=0.8'), 'Requête non valide.');
  assert.equal(mailStartMessage('paymentsInvalid', 'xx-XX'), 'Richiesta non valida.');
});

test('payment review keeps user filters, permission checks and pending guards', () => {
  assert.match(source, /eq\('user_id',user\.id\)/);
  assert.match(source, /canEditBill\(admin,bill,user\.id\)/);
  assert.match(source, /eq\('status','pending'\)/);
  assert.match(source, /\.is\('paid_at',null\)/);
  assert.match(source, /export async function PATCH\(request\)/);
  assert.match(source, /export async function DELETE\(request\)/);
});
