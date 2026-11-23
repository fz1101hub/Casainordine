// Email a blocchi (lib/reminder-email.mjs, sendEmailBatch): fino a 100 per chiamata a Resend,
// attesa e nuovo tentativo se Resend risponde 429, una per una se il blocco viene rifiutato.
import test from 'node:test';
import assert from 'node:assert/strict';
import { sendEmailBatch, sendReminderEmails } from '../lib/reminder-email.mjs';

const realFetch = globalThis.fetch;
const calls = [];
let reply = () => Response.json({ data: [] });
test.before(() => {
  Object.assign(process.env, { RESEND_API_KEY: 're_prova', RESEND_FROM: 'Casa in Ordine <casa@example.org>', SUPABASE_SECRET_KEY: 'chiave-di-servizio-finta' });
  globalThis.fetch = async (url, init) => { const call = { url: String(url), headers: init.headers, body: JSON.parse(init.body) }; calls.push(call); return reply(call, calls.length); };
});
test.after(() => { globalThis.fetch = realFetch; });
test.beforeEach(() => { calls.length = 0; });
const message = n => ({ to: `persona${n}@example.org`, subject: `Oggetto ${n}`, html: '<p>x</p>', text: 'x', headers: { 'List-Unsubscribe': '<https://casa.example/x>' } });
const noWait = { wait: async () => {} };

test('250 email: tre chiamate a /emails/batch (100, 100, 50), con mittente, testo e intestazioni', async () => {
  reply = call => Response.json({ data: call.body.map((_, i) => ({ id: `e${i}` })) });
  const results = await sendEmailBatch(Array.from({ length: 250 }, (_, n) => message(n)), noWait);
  assert.deepEqual(calls.map(c => [c.url, c.body.length]), [['https://api.resend.com/emails/batch', 100], ['https://api.resend.com/emails/batch', 100], ['https://api.resend.com/emails/batch', 50]]);
  assert.equal(results.length, 250);
  assert.ok(results.every(r => r.sent));
  const first = calls[0].body[0];
  assert.deepEqual([first.from, first.to, first.text, first.headers['List-Unsubscribe']], ['Casa in Ordine <casa@example.org>', 'persona0@example.org', 'x', '<https://casa.example/x>']);
  // Chiave per non mandare due volte lo stesso blocco: diversa per blocchi diversi, uguale se si ripete.
  assert.match(calls[0].headers['Idempotency-Key'], /^casa-[0-9a-f]{48}$/);
  assert.notEqual(calls[0].headers['Idempotency-Key'], calls[1].headers['Idempotency-Key']);
});

test('429: aspetta quanto chiede Resend e riprova con la stessa chiave', async () => {
  const waits = [];
  reply = (call, n) => (n === 1 ? new Response('{}', { status: 429, headers: { 'retry-after': '2' } }) : Response.json({ data: call.body.map(() => ({ id: 'e' })) }));
  const results = await sendEmailBatch([message(1), message(2)], { wait: async ms => waits.push(ms) });
  assert.deepEqual(waits, [2000]);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].headers['Idempotency-Key'], calls[1].headers['Idempotency-Key']);
  assert.ok(results.every(r => r.sent));
});

test('blocco rifiutato (un indirizzo non valido): si riprova una per una, le altre partono', async () => {
  reply = call => {
    if (call.url.endsWith('/batch')) return Response.json({ message: 'Invalid `to` field' }, { status: 422 });
    return call.body.to === 'non-valido' ? Response.json({ message: 'Invalid `to` field' }, { status: 422 }) : Response.json({ id: 'e' });
  };
  const results = await sendEmailBatch([message(1), { ...message(2), to: 'non-valido' }, message(3)], noWait);
  assert.deepEqual(calls.map(c => c.url.split('/').pop()), ['batch', 'emails', 'emails', 'emails']);
  assert.deepEqual(results.map(r => r.sent ? 'ok' : r.error), ['ok', 'Invalid `to` field', 'ok']);
});

test('promemoria a blocchi: un\'email che non si può preparare ha il suo errore e non ferma le altre', async () => {
  reply = call => Response.json({ data: call.body.map(() => ({ id: 'e' })) });
  const item = (title, due) => ({ address: 'a@example.org', bill: { title, due_date: due }, language: 'it', appUrl: 'https://casa.example', userId: '11111111-1111-4111-8111-111111111111' });
  const results = await sendReminderEmails([item('Luce', '2026-12-03'), item('Gas', 'non-una-data'), item('Acqua', '2026-12-04')]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].body.length, 2);
  assert.deepEqual(results.map(r => Boolean(r.sent)), [true, false, true]);
  assert.match(results[1].error, /date/i);
});

test('senza Resend configurato non parte niente', async () => {
  const saved = process.env.RESEND_API_KEY; delete process.env.RESEND_API_KEY;
  try {
    const results = await sendEmailBatch([message(1)], noWait);
    assert.deepEqual(results, [{ skipped: true }]);
    assert.equal(calls.length, 0);
  } finally { process.env.RESEND_API_KEY = saved; }
});
