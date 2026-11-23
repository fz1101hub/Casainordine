// Molti dati di notte (scelta dell'utente, 23 novembre 2026): il lavoro giornaliero vero
// (lib/daily-jobs.mjs) con centinaia di persone e migliaia di bollette, contro il Supabase finto
// con una rete simulata. Su Vercel il lavoro ha 60 secondi; qui i tempi sono divisi per 10
// (Supabase 2 ms invece di ~20, una notifica push 12 ms invece di ~120, una chiamata a Resend
// 30 ms invece di ~300): il tempo misurato × 10 stima quello vero e deve restare sotto i 45 s.
// Controlla anche che ognuno riceva quello che deve, una volta sola, e che le chiamate a Resend
// restino poche (il limite di Resend è di pochi invii al secondo).
// Non serve l'app avviata (l'indirizzo, che la CI passa come alle altre prove, si ignora).
// Uso: node scripts/prove-notte.mjs [persone] [bollette]
import { createClient } from '@supabase/supabase-js';
import { startFakeSupabase } from '../tests/helpers/fake-supabase.mjs';
import { runDailyJobs, runDeferredPushes } from '../lib/daily-jobs.mjs';

const args = process.argv.slice(2).filter(a => !/^https?:/.test(a));
const PEOPLE = Number(args[0] || 400), BILLS = Number(args[1] || 4000), SCALE = 10;
const LIMIT_S = 45;
const failures = [];
const check = (ok, message) => { if (!ok) failures.push(message); console.log(`${ok ? 'ok ' : 'NO '} ${message}`); };
const sleep = ms => new Promise(done => setTimeout(done, ms));

process.env.RESEND_API_KEY = 're_prova'; process.env.RESEND_FROM = 'Casa in Ordine <casa@example.org>';
process.env.SUPABASE_SECRET_KEY = 'chiave-di-servizio-finta';
// Resend finto: registra le chiamate (singole e a blocchi) e quante erano insieme.
const resend = { calls: 0, emails: 0, inFlight: 0, maxInFlight: 0 };
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  if (!String(url).startsWith('https://api.resend.com/')) return realFetch(url, init);
  resend.calls++; resend.inFlight++; resend.maxInFlight = Math.max(resend.maxInFlight, resend.inFlight);
  const body = JSON.parse(init.body);
  const list = Array.isArray(body) ? body : [body];
  resend.emails += list.length;
  await sleep(30);
  resend.inFlight--;
  return Response.json(Array.isArray(body) ? { data: list.map((_, i) => ({ id: `e${resend.emails}-${i}` })) } : { id: `e${resend.emails}` });
};
const pushes = { sent: 0, inFlight: 0, maxInFlight: 0, pairs: new Map() };
const push = { configured: () => true, send: async (device, payload) => {
  pushes.inFlight++; pushes.maxInFlight = Math.max(pushes.maxInFlight, pushes.inFlight);
  await sleep(12);
  pushes.inFlight--; pushes.sent++;
  const key = `${device.user_id}|${payload.title}|${payload.body}`;
  pushes.pairs.set(key, (pushes.pairs.get(key) || 0) + 1);
} };

const fake = await startFakeSupabase({ latency: 2 });
const admin = createClient(fake.url, 'chiave-di-servizio-finta', { auth: { persistSession: false, autoRefreshToken: false } });
const id = (prefix, n) => `${prefix}${String(n).padStart(12, '0')}`;
const user = n => id('11111111-1111-4111-8111-', n), home = n => id('10000000-0000-4000-8000-', n);
const TODAY = '2026-12-01';
const day = offset => { const d = new Date(`${TODAY}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + offset); return d.toISOString().slice(0, 10); };
const LANGS = ['it', 'en', 'es', 'fr', 'de', 'pt'];
const HOMES = Math.floor(PEOPLE / 5);
fake.seed('profiles', Array.from({ length: PEOPLE }, (_, n) => ({ id: user(n), email: `persona${n}@example.org`, reminders_enabled: true, reminder_emails: n % 3 !== 0,
  summary_frequency: n % 4 === 0 ? 'daily' : 'off' })));
fake.seed('user_language_preferences', Array.from({ length: PEOPLE }, (_, n) => ({ user_id: user(n), language: LANGS[n % 6] })));
fake.seed('user_alert_preferences', Array.from({ length: PEOPLE }, (_, n) => ({ user_id: user(n), push_bills: true, push_digest: true, push_contracts: true,
  ...(n % 10 === 0 ? { quiet_from: '22:00:00', quiet_until: '08:30:00' } : {}) })));
fake.seed('push_subscriptions', Array.from({ length: PEOPLE }, (_, n) => ({ id: id('d', n), user_id: user(n), endpoint: `https://push.example/${n}`, p256dh: 'k', auth_secret: 'a' })));
fake.seed('homes', Array.from({ length: HOMES }, (_, h) => ({ id: home(h), name: `Casa ${h}`, owner_id: user(h * 5) })));
fake.seed('home_members', Array.from({ length: HOMES * 5 }, (_, n) => ({ home_id: home(Math.floor(n / 5)), user_id: user(n), role: n % 5 === 0 ? 'owner' : n % 5 < 3 ? 'editor' : 'viewer' })));
// Bollette su 90 giorni: metà delle case, metà personali.
fake.seed('bills', Array.from({ length: BILLS }, (_, n) => {
  const owner = n % PEOPLE, shared = n % 2 === 0;
  return { id: id('20000000-0000-4000-8000-', n), user_id: user(owner), home_id: shared ? home(Math.floor(owner / 5)) : null, title: `Bolletta ${n}`, supplier: 'Fornitore',
    category: 'Luce', amount: 20 + (n % 80), due_date: day(n % 90), paid_at: n % 7 === 0 ? '2026-11-20T10:00:00Z' : null };
}));
fake.seed('utilities', Array.from({ length: Math.floor(PEOPLE / 2) }, (_, n) => ({ id: id('30000000-0000-4000-8000-', n), user_id: user(n), home_id: null, category: 'Gas', supplier: 'Eni',
  estimated_amount: 40, frequency: 'monthly', billing_day: 1 + (n % 28), next_due_date: day(5 + (n % 40)), active: true })));
fake.seed('home_contracts', Array.from({ length: 200 }, (_, n) => ({ id: id('40000000-0000-4000-8000-', n), user_id: user(n), home_id: null, supplier: 'Assicurazione', service: 'Casa',
  renewal_on: day(n % 60 + 1), alert_days: 30 })));

const run = async (utc, label) => {
  fake.state.requests.length = 0;
  const started = Date.now();
  const result = await runDailyJobs(admin, { today: TODAY, now: new Date(`${TODAY}T${utc}:00Z`), appUrl: 'https://casa.example', push });
  const seconds = (Date.now() - started) / 1000;
  console.log(`   ${label}: ${seconds.toFixed(2)} s misurati (≈ ${(seconds * SCALE).toFixed(0)} s su Vercel), ${fake.state.requests.length} richieste a Supabase`);
  return { ...result, seconds, requests: fake.state.requests.length };
};
try {
  const inWindow = fake.rows('bills').filter(b => !b.paid_at && b.due_date >= TODAY && b.due_date <= day(3)).length;
  console.log(`   ${PEOPLE} persone, ${HOMES} case, ${BILLS} bollette (${inWindow} da ricordare oggi)`);
  const first = await run('07:07', 'primo giro');
  check(first.status === 200, `primo giro senza errori ${JSON.stringify(first.body.errors || []).slice(0, 300)}`);
  check(first.seconds * SCALE < LIMIT_S, `primo giro entro ${LIMIT_S} s su Vercel (≈ ${(first.seconds * SCALE).toFixed(0)} s)`);
  check(resend.calls <= Math.ceil(resend.emails / 100) + 2, `poche chiamate a Resend: ${resend.calls} per ${resend.emails} email`);
  check(first.body.emails_sent + first.body.summary_emails_sent === resend.emails && resend.emails > 0, `email registrate come inviate: ${first.body.emails_sent} promemoria e ${first.body.summary_emails_sent} riepiloghi`);
  check(pushes.maxInFlight > 1 && pushes.maxInFlight <= 20, `notifiche push in parallelo, al massimo 20 insieme (${pushes.maxInFlight})`);
  check(first.body.deferred_push > 0, `push di chi è nell'orario silenzioso rinviate (${first.body.deferred_push})`);
  const sentBefore = pushes.sent, emailsBefore = resend.emails;
  const second = await run('07:14', 'secondo giro');
  check(second.status === 200 && pushes.sent === sentBefore && resend.emails === emailsBefore, 'il secondo giro dello stesso giorno non rimanda niente');
  check(second.seconds * SCALE < LIMIT_S, `secondo giro entro ${LIMIT_S} s (≈ ${(second.seconds * SCALE).toFixed(0)} s)`);
  fake.state.requests.length = 0;
  const started = Date.now();
  const deferred = await runDeferredPushes(admin, { today: TODAY, now: new Date(`${TODAY}T08:37:00Z`), push });
  const deferredSeconds = (Date.now() - started) / 1000;
  check(deferred.status === 200 && deferred.body.deferred_push_sent > 0 && deferredSeconds * SCALE < LIMIT_S, `giro orario: ${deferred.body.deferred_push_sent} push rinviate in ≈ ${(deferredSeconds * SCALE).toFixed(0)} s`);
  check([...pushes.pairs.values()].every(n => n === 1), 'ogni notifica a ogni persona una volta sola');
} finally {
  globalThis.fetch = realFetch;
  await fake.close();
}
if (failures.length) { console.error(`\nLavoro notturno: ${failures.length} non superate.`); process.exit(1); }
console.log('\nLavoro notturno: tutte le prove superate.');
