// Smettere di ricevere le email (lib/email-unsubscribe.mjs, app/api/email/unsubscribe/route.js)
// con il client Supabase vero contro il Supabase finto.
import test from 'node:test';
import assert from 'node:assert/strict';
import { startFakeSupabase } from './helpers/fake-supabase.mjs';
import { unsubscribeUrl, unsubscribeToken, validUnsubscribe } from '../lib/email-unsubscribe.mjs';
import { reminderEmail, summaryEmail } from '../lib/reminder-email.mjs';

const ANNA = '11111111-1111-4111-8111-111111111111', LUCA = '22222222-2222-4222-8222-222222222222';
let fake, route;
const profile = id => fake.rows('profiles').find(p => p.id === id);

test.before(async () => {
  fake = await startFakeSupabase();
  Object.assign(process.env, { NEXT_PUBLIC_SUPABASE_URL: fake.url, SUPABASE_SECRET_KEY: 'chiave-di-servizio-finta' });
  fake.seed('profiles', [{ id: ANNA, email: 'anna@example.org', reminder_emails: true, summary_frequency: 'weekly' },
    { id: LUCA, email: 'luca@example.org', reminder_emails: true, summary_frequency: 'monthly' }]);
  route = await import('../app/api/email/unsubscribe/route.js');
});
test.after(() => fake?.close());
const req = (url, method = 'GET', body) => new Request(url, { method, body, headers: body ? { 'content-type': 'application/x-www-form-urlencoded' } : {} });

test('il codice vale solo per quella persona e quel tipo di email, e dipende dalla chiave del server', () => {
  const k = unsubscribeToken(ANNA, 'reminder');
  assert.equal(k.length, 32);
  assert.ok(validUnsubscribe({ u: ANNA, t: 'reminder', k }));
  assert.ok(validUnsubscribe({ u: ANNA.toUpperCase(), t: 'reminder', k }), 'maiuscole nell’identificativo');
  assert.ok(!validUnsubscribe({ u: LUCA, t: 'reminder', k }), 'un’altra persona');
  assert.ok(!validUnsubscribe({ u: ANNA, t: 'summary', k }), 'un altro tipo');
  assert.ok(!validUnsubscribe({ u: ANNA, t: 'reminder', k: k.slice(0, 31) + (k.at(-1) === 'a' ? 'b' : 'a') }), 'codice cambiato');
  assert.ok(!validUnsubscribe({ u: ANNA, t: 'altro', k }), 'tipo sconosciuto');
  assert.ok(!validUnsubscribe({ u: 'non-un-id', t: 'reminder', k }));
  assert.notEqual(unsubscribeToken(ANNA, 'reminder', 'altra-chiave'), k, 'un’altra chiave dà un altro codice');
});

test('aprire il collegamento non spegne niente: mostra solo la domanda, nella lingua dell’email, senza dati', async () => {
  const url = unsubscribeUrl('https://casa.example', ANNA, 'reminder', 'en');
  const res = await route.GET(req(url));
  const html = await res.text();
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.match(html, /<html lang="en">/);
  assert.match(html, /stop receiving bill reminder emails/);
  assert.match(html, /<form method="post" action="\/api\/email\/unsubscribe\?u=/);
  assert.doesNotMatch(html, /anna@example\.org/);
  assert.equal(profile(ANNA).reminder_emails, true);
  assert.ok(!fake.touched('profiles'), 'nessuna lettura né scrittura dei profili');
});

test('il pulsante spegne le email dei promemoria di quella persona, e solo quelle', async () => {
  const url = unsubscribeUrl('https://casa.example', ANNA, 'reminder', 'it');
  const res = await route.POST(req(url, 'POST', ''));
  assert.equal(res.status, 200);
  assert.match(await res.text(), /non riceverai più le email dei promemoria/);
  assert.equal(profile(ANNA).reminder_emails, false);
  assert.equal(profile(ANNA).summary_frequency, 'weekly', 'il riepilogo resta');
  assert.equal(profile(LUCA).reminder_emails, true, 'Luca non cambia');
});

test('«Annulla iscrizione» del programma di posta (un clic): spegne il riepilogo', async () => {
  const url = unsubscribeUrl('https://casa.example', LUCA, 'summary', 'de');
  const res = await route.POST(req(url, 'POST', 'List-Unsubscribe=One-Click'));
  assert.equal(res.status, 200);
  assert.equal(profile(LUCA).summary_frequency, 'off');
  assert.equal(profile(LUCA).reminder_emails, true);
});

test('collegamento cambiato o di un altro: 400, nessuna modifica', async () => {
  fake.state.requests.length = 0;
  const good = new URL(unsubscribeUrl('https://casa.example', LUCA, 'reminder', 'it'));
  const other = new URL(good); other.searchParams.set('u', ANNA);
  const kind = new URL(good); kind.searchParams.set('t', 'summary');
  for (const url of [other, kind, new URL('https://casa.example/api/email/unsubscribe')]) {
    for (const method of ['GET', 'POST']) {
      const res = await route[method](req(url.toString(), method, method === 'POST' ? '' : undefined));
      assert.equal(res.status, 400, `${method} ${url.search}`);
      assert.match(await res.text(), /non è valido/);
    }
  }
  assert.ok(!fake.touched('profiles'));
  assert.equal(profile(LUCA).reminder_emails, true);
});

test('la CI apre le email nel browser (scripts/prove-email.mjs)', async () => {
  const { readFileSync } = await import('node:fs');
  assert.match(readFileSync(new URL('../.github/workflows/tests.yml', import.meta.url), 'utf8'), /run: node scripts\/prove-email\.mjs/);
});

test('le email hanno testo, HTML con la lingua dichiarata e il piè per smettere di riceverle', () => {
  const reminder = reminderEmail({ language: 'fr', bill: { title: 'Gaz <b>&</b>', due_date: '2026-12-03' }, appUrl: 'https://casa.example', userId: ANNA });
  assert.match(reminder.html, /^<!doctype html><html lang="fr">/);
  assert.ok(reminder.html.includes('Gaz &lt;b&gt;&amp;&lt;/b&gt;') && !reminder.html.includes('<b>&</b>'));
  assert.ok(reminder.text.includes('Gaz <b>&</b>'), 'nel testo semplice il titolo resta com’è');
  assert.match(reminder.text, /Ne plus recevoir les rappels par e-mail: https:\/\/casa\.example\/api\/email\/unsubscribe\?/);
  assert.match(reminder.headers['List-Unsubscribe'], /^<https:\/\/casa\.example\/api\/email\/unsubscribe\?u=11111111-1111-4111-8111-111111111111&t=reminder&k=[\w-]{32}&l=fr>$/);
  const summary = summaryEmail({ language: 'pt', bills: [{ title: 'Água', supplier: 'EPAL', amount: 20, due_date: '2026-12-10' }], today: '2026-12-01', appUrl: 'https://casa.example', userId: LUCA });
  assert.match(summary.html, /<html lang="pt">/);
  assert.match(summary.text, /Água \(EPAL\)/);
  assert.match(summary.headers['List-Unsubscribe'], /t=summary/);
});
