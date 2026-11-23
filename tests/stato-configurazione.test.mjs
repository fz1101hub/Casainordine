// Stato della configurazione (scelta dell'utente, 23 novembre 2026): quali impostazioni del server
// ci sono, mai i valori.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { configStatus, CONFIG_ITEMS } from '../lib/config-status.mjs';
import { TRANSLATIONS } from '../lib/i18n.mjs';
import { startFakeSupabase } from './helpers/fake-supabase.mjs';

const FULL = {
  SUPABASE_SECRET_KEY: 'sb_secret_valore-segreto-1', APP_URL: 'https://casa.example',
  RESEND_API_KEY: 're_valore-segreto-2', RESEND_FROM: 'Casa <casa@example.org>',
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: 'BPubblica', VAPID_PRIVATE_KEY: 'valore-segreto-3', VAPID_SUBJECT: 'mailto:casa@example.org',
  MAIL_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString('base64'),
  GOOGLE_MAIL_CLIENT_ID: 'id-google', GOOGLE_MAIL_CLIENT_SECRET: 'valore-segreto-4',
  MICROSOFT_MAIL_CLIENT_ID: 'id-ms', MICROSOFT_MAIL_CLIENT_SECRET: 'valore-segreto-5',
  CRON_SECRET: 'valore-segreto-6-abbastanza-lungo',
};
const byKey = list => Object.fromEntries(list.map(i => [i.key, i]));

test('tutto presente: tutto pronto, e nessun valore nel risultato', () => {
  const status = configStatus(FULL);
  assert.deepEqual(status.map(i => i.state), CONFIG_ITEMS.map(() => 'ok'));
  const text = JSON.stringify(status);
  for (const [name, value] of Object.entries(FULL)) if (name !== 'APP_URL') assert.ok(!text.includes(value), `${name} non compare`);
});

test('mancanti, incompleti e da correggere, con i nomi delle variabili', () => {
  const empty = byKey(configStatus({}));
  assert.deepEqual([empty.database.state, empty.database.level, empty.database.missing], ['missing', 'required', ['SUPABASE_SECRET_KEY']]);
  assert.equal(empty.email.level, 'optional');
  const partial = byKey(configStatus({ ...FULL, RESEND_FROM: '  ', GOOGLE_MAIL_CLIENT_SECRET: '' }));
  assert.deepEqual([partial.email.state, partial.email.missing], ['partial', ['RESEND_FROM']]);
  assert.deepEqual([partial.gmail.state, partial.gmail.missing], ['partial', ['GOOGLE_MAIL_CLIENT_SECRET']]);
  const wrong = byKey(configStatus({ ...FULL, APP_URL: 'http://casa.example/app', VAPID_SUBJECT: 'casa@example.org', MAIL_TOKEN_ENCRYPTION_KEY: 'corta', CRON_SECRET: 'breve' }));
  assert.deepEqual(['appUrl', 'push', 'mailKey', 'cron'].map(k => wrong[k].state), ['invalid', 'invalid', 'invalid', 'invalid']);
  assert.deepEqual(wrong.push.missing, ['VAPID_SUBJECT'], 'si indica solo la variabile da correggere');
  assert.equal(byKey(configStatus({ ...FULL, APP_URL: 'http://localhost:3000' })).appUrl.state, 'ok', 'in locale http va bene');
});

let fake;
const saved = { ...process.env };
before(async () => {
  fake = await startFakeSupabase();
  Object.assign(process.env, FULL, { NEXT_PUBLIC_SUPABASE_URL: fake.url, NEXT_PUBLIC_SUPABASE_ANON_KEY: 'chiave-pubblica-finta' });
  fake.addUser('00000000-0000-4000-8000-00000000000a', 'anna@example.org');
});
after(async () => { await fake.close(); process.env = saved; });
const call = async token => {
  const { GET } = await import('../app/api/status/route.js');
  const res = await GET(new Request('https://casa.example/api/status', { headers: token ? { authorization: `Bearer ${token}` } : {} }));
  return { status: res.status, text: await res.text(), cache: res.headers.get('cache-control') };
};

test('API: solo con accesso, mai i valori, la chiave del database si prova davvero', async () => {
  assert.equal((await call()).status, 401);
  assert.equal((await call('token-falso')).status, 401);
  const ok = await call('token-00000000-0000-4000-8000-00000000000a');
  assert.equal(ok.status, 200);
  assert.match(ok.cache, /no-store/);
  const items = byKey(JSON.parse(ok.text).items);
  assert.equal(items.database.state, 'ok');
  for (const [name, value] of Object.entries(FULL)) if (name !== 'APP_URL') assert.ok(!ok.text.includes(value), `${name} non compare nella risposta`);
  assert.ok(fake.state.requests.some(r => r.path === '/rest/v1/profiles'), 'lettura di prova con la chiave del database');
  // Chiave di un altro progetto: Supabase la rifiuta.
  fake.state.rejectKeys.add(FULL.SUPABASE_SECRET_KEY);
  assert.equal(byKey(JSON.parse((await call('token-00000000-0000-4000-8000-00000000000a')).text).items).database.state, 'invalid');
  fake.state.rejectKeys.clear();
  // Senza chiave del database la pagina funziona comunque e dice che manca.
  delete process.env.SUPABASE_SECRET_KEY;
  const missing = await call('token-00000000-0000-4000-8000-00000000000a');
  assert.equal(missing.status, 200);
  assert.deepEqual(byKey(JSON.parse(missing.text).items).database, { key: 'database', level: 'required', state: 'missing', missing: ['SUPABASE_SECRET_KEY'] });
  process.env.SUPABASE_SECRET_KEY = FULL.SUPABASE_SECRET_KEY;
});

test('pannello: solo con accesso e fuori dalla demo, testi nelle 6 lingue', () => {
  const page = readFileSync(new URL('../app/page.jsx', import.meta.url), 'utf8');
  assert.match(page, /\{!demo&&user&&<ConfigStatus client=\{client\} onNotify=\{notify\}\/>\}/);
  const panel = readFileSync(new URL('../app/ConfigStatus.jsx', import.meta.url), 'utf8');
  assert.match(panel, /fetch\('\/api\/status', \{ headers: \{ Authorization: `Bearer/);
  assert.match(panel, /aria-live="polite"/);
  for (const [lang, d] of Object.entries(TRANSLATIONS)) {
    for (const { key } of CONFIG_ITEMS) { assert.ok(d['config.item.' + key], `config.item.${key} in ${lang}`); assert.ok(d['config.what.' + key], `config.what.${key} in ${lang}`); }
    for (const k of ['title', 'help', 'check', 'checking', 'failed', 'ready', 'notReady', 'add', 'fix', 'redeploy', 'state.ok', 'state.missing', 'state.partial', 'state.invalid', 'level.required', 'level.optional'])
      assert.ok(d['config.' + k], `config.${k} in ${lang}`);
    assert.ok(d['api.statusFailed'], lang);
  }
});
