import test from 'node:test';
import assert from 'node:assert/strict';
import { processBillReminders, readIn } from '../lib/reminder-run.mjs';

// Database finto in memoria, con le chiavi uniche delle tabelle vere: basta per select … in …,
// neq, range, upsert (con o senza ignoreDuplicates, con select) e delete … eq.
const KEYS = { reminders: ['bill_id', 'reminder_date'], push_delivery_log: ['bill_id', 'user_id', 'reminder_date'], reminder_email_log: ['bill_id', 'user_id'] };
function fakeAdmin(db) {
  const calls = { read: {}, write: {} };
  const count = (kind, table) => { calls[kind][table] = (calls[kind][table] || 0) + 1; };
  const keyOf = (table, row) => (KEYS[table] || ['id']).map(k => row[k]).join('|');
  return { db, calls, from(table) {
    db[table] ||= [];
    const filters = [];
    const reader = {
      in(col, vals) { filters.push(r => vals.includes(r[col])); return reader; },
      neq(col, val) { filters.push(r => r[col] !== val); return reader; },
      eq(col, val) { filters.push(r => r[col] === val); return reader; },
      async range(a, b) { count('read', table); return { data: db[table].filter(r => filters.every(f => f(r))).slice(a, b + 1), error: null }; },
    };
    return {
      select() { return reader; },
      upsert(rows, { ignoreDuplicates } = {}) {
        count('write', table);
        const inserted = [];
        for (const row of rows) {
          const k = keyOf(table, row), i = db[table].findIndex(r => keyOf(table, r) === k);
          if (i < 0) { const copy = { id: `${table}-${db[table].length}`, ...row }; db[table].push(copy); inserted.push(copy); }
          else if (!ignoreDuplicates) { Object.assign(db[table][i], row); inserted.push(db[table][i]); }
        }
        const result = { data: inserted, error: null };
        return { select: async () => result, then: (ok, ko) => Promise.resolve(result).then(ok, ko) };
      },
      delete() {
        count('write', table);
        const conds = [];
        const del = { eq(col, val) { conds.push(r => r[col] === val); return del; }, then(ok) { db[table] = db[table].filter(r => !conds.every(c => c(r))); return Promise.resolve({ error: null }).then(ok); } };
        return del;
      },
    };
  } };
}

const TODAY = '2026-11-23';
function world() {
  return {
    home_members: [
      { home_id: 'h1', user_id: 'anna', role: 'owner' }, { home_id: 'h1', user_id: 'bruno', role: 'editor' }, { home_id: 'h1', user_id: 'carla', role: 'viewer' },
    ],
    profiles: [
      { id: 'anna', email: 'anna@x.it', reminders_enabled: true, reminder_emails: true },
      { id: 'bruno', email: 'bruno@x.it', reminders_enabled: true, reminder_emails: false },
      { id: 'carla', email: 'carla@x.it', reminders_enabled: true, reminder_emails: true },
      { id: 'dario', email: 'dario@x.it', reminders_enabled: true },
      { id: 'ex', email: 'ex@x.it', reminders_enabled: true },
    ],
    user_language_preferences: [{ user_id: 'bruno', language: 'de' }, { user_id: 'carla', language: 'en' }],
    user_alert_preferences: [{ user_id: 'bruno', push_bills: false }],
    push_subscriptions: [
      { id: 'd-anna', user_id: 'anna', endpoint: 'e1' }, { id: 'd-bruno', user_id: 'bruno', endpoint: 'e2' },
      { id: 'd-carla', user_id: 'carla', endpoint: 'e3' }, { id: 'd-dario', user_id: 'dario', endpoint: 'gone' },
    ],
    push_delivery_log: [], reminder_email_log: [], reminders: [],
  };
}
const BILLS = [
  { id: 'casa', user_id: 'anna', home_id: 'h1', title: 'Luce', due_date: '2026-11-25' },
  { id: 'personale', user_id: 'dario', home_id: null, title: 'Gas', due_date: '2026-11-24' },
  { id: 'di-ex', user_id: 'ex', home_id: 'h1', title: 'Acqua', due_date: '2026-11-26' },
];
function deps(sent) {
  return {
    push: { allowed: pref => pref.push_bills !== false, copy: ({ language, bill }) => ({ language, title: bill.title }),
      send: async (device, copy) => { if (device.endpoint === 'gone') throw Object.assign(new Error('gone'), { statusCode: 410 }); sent.push.push([device.user_id, copy.language, copy.title]); } },
    email: { send: async (address, bill, language) => { sent.email.push([address, bill.id, language]); return { sent: true }; } },
  };
}
const counts = () => ({ notifications_created: 0, emails_sent: 0, push_sent: 0, errors: [] });

test('chi riceve cosa: come prima della riscrittura', async () => {
  const admin = fakeAdmin(world()), sent = { push: [], email: [] }, c = counts();
  await processBillReminders(admin, BILLS, { today: TODAY, appUrl: 'https://casa', counts: c, ...deps(sent) });
  // Promemoria nell'app: a chi ha inserito la bolletta ed è ancora nella casa (ex è uscito).
  assert.deepEqual(admin.db.reminders.map(r => [r.bill_id, r.user_id]).sort(), [['casa', 'anna'], ['personale', 'dario']]);
  assert.equal(c.notifications_created, 2);
  // Push: tutti i membri con le push accese (bruno le ha spente), nella loro lingua; anche per la
  // bolletta di chi è uscito, perché resta della casa.
  assert.deepEqual(sent.push.sort(), [['anna', 'it', 'Acqua'], ['anna', 'it', 'Luce'], ['carla', 'en', 'Acqua'], ['carla', 'en', 'Luce']]);
  // Il dispositivo che non esiste più (410) si toglie; la consegna non riuscita resta da riprovare.
  assert.equal(admin.db.push_subscriptions.some(d => d.id === 'd-dario'), false);
  assert.equal(admin.db.push_delivery_log.find(r => r.user_id === 'dario').sent_at, null);
  // Email: proprietario ed editor che le vogliono (bruno le ha spente, carla è solo lettrice),
  // più chi ha inserito una bolletta personale.
  assert.deepEqual(sent.email.sort(), [['anna@x.it', 'casa', 'it'], ['anna@x.it', 'di-ex', 'it'], ['dario@x.it', 'personale', 'it']]);
  assert.equal(c.emails_sent, 3);
  assert.ok(admin.db.reminder_email_log.every(r => r.sent_at), 'esito registrato');
  assert.deepEqual(c.errors, []);
});

test('il secondo giro dello stesso giorno non ripete niente, ma riprova le push non consegnate', async () => {
  const admin = fakeAdmin(world()), first = { push: [], email: [] }, second = { push: [], email: [] };
  await processBillReminders(admin, BILLS, { today: TODAY, appUrl: 'x', counts: counts(), ...deps(first) });
  admin.db.push_subscriptions.push({ id: 'd-dario-2', user_id: 'dario', endpoint: 'nuovo' });
  const c = counts();
  await processBillReminders(admin, BILLS, { today: TODAY, appUrl: 'x', counts: c, ...deps(second) });
  assert.equal(c.notifications_created, 0);
  assert.deepEqual(second.email, []);
  assert.deepEqual(second.push, [['dario', 'it', 'Gas']], 'solo la push che non era arrivata');
  // Il giorno dopo: niente di nuovo per chi l'ha già ricevuta.
  const third = { push: [], email: [] };
  await processBillReminders(admin, BILLS, { today: '2026-11-24', appUrl: 'x', counts: counts(), ...deps(third) });
  assert.deepEqual(third.push, []);
  assert.deepEqual(third.email, []);
});

test('letture a blocchi: lo stesso numero con 3 bollette o con 600', async () => {
  const small = fakeAdmin(world());
  await processBillReminders(small, BILLS, { today: TODAY, appUrl: 'x', counts: counts(), ...deps({ push: [], email: [] }) });
  const many = Array.from({ length: 600 }, (_, i) => ({ id: `b${i}`, user_id: 'anna', home_id: 'h1', title: `B${i}`, due_date: '2026-11-25' }));
  const big = fakeAdmin(world());
  await processBillReminders(big, many, { today: TODAY, appUrl: 'x', counts: counts(), ...deps({ push: [], email: [] }) });
  const reads = a => Object.values(a.calls.read).reduce((x, y) => x + y, 0);
  assert.ok(reads(small) <= 8, `letture con 3 bollette: ${reads(small)}`);
  // 600 bollette: i registri si leggono a gruppi di 100 id (6 + 6), il resto una volta sola.
  assert.ok(reads(big) <= 18, `letture con 600 bollette: ${reads(big)}`);
  // Prima erano più letture per ogni bolletta e persona: migliaia.
  const writes = Object.values(big.calls.write).reduce((x, y) => x + y, 0);
  assert.ok(writes <= 12, `scritture in blocco: ${writes}`);
});

test('senza lingue niente invii; senza profili niente di niente', async () => {
  const w = world(), admin = fakeAdmin(w);
  const broken = admin.from.bind(admin);
  admin.from = table => {
    const q = broken(table);
    if (table !== 'user_language_preferences') return q;
    return { ...q, select: () => ({ in: () => ({ range: async () => ({ data: null, error: { message: 'lingue non disponibili' } }) }) }) };
  };
  const sent = { push: [], email: [] }, c = counts();
  await processBillReminders(admin, BILLS, { today: TODAY, appUrl: 'x', counts: c, ...deps(sent) });
  assert.equal(c.notifications_created, 2, 'i promemoria nell’app non dipendono dalla lingua');
  assert.deepEqual(sent, { push: [], email: [] });
  assert.match(c.errors[0], /^Lingue: lingue non disponibili/);
});

test('readIn: gruppi di 100 id, pagine da 1000 righe, id ripetuti o vuoti ignorati', async () => {
  const rows = Array.from({ length: 2500 }, (_, i) => ({ id: `r${i}`, bill_id: `b${i % 150}` }));
  const admin = fakeAdmin({ t: rows });
  const ids = [...Array.from({ length: 150 }, (_, i) => `b${i}`), 'b1', null, ''];
  const out = await readIn(admin, 't', '*', 'bill_id', ids);
  assert.equal(out.length, 2500);
  assert.equal(admin.calls.read.t, 2 + 1, 'primo gruppo (1667 righe): 2 pagine; secondo (833): 1');
  assert.deepEqual(await readIn(admin, 't', '*', 'bill_id', []), []);
});
