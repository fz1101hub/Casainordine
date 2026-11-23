// Prove di sicurezza delle API del server (scelta dell'utente, 23 novembre 2026).
// Le route di app/api usano la chiave di servizio, che salta le regole del database: ognuna deve
// controllare da sé chi chiama e su che cosa. Qui girano le route vere, con il client Supabase
// vero, contro un Supabase finto (tests/helpers/fake-supabase.mjs): si controlla la risposta e
// che cosa cambia nei dati.
import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { startFakeSupabase } from './helpers/fake-supabase.mjs';
import { hashToken } from '../lib/server.mjs';

const A = '00000000-0000-4000-8000-00000000000a', B = '00000000-0000-4000-8000-00000000000b', V = '00000000-0000-4000-8000-00000000000f';
const HOME = '10000000-0000-4000-8000-000000000001';
let fake, tokenA, tokenB, tokenV;
const routes = {};
const load = async path => (routes[path] ||= await import(`../app/api/${path}/route.js`));
const call = async (path, method, { token, body, headers = {}, params, query = '' } = {}) => {
  const route = await load(path);
  const request = new Request(`https://casa.example/api/${path}${query}`, {
    method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...headers },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
  const response = await route[method](request, params ? { params: Promise.resolve(params) } : undefined);
  const text = await response.text();
  let json = null; try { json = JSON.parse(text); } catch {}
  return { status: response.status, json, text, headers: response.headers };
};
const restCalls = () => fake.state.requests.filter(r => r.path.startsWith('/rest/v1/') || r.path.startsWith('/storage/'));

before(async () => {
  fake = await startFakeSupabase();
  Object.assign(process.env, {
    NEXT_PUBLIC_SUPABASE_URL: fake.url, NEXT_PUBLIC_SUPABASE_ANON_KEY: 'chiave-pubblica-finta', SUPABASE_SECRET_KEY: 'chiave-di-servizio-finta',
    CRON_SECRET: 'segreto-del-cron-abbastanza-lungo', MAIL_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
    APP_URL: 'https://casa.example', GOOGLE_MAIL_CLIENT_ID: 'id', GOOGLE_MAIL_CLIENT_SECRET: 'segreto',
  });
  tokenA = fake.addUser(A, 'anna@example.org');
  tokenB = fake.addUser(B, 'bruno@example.org');
  tokenV = fake.addUser(V, 'vera@example.org');
});
after(() => fake.close());
beforeEach(() => { fake.state.requests.length = 0; });

// Tutte le route per utenti con accesso: senza accesso, o con un accesso falso, niente dati.
const USER_ROUTES = [
  ['account/delete', 'POST'], ['calendar/feed', 'GET'], ['calendar/feed', 'POST'], ['calendar/feed', 'DELETE'],
  ['integration-key', 'GET'], ['integration-key', 'POST'], ['integration-key', 'DELETE'],
  ['push/subscribe', 'GET'], ['push/subscribe', 'POST'], ['push/subscribe', 'DELETE'],
  ['mail/start', 'POST'], ['mail/connections', 'GET'], ['mail/connections', 'POST'], ['mail/connections', 'DELETE'],
  ['mail/senders', 'GET'], ['mail/senders', 'DELETE'], ['mail/sync', 'POST'],
  ['mail/documents', 'GET'], ['mail/documents', 'PATCH'], ['mail/payments', 'GET'], ['mail/payments', 'PATCH'], ['mail/payments', 'DELETE'],
];

test('senza accesso o con un accesso falso: 401 e nessuna lettura dei dati', async () => {
  for (const [path, method] of USER_ROUTES) {
    for (const token of [undefined, 'token-falso']) {
      fake.state.requests.length = 0;
      const body = ['GET'].includes(method) ? undefined : { id: '20000000-0000-4000-8000-000000000001', confirm_email: 'anna@example.org' };
      const res = await call(path, method, { token, body });
      assert.equal(res.status, 401, `${method} ${path} (${token || 'senza token'})`);
      assert.deepEqual(restCalls(), [], `${method} ${path}: nessuna lettura senza accesso`);
    }
  }
});

test('lavori programmati: solo con il segreto del cron o la chiave di Supabase Cron', async () => {
  fake.state.rpc.v35_cron_token_valid = ({ token }) => token === 'a'.repeat(64);
  for (const path of ['cron', 'mail/cron']) {
    for (const headers of [{}, { authorization: 'Bearer sbagliato' }, { authorization: 'Bearer segreto-del-cron-abbastanza-lung' }, { 'x-casa-cron-token': 'corto' }, { 'x-casa-cron-token': 'b'.repeat(64) }]) {
      fake.state.requests.length = 0;
      const res = await call(path, 'GET', { headers });
      assert.equal(res.status, 401, `${path} con ${JSON.stringify(headers)}`);
      // Solo la verifica della chiave di Supabase Cron, e solo se ha il formato giusto.
      assert.deepEqual(restCalls().filter(r => r.path !== '/rest/v1/rpc/v35_cron_token_valid'), [], `${path}: nessuna lettura prima dell'autorizzazione`);
      if (!/^[0-9a-f]{64}$/.test(headers['x-casa-cron-token'] || '')) assert.deepEqual(restCalls(), [], `${path}: chiave malformata, nessuna verifica`);
    }
  }
  const viaSupabase = await call('mail/cron', 'GET', { headers: { 'x-casa-cron-token': 'a'.repeat(64) } });
  assert.equal(viaSupabase.status, 200);
  const viaVercel = await call('mail/cron', 'GET', { headers: { authorization: 'Bearer segreto-del-cron-abbastanza-lungo' } });
  assert.equal(viaVercel.status, 200);
});

test('calendario per link: formato, link sconosciuto, solo le bollette di chi l\'ha creato', async () => {
  const token = 'x'.repeat(43);
  fake.seed('calendar_feeds', [{ user_id: A, token_hash: hashToken(token) }]);
  fake.seed('home_members', [{ home_id: HOME, user_id: A, role: 'viewer' }]);
  fake.seed('bills', [
    { id: 'b-a', user_id: A, home_id: null, title: 'Luce di Anna', supplier: 'Enel', amount: 50, due_date: '2026-12-10', paid_at: null },
    { id: 'b-casa', user_id: B, home_id: HOME, title: 'Gas della casa', supplier: 'Eni', amount: 70, due_date: '2026-12-12', paid_at: null },
    { id: 'b-b', user_id: B, home_id: null, title: 'Telefono di Bruno', supplier: 'Tim', amount: 20, due_date: '2026-12-11', paid_at: null },
  ]);
  for (const bad of ['corto', 'x'.repeat(42) + '!', '../../etc']) {
    fake.state.requests.length = 0;
    assert.equal((await call('calendar/[token]', 'GET', { params: { token: bad } })).status, 404);
    assert.deepEqual(restCalls(), []);
  }
  assert.equal((await call('calendar/[token]', 'GET', { params: { token: 'y'.repeat(43) } })).status, 404);
  const res = await call('calendar/[token]', 'GET', { params: { token } });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('cache-control'), /no-store/);
  assert.match(res.text, /Luce di Anna/);
  assert.match(res.text, /Gas della casa/, 'la casa di cui è membro');
  assert.doesNotMatch(res.text, /Telefono di Bruno/, 'mai le bollette personali di altri');
});

test('istruzioni della vacanza per link: formato, scaduto, revocato, solo il testo', async () => {
  const ok = 'a'.repeat(64), old = 'b'.repeat(64), revoked = 'c'.repeat(64);
  fake.seed('home_vacation_shares', [
    { token_hash: hashToken(ok), shared_text: 'Annaffiare le piante', expires_at: '2099-01-01T00:00:00Z', revoked_at: null, plan_id: 'piano-segreto', created_by: A },
    { token_hash: hashToken(old), shared_text: 'Vecchio', expires_at: '2020-01-01T00:00:00Z', revoked_at: null },
    { token_hash: hashToken(revoked), shared_text: 'Revocato', expires_at: '2099-01-01T00:00:00Z', revoked_at: '2026-01-01T00:00:00Z' },
  ]);
  fake.state.requests.length = 0;
  assert.equal((await call('vacation/share/[token]', 'GET', { params: { token: 'ABC' } })).status, 404);
  assert.deepEqual(restCalls(), []);
  assert.equal((await call('vacation/share/[token]', 'GET', { params: { token: old } })).status, 404);
  assert.equal((await call('vacation/share/[token]', 'GET', { params: { token: revoked } })).status, 404);
  const res = await call('vacation/share/[token]', 'GET', { params: { token: ok } });
  assert.equal(res.status, 200);
  assert.deepEqual(Object.keys(res.json).sort(), ['expires_at', 'instructions'], 'niente altro della casa');
});

test('bollette da automazione: chiave valida, campi controllati, nessun doppione che azzeri un pagamento', async () => {
  const key = 'cio_' + 'k'.repeat(43);
  fake.seed('integration_keys', [{ user_id: A, token_hash: hashToken(key) }]);
  fake.state.requests.length = 0;
  assert.equal((await call('ingest', 'POST', { token: 'cio_corta', body: {} })).status, 401);
  assert.deepEqual(restCalls(), [], 'chiave malformata: nessuna lettura');
  assert.equal((await call('ingest', 'POST', { token: 'cio_' + 'z'.repeat(43), body: {} })).status, 401);
  assert.equal((await call('ingest', 'POST', { token: key, body: 'x'.repeat(15001) })).status, 413);
  assert.equal((await call('ingest', 'POST', { token: key, body: '{rotto' })).status, 400);
  assert.equal((await call('ingest', 'POST', { token: key, body: { title: 'Luce', amount: 'tanti', due_date: '2026-12-01', external_id: 'e1' } })).status, 400);
  const ok = await call('ingest', 'POST', { token: key, body: { title: 'Luce', supplier: 'Enel', amount: '49,90', due_date: '2026-12-01', external_id: 'e1', paid: true, user_id: B, home_id: HOME } });
  assert.equal(ok.status, 200);
  const bill = fake.rows('bills').find(b => b.external_id === 'e1');
  assert.equal(bill.user_id, A, 'sempre di chi possiede la chiave, mai di chi è scritto nel corpo');
  assert.equal(bill.home_id, undefined, 'nello spazio personale');
  assert.equal(bill.source, 'webhook');
});

test('chiavi, calendario e notifiche: ognuno tocca solo le proprie', async () => {
  fake.seed('integration_keys', [{ user_id: B, token_hash: 'di-bruno' }]);
  fake.seed('calendar_feeds', [{ user_id: B, token_hash: 'calendario-di-bruno' }]);
  assert.equal((await call('integration-key', 'DELETE', { token: tokenA })).status, 200);
  assert.equal((await call('calendar/feed', 'DELETE', { token: tokenA })).status, 200);
  assert.ok(fake.rows('integration_keys').some(k => k.user_id === B), 'la chiave di Bruno resta');
  assert.ok(fake.rows('calendar_feeds').some(k => k.user_id === B), 'il calendario di Bruno resta');
  const created = await call('integration-key', 'POST', { token: tokenA });
  assert.match(created.json.token, /^cio_/);
  assert.equal(fake.rows('integration_keys').find(k => k.user_id === A).token_hash, hashToken(created.json.token), 'si salva solo l\'impronta');
});

test('notifiche push: solo i servizi push veri (niente richieste del server verso indirizzi scelti da chi chiama)', async () => {
  const keys = { p256dh: 'p'.repeat(87), auth: 'a'.repeat(22) };
  for (const endpoint of ['http://fcm.googleapis.com/fcm/send/x', 'https://169.254.169.254/latest/meta-data', 'https://evil.example/push', 'https://fcm.googleapis.com:8443/x',
    'https://user:pw@fcm.googleapis.com/x', 'https://fcm.googleapis.com.evil.example/x', 'https://localhost/x'])
    assert.equal((await call('push/subscribe', 'POST', { token: tokenA, body: { endpoint, keys } })).status, 400, endpoint);
  const bruno = 'https://fcm.googleapis.com/fcm/send/dispositivo-di-bruno';
  fake.seed('push_subscriptions', [{ id: 'p-b', user_id: B, endpoint: bruno, p256dh: keys.p256dh, auth_secret: keys.auth }]);
  assert.equal((await call('push/subscribe', 'POST', { token: tokenA, body: { endpoint: bruno, keys } })).status, 409);
  assert.equal(fake.rows('push_subscriptions').find(s => s.endpoint === bruno).user_id, B, 'il dispositivo resta di Bruno');
  assert.equal((await call('push/subscribe', 'DELETE', { token: tokenA, body: { endpoint: bruno } })).status, 200);
  assert.ok(fake.rows('push_subscriptions').some(s => s.endpoint === bruno), 'Anna non toglie il dispositivo di Bruno');
  assert.equal((await call('push/subscribe', 'POST', { token: tokenA, body: { endpoint: 'https://web.push.apple.com/QAbc', keys } })).status, 200);
});

test('notifiche push: al massimo 10 dispositivi per persona', async () => {
  const keys = { p256dh: 'q'.repeat(87), auth: 'b'.repeat(22) };
  fake.seed('push_subscriptions', Array.from({ length: 10 }, (_, i) => ({ id: `pv-${i}`, user_id: V, endpoint: `https://fcm.googleapis.com/fcm/send/v-${i}`, p256dh: keys.p256dh, auth_secret: keys.auth })));
  const res = await call('push/subscribe', 'POST', { token: tokenV, body: { endpoint: 'https://fcm.googleapis.com/fcm/send/v-11', keys } });
  assert.equal(res.status, 429);
  assert.equal(res.json.error, 'pushLimit');
  assert.equal(fake.rows('push_subscriptions').filter(s => s.user_id === V).length, 10);
  // Lo stesso dispositivo già registrato si aggiorna anche al limite.
  assert.equal((await call('push/subscribe', 'POST', { token: tokenV, body: { endpoint: 'https://fcm.googleapis.com/fcm/send/v-3', keys } })).status, 200);
});

test('caselle email: solo le proprie, fornitori in elenco chiuso, limiti di tentativi e di caselle', async () => {
  const conn = '30000000-0000-4000-8000-00000000000b';
  fake.seed('mail_connections', [{ id: conn, user_id: B, provider: 'gmail', email_address: 'bruno@gmail.com', status: 'active', refresh_token_enc: 'x' }]);
  fake.seed('mail_bill_senders', [{ id: '31000000-0000-4000-8000-00000000000b', user_id: B, sender_email: 'bollette@enel.it' }]);
  assert.equal((await call('mail/connections', 'DELETE', { token: tokenA, body: { id: conn } })).status, 404);
  assert.equal((await call('mail/sync', 'POST', { token: tokenA, body: { id: conn } })).status, 404);
  assert.equal((await call('mail/senders', 'DELETE', { token: tokenA, body: { id: '31000000-0000-4000-8000-00000000000b' } })).status, 200);
  assert.ok(fake.rows('mail_connections').some(c => c.id === conn), 'la casella di Bruno resta');
  assert.ok(fake.rows('mail_bill_senders').some(s => s.user_id === B), 'i mittenti di Bruno restano');
  const listed = await call('mail/connections', 'GET', { token: tokenA });
  assert.deepEqual(listed.json.connections, []);
  assert.equal((await call('mail/connections', 'POST', { token: tokenA, body: { provider: 'mio-server', host: '10.0.0.1', email: 'a@b.it', password: 'x' } })).status, 400);
  fake.seed('mail_connection_attempts', Array.from({ length: 5 }, () => ({ user_id: A, created_at: new Date().toISOString() })));
  assert.equal((await call('mail/connections', 'POST', { token: tokenA, body: { provider: 'libero', email: 'anna@libero.it', password: 'x' } })).status, 429);
  fake.seed('mail_oauth_states', Array.from({ length: 5 }, (_, i) => ({ state_hash: `s${i}`, user_id: A, created_at: new Date().toISOString() })));
  assert.equal((await call('mail/start', 'POST', { token: tokenA, body: { provider: 'gmail' } })).status, 429);
  assert.equal((await call('mail/start', 'POST', { token: tokenB, body: { provider: 'casella-strana' } })).status, 400);
});

test('documenti e pagamenti trovati nelle email: solo i propri; un lettore della casa non paga', async () => {
  const doc = '40000000-0000-4000-8000-00000000000b', ev = '41000000-0000-4000-8000-00000000000a', evB = '41000000-0000-4000-8000-00000000000b';
  const billA = '42000000-0000-4000-8000-00000000000a', billHome = '42000000-0000-4000-8000-000000000001', billB = '42000000-0000-4000-8000-00000000000b';
  fake.seed('mail_documents', [{ id: doc, user_id: B, status: 'pending', storage_path: 'b/f.pdf' }]);
  fake.seed('bills', [
    { id: billA, user_id: A, home_id: null, amount: 30, supplier: 'Enel', paid_at: null, source: 'document' },
    { id: billHome, user_id: V, home_id: '10000000-0000-4000-8000-000000000002', amount: 30, supplier: 'Enel', paid_at: null },
    { id: billB, user_id: B, home_id: null, amount: 30, supplier: 'Enel', paid_at: null, source: 'document' },
  ]);
  fake.seed('home_members', [{ home_id: '10000000-0000-4000-8000-000000000002', user_id: V, role: 'viewer' }]);
  fake.seed('mail_payment_evidence', [
    { id: ev, user_id: V, status: 'pending', amount: 30, sender_email: 'pagamenti@banca.it', received_at: '2026-11-20T10:00:00Z' },
    { id: evB, user_id: B, status: 'pending', amount: 30, sender_email: 'pagamenti@banca.it', received_at: '2026-11-20T10:00:00Z' },
  ]);
  // Prima della correzione del 23 novembre ogni PATCH rispondeva 400: l'identificativo non passava mai.
  assert.equal((await call('mail/documents', 'PATCH', { token: tokenA, body: { id: doc, action: 'dismissed' } })).status, 404);
  assert.equal(fake.rows('mail_documents').find(d => d.id === doc).status, 'pending', 'il documento di Bruno non cambia');
  assert.equal((await call('mail/documents', 'PATCH', { token: tokenB, body: { id: doc, action: 'imported', bill_id: billA } })).status, 400, 'bolletta di un altro');
  assert.equal((await call('mail/documents', 'PATCH', { token: tokenA, body: { id: doc, action: 'dismissed', bill_id: 'x' } })).status, 404);
  fake.seed('mail_documents', [{ id: '40000000-0000-4000-8000-0000000000aa', user_id: A, status: 'pending', storage_path: 'a/f.pdf', sender: 'Enel <bollette@enel.it>', suggestion: {} }]);
  const dismissed = await call('mail/documents', 'PATCH', { token: tokenA, body: { id: '40000000-0000-4000-8000-0000000000aa', action: 'dismissed' } });
  assert.equal(dismissed.status, 200, 'il proprio documento si scarta');
  const mine = fake.rows('mail_documents').find(d => d.id === '40000000-0000-4000-8000-0000000000aa');
  assert.deepEqual([mine.status, mine.sender, mine.filename], ['dismissed', null, '[eliminato]'], 'e si tolgono i dati del messaggio');
  assert.ok(fake.state.removed.includes('mail-bills/a/f.pdf'), 'e si cancella l\'allegato');
  assert.equal((await call('mail/documents', 'PATCH', { token: tokenA, body: { id: '40000000-0000-4000-8000-0000000000aa', action: 'dismissed' } })).status, 404, 'una volta sola');
  assert.equal((await call('mail/payments', 'PATCH', { token: tokenA, body: { id: evB, action: 'confirm', bill_id: billA } })).status, 409, 'pagamento di un altro');
  assert.equal(fake.rows('bills').find(b => b.id === billA).paid_at, null);
  assert.equal((await call('mail/payments', 'PATCH', { token: tokenV, body: { id: ev, action: 'confirm', bill_id: billHome } })).status, 403, 'il lettore della casa non paga');
  assert.equal(fake.rows('bills').find(b => b.id === billHome).paid_at, null);
  assert.equal((await call('mail/payments', 'PATCH', { token: tokenB, body: { id: evB, action: 'confirm', bill_id: billB, trust_sender: 'sì' } })).status, 400);
  const paid = await call('mail/payments', 'PATCH', { token: tokenB, body: { id: evB, action: 'confirm', bill_id: billB } });
  assert.equal(paid.status, 200);
  assert.equal(fake.rows('bills').find(b => b.id === billB).paid_at, '2026-11-20T10:00:00Z');
});

test('cancellazione dell\'account: email ripetuta, case condivise prima, poi solo il proprio', async () => {
  fake.seed('homes', [{ id: '10000000-0000-4000-8000-000000000009', name: 'Casa al mare', owner_id: B }]);
  fake.seed('home_members', [{ home_id: '10000000-0000-4000-8000-000000000009', user_id: A, role: 'editor' }]);
  assert.equal((await call('account/delete', 'POST', { token: tokenB, body: { confirm_email: 'anna@example.org' } })).status, 400, 'email di un altro');
  const owner = await call('account/delete', 'POST', { token: tokenB, body: { confirm_email: 'Bruno@Example.org ' } });
  assert.equal(owner.status, 409);
  assert.deepEqual(owner.json.homes, ['Casa al mare']);
  assert.deepEqual(fake.state.deletedUsers, []);
  const ok = await call('account/delete', 'POST', { token: tokenV, body: { confirm_email: 'vera@example.org' } });
  assert.equal(ok.status, 200);
  assert.deepEqual(fake.state.deletedUsers, [V], 'si cancella solo chi chiama');
});

test('risposte di errore: solo un codice, mai dettagli interni', async () => {
  const res = await call('integration-key', 'GET', { token: 'token-falso' });
  assert.deepEqual(Object.keys(res.json), ['error']);
  assert.match(res.headers.get('cache-control') || '', /no-store/);
});
