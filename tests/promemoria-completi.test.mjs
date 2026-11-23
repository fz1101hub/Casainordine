// Promemoria dall'inizio alla fine (scelta dell'utente, 23 novembre 2026): il lavoro giornaliero
// vero (lib/daily-jobs.mjs) e il giro orario delle push rinviate, con il client Supabase vero
// contro il Supabase finto (tests/helpers/fake-supabase.mjs). Si cambiano solo il giorno, l'ora,
// l'invio delle push (registrato invece che mandato) e Resend (fetch registrata).
// Una casa con proprietaria (italiano, orario silenzioso 22:00–08:30), editor (inglese), lettrice
// (spagnolo, push delle bollette spente), lettrice senza dispositivi (francese), e una persona con
// una bolletta personale (tedesco, orario silenzioso 07:00–08:05).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { startFakeSupabase } from './helpers/fake-supabase.mjs';
import { runDailyJobs, runDeferredPushes } from '../lib/daily-jobs.mjs';
import { emailReminder, emailSummary } from '../lib/reminder-email.mjs';
import { billDuePushCopy, billSummaryPushCopy } from '../lib/notification-push-copy.mjs';
import { billReminderCopy } from '../lib/notification-copy.mjs';

const ANNA = '11111111-1111-4111-8111-111111111111', LUCA = '22222222-2222-4222-8222-222222222222';
const MARTA = '33333333-3333-4333-8333-333333333333', SARA = '44444444-4444-4444-8444-444444444444';
const PIERO = '55555555-5555-4555-8555-555555555555', HOME = '10000000-0000-4000-8000-0000000000ee';
const B1 = '20000000-0000-4000-8000-0000000000e1', B2 = '20000000-0000-4000-8000-0000000000e2';
const B3 = '20000000-0000-4000-8000-0000000000e3', B4 = '20000000-0000-4000-8000-0000000000e4';
const TITLE = 'Luce <b>casa</b> & gas';
const allPush = { push_bills: true, push_digest: true, push_contracts: true, push_maintenance: true, push_monitor: true, push_automations: true };

let fake, admin;
const pushes = [], emails = [];
const realFetch = globalThis.fetch;
const push = { configured: () => true, send: async (device, payload) => {
  if (device.endpoint.includes('vecchio')) throw Object.assign(new Error('Gone'), { statusCode: 410 });
  pushes.push({ user: device.user_id, endpoint: device.endpoint, payload });
} };
const email = { configured: () => true, reminder: emailReminder, summary: emailSummary };
const day = (today, utc) => ({ today, now: new Date(`${today}T${utc}:00Z`), appUrl: 'https://casa.example', push, email });
const sentTo = user => pushes.filter(p => p.user === user);

test.before(async () => {
  process.env.RESEND_API_KEY = 're_prova'; process.env.RESEND_FROM = 'Casa in Ordine <casa@example.org>';
  // La chiave di servizio firma i collegamenti per smettere di ricevere le email (lib/email-unsubscribe.mjs).
  process.env.SUPABASE_SECRET_KEY = 'chiave-di-servizio-finta';
  // Solo Resend è finto: le altre richieste (Supabase) vanno al server finto.
  globalThis.fetch = async (url, init) => {
    if (String(url).startsWith('https://api.resend.com/')) { emails.push(JSON.parse(init.body)); return Response.json({ id: `email-${emails.length}` }); }
    return realFetch(url, init);
  };
  fake = await startFakeSupabase();
  process.env.NEXT_PUBLIC_SUPABASE_URL = fake.url;
  admin = createClient(fake.url, 'chiave-di-servizio-finta', { auth: { persistSession: false, autoRefreshToken: false } });
  const profile = (id, email, extra = {}) => ({ id, email, reminders_enabled: true, reminder_emails: true, summary_frequency: 'off', ...extra });
  fake.seed('profiles', [profile(ANNA, 'anna@example.org', { summary_frequency: 'daily' }), profile(LUCA, 'luca@example.org', { reminder_emails: false }),
    profile(MARTA, 'marta@example.org'), profile(SARA, 'sara@example.org'), profile(PIERO, 'piero@example.org')]);
  fake.seed('user_language_preferences', [{ user_id: ANNA, language: 'it' }, { user_id: LUCA, language: 'en' }, { user_id: MARTA, language: 'es' },
    { user_id: SARA, language: 'fr' }, { user_id: PIERO, language: 'de' }]);
  fake.seed('user_alert_preferences', [{ user_id: ANNA, ...allPush, quiet_from: '22:00:00', quiet_until: '08:30:00' }, { user_id: LUCA, ...allPush },
    { user_id: MARTA, ...allPush, push_bills: false }, { user_id: SARA, ...allPush, quiet_from: '22:00:00', quiet_until: '08:30:00' },
    { user_id: PIERO, ...allPush, quiet_from: '07:00:00', quiet_until: '08:05:00' }]);
  fake.seed('push_subscriptions', [{ id: 'd-anna', user_id: ANNA, endpoint: 'https://push.example/anna', p256dh: 'k', auth_secret: 'a' },
    { id: 'd-anna-old', user_id: ANNA, endpoint: 'https://push.example/anna-vecchio', p256dh: 'k', auth_secret: 'a' },
    { id: 'd-luca', user_id: LUCA, endpoint: 'https://push.example/luca', p256dh: 'k', auth_secret: 'a' },
    { id: 'd-marta', user_id: MARTA, endpoint: 'https://push.example/marta', p256dh: 'k', auth_secret: 'a' },
    { id: 'd-piero', user_id: PIERO, endpoint: 'https://push.example/piero', p256dh: 'k', auth_secret: 'a' }]);
  fake.seed('homes', [{ id: HOME, name: 'Casa al mare', owner_id: ANNA }]);
  fake.seed('home_members', [{ home_id: HOME, user_id: ANNA, role: 'owner' }, { home_id: HOME, user_id: LUCA, role: 'editor' },
    { home_id: HOME, user_id: MARTA, role: 'viewer' }, { home_id: HOME, user_id: SARA, role: 'viewer' }]);
  const bill = (id, extra) => ({ id, user_id: ANNA, home_id: HOME, supplier: 'Enel', category: 'Luce', amount: 61.5, paid_at: null, ...extra });
  fake.seed('bills', [bill(B1, { title: TITLE, due_date: '2026-12-03' }), bill(B2, { title: 'Già pagata', due_date: '2026-12-03', paid_at: '2026-11-30T10:00:00Z' }),
    bill(B3, { title: 'Acqua', due_date: '2026-12-11' }), bill(B4, { user_id: PIERO, home_id: null, title: 'Telefono di Piero', supplier: 'Tim', due_date: '2026-12-02' })]);
  fake.seed('utilities', [{ id: 'u-gas', user_id: ANNA, home_id: null, category: 'Gas', supplier: 'Eni', estimated_amount: 40, frequency: 'monthly', billing_day: 20, next_due_date: '2026-12-20', active: true }]);
  // Inviti: uno usato, uno scaduto, uno aperto. Il lavoro giornaliero tiene solo quello aperto.
  fake.seed('home_invites', [{ id: 'inv-usato', home_id: HOME, email: 'luca@example.org', claimed_at: '2026-11-02T10:00:00Z', expires_at: '2026-11-09T10:00:00Z' },
    { id: 'inv-scaduto', home_id: HOME, email: 'mai@example.org', claimed_at: null, expires_at: '2026-11-30T10:00:00Z' },
    { id: 'inv-aperto', home_id: HOME, email: 'nuova@example.org', claimed_at: null, expires_at: '2026-12-05T10:00:00Z' }]);
  fake.seed('home_contracts', [{ id: 'c-casa', user_id: ANNA, home_id: null, supplier: 'Assicurazione Casa', service: 'Polizza', renewal_on: '2026-12-31', alert_days: 30 }]);
});
test.after(async () => { globalThis.fetch = realFetch; await fake?.close(); });

test('08:00 — promemoria, email e riepilogo; la push di chi è nell’orario silenzioso si rinvia', async () => {
  const { status, body } = await runDailyJobs(admin, day('2026-12-01', '07:00'));
  assert.equal(status, 200, JSON.stringify(body.errors));
  // Utenza mensile: una bolletta stimata entro 45 giorni, e la prossima data spostata avanti.
  const estimated = fake.rows('bills').filter(b => b.utility_id === 'u-gas');
  assert.deepEqual(estimated.map(b => [b.due_date, b.is_estimate, b.amount]), [['2026-12-20', true, 40]]);
  assert.equal(fake.rows('utilities')[0].next_due_date, '2027-01-20');
  // Nell'app: un promemoria per chi ha inserito ciascuna bolletta in scadenza (non quella pagata né quella lontana).
  assert.deepEqual(fake.rows('reminders').map(r => [r.bill_id, r.user_id]).sort(), [[B1, ANNA], [B4, PIERO]].sort());
  // Push: Luca subito, in inglese; Marta no (push delle bollette spente); Sara no (nessun dispositivo).
  assert.deepEqual(pushes.map(p => p.user), [LUCA]);
  assert.deepEqual(pushes[0].payload, billDuePushCopy({ language: 'en', name: TITLE, days: 2 }));
  // Anna e Piero sono nell'orario silenzioso: le loro push aspettano (bolletta, riepilogo, avviso del contratto).
  assert.deepEqual(fake.rows('push_deferred').map(r => [r.user_id, r.dedupe_key, r.kind]).sort(), [
    [ANNA, `bill:${B1}:2026-12-01`, 'bill'], [ANNA, 'alert:contract:c-casa:2026-12-01', 'contract'], [ANNA, 'summary:2026-12-01', 'digest'], [PIERO, `bill:${B4}:2026-12-01`, 'bill'],
  ].sort());
  assert.deepEqual(fake.rows('push_deferred').find(r => r.user_id === PIERO).payload, billDuePushCopy({ language: 'de', name: 'Telefono di Piero', days: 1 }));
  assert.equal(body.deferred_push, 4);
  // Email: proprietaria ed editor che le vogliono (Luca le ha spente, le lettrici non le ricevono), più Piero.
  const reminderMails = emails.filter(e => !e.html.includes('<ul'));
  assert.deepEqual(reminderMails.map(e => e.to).sort(), ['anna@example.org', 'piero@example.org']);
  const toAnna = reminderMails.find(e => e.to === 'anna@example.org'), toPiero = reminderMails.find(e => e.to === 'piero@example.org');
  assert.equal(toAnna.subject, `Casa in Ordine · ${billReminderCopy({ language: 'it', name: TITLE, dueDate: '2026-12-03' }).subject}`);
  assert.equal(toPiero.subject, `Casa in Ordine · ${billReminderCopy({ language: 'de', name: 'Telefono di Piero', dueDate: '2026-12-02' }).subject}`);
  assert.ok(!toAnna.html.includes('<b>casa</b>') && toAnna.html.includes('&lt;b&gt;casa&lt;/b&gt; &amp; gas'), 'il titolo è testo, non HTML');
  assert.match(toAnna.html, /href="https:\/\/casa\.example"/);
  assert.match(toAnna.html, /^<!doctype html><html lang="it">/);
  // Versione solo testo con gli stessi contenuti (il titolo resta com'è), e piè con la disiscrizione.
  assert.ok(toAnna.text.includes(TITLE) && toAnna.text.includes('https://casa.example'));
  assert.match(toPiero.text, /Erinnerungen per E-Mail/);
  // Intestazioni per «Annulla iscrizione» con un clic (RFC 8058): collegamento firmato, per Anna e per i promemoria.
  const stop = new URL(toAnna.headers['List-Unsubscribe'].slice(1, -1));
  assert.equal(toAnna.headers['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click');
  assert.deepEqual([stop.origin + stop.pathname, stop.searchParams.get('u'), stop.searchParams.get('t'), stop.searchParams.get('l')], ['https://casa.example/api/email/unsubscribe', ANNA, 'reminder', 'it']);
  assert.ok(toAnna.html.includes(stop.toString().replace(/&/g, '&amp;')) && toAnna.text.includes(stop.toString()), 'lo stesso collegamento in fondo all\'email');
  // Riepilogo giornaliero di Anna: bollette aperte fino a fine mese, anche quella stimata appena creata.
  const summary = emails.find(e => e.html.includes('<ul'));
  assert.equal(summary.to, 'anna@example.org');
  assert.equal((summary.html.match(/<li\b/g) || []).length, 3);
  assert.equal(fake.rows('bill_summaries').length, 1);
  // Pulizia: restano solo gli inviti ancora aperti.
  assert.deepEqual(fake.rows('home_invites').map(i => i.id), ['inv-aperto']);
});

test('08:07 — il secondo giro non rimanda niente; Piero, fuori dall’orario silenzioso, riceve la sua push', async () => {
  const before = emails.length;
  const { status, body } = await runDailyJobs(admin, day('2026-12-01', '07:07'));
  assert.equal(status, 200, JSON.stringify(body.errors));
  assert.equal(emails.length, before, 'nessuna email in più');
  assert.deepEqual(pushes.map(p => p.user), [LUCA, PIERO]);
  assert.deepEqual(sentTo(PIERO)[0].payload, billDuePushCopy({ language: 'de', name: 'Telefono di Piero', days: 1 }));
  // La sua voce rinviata è tolta: il giro orario non la manderà una seconda volta.
  assert.deepEqual(fake.rows('push_deferred').map(r => r.user_id), [ANNA, ANNA, ANNA]);
  assert.equal(fake.rows('reminders').length, 2);
});

test('09:37 — il giro orario manda ad Anna le tre push rinviate, una volta sola', async () => {
  const { status, body } = await runDeferredPushes(admin, { today: '2026-12-01', now: new Date('2026-12-01T08:37:00Z'), push });
  assert.equal(status, 200, JSON.stringify(body.errors));
  const toAnna = sentTo(ANNA);
  assert.equal(toAnna.length, 3);
  assert.ok(toAnna.every(p => p.endpoint === 'https://push.example/anna'));
  assert.deepEqual(toAnna.map(p => p.payload).find(p => p.title === billDuePushCopy({ language: 'it', name: TITLE, days: 2 }).title), billDuePushCopy({ language: 'it', name: TITLE, days: 2 }));
  assert.ok(toAnna.some(p => JSON.stringify(p.payload) === JSON.stringify(billSummaryPushCopy({ language: 'it', count: 3, total: 61.5 + 61.5 + 40 }))), 'riepilogo in italiano');
  assert.ok(toAnna.some(p => p.payload.title === 'Contratto: Assicurazione Casa'), 'avviso del contratto');
  // Il dispositivo non più valido (410) è tolto; le voci rinviate sono finite; i registri dicono «consegnata».
  assert.deepEqual(fake.rows('push_subscriptions').filter(d => d.user_id === ANNA).map(d => d.id), ['d-anna']);
  assert.deepEqual(fake.rows('push_deferred'), []);
  assert.ok(fake.rows('push_delivery_log').find(r => r.bill_id === B1 && r.user_id === ANNA && r.reminder_date === '2026-12-01').sent_at);
  assert.ok(fake.rows('bill_summaries')[0].push_sent_at);
  // Un altro giro non manda niente.
  await runDeferredPushes(admin, { today: '2026-12-01', now: new Date('2026-12-01T09:37:00Z'), push });
  assert.equal(sentTo(ANNA).length, 3);
});

test('il giorno dopo — niente doppioni; un riepilogo nuovo; le voci vecchie scadono, quelle spente si tolgono', async () => {
  const pushesBefore = pushes.length, emailsBefore = emails.length;
  const { status, body } = await runDailyJobs(admin, day('2026-12-02', '07:07'));
  assert.equal(status, 200, JSON.stringify(body.errors));
  // Le bollette già ricordate non si ricordano più (una volta per bolletta), anche se ancora in finestra.
  assert.equal(pushes.length, pushesBefore);
  assert.equal(emails.filter(e => !e.html.includes('<ul')).length, 2);
  assert.equal(emails.length, emailsBefore + 1, 'solo il riepilogo giornaliero di Anna');
  assert.deepEqual(fake.rows('push_deferred').map(r => r.dedupe_key), ['summary:2026-12-02']);
  // Anna spegne le push dei riepiloghi prima della fine dell'orario silenzioso: la voce si toglie senza invio.
  Object.assign(fake.rows('user_alert_preferences').find(p => p.user_id === ANNA), { push_digest: false });
  // Una voce di ieri rimasta in attesa (per esempio con l'app senza chiave): scade, senza invio.
  fake.seed('push_deferred', [{ user_id: PIERO, dedupe_key: `bill:${B4}:2026-12-01`, kind: 'bill', payload: { title: 'vecchia' }, created_on: '2026-12-01' }]);
  const run = await runDeferredPushes(admin, { today: '2026-12-02', now: new Date('2026-12-02T08:37:00Z'), push });
  assert.equal(run.body.deferred_expired, 1);
  assert.equal(pushes.length, pushesBefore);
  assert.deepEqual(fake.rows('push_deferred'), []);
});

test('Anna smette di ricevere il riepilogo dal collegamento dell\'email: il giorno dopo non arriva più', async () => {
  const summaryMail = emails.filter(e => e.html.includes('<ul')).at(-1);
  const stop = summaryMail.headers['List-Unsubscribe'].slice(1, -1);
  assert.match(stop, /t=summary/);
  const { POST } = await import('../app/api/email/unsubscribe/route.js');
  // Come Gmail: POST al collegamento con «List-Unsubscribe=One-Click».
  const res = await POST(new Request(stop, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'List-Unsubscribe=One-Click' }));
  assert.equal(res.status, 200);
  assert.equal(fake.rows('profiles').find(p => p.id === ANNA).summary_frequency, 'off');
  const before = emails.length;
  const { status } = await runDailyJobs(admin, day('2026-12-03', '07:07'));
  assert.equal(status, 200);
  assert.equal(emails.length, before, 'nessun riepilogo');
  assert.deepEqual(fake.rows('push_deferred'), []);
});

test('ogni persona ha ricevuto ogni notifica una volta sola, e nessuna a chi non doveva', () => {
  const seen = pushes.map(p => `${p.user}:${p.payload.title}:${p.payload.body}`);
  assert.equal(new Set(seen).size, seen.length);
  assert.deepEqual(sentTo(MARTA), []);
  assert.deepEqual(sentTo(SARA), []);
  assert.equal(sentTo(LUCA).length, 1);
  assert.equal(sentTo(PIERO).length, 1);
});
