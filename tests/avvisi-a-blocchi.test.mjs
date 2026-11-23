import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { deliverAlerts, processExtraAlerts } from '../lib/extra-alerts.mjs';
import { processV20Alerts } from '../lib/v20-alerts.mjs';
import { processSummaries } from '../lib/summary-run.mjs';
import { addDaysISO } from '../lib/dates.mjs';

// Database finto in memoria con i filtri usati dai lavori notturni e le chiavi uniche vere.
const KEYS = { user_alerts: ['user_id', 'kind', 'reference_id', 'event_date'], bill_summaries: ['user_id', 'summary_date'] };
function fakeAdmin(db) {
  const calls = { read: {}, write: {}, filters: {} };
  const count = (kind, t) => { calls[kind][t] = (calls[kind][t] || 0) + 1; };
  const keyOf = (t, r) => (KEYS[t] || ['id']).map(k => r[k]).join('|');
  const cmp = (op, a, b) => op === 'eq' ? String(a) === String(b) : op === 'lt' ? a < b : op === 'gt' ? a > b : op === 'lte' ? a <= b : op === 'gte' ? a >= b : false;
  return { db, calls, from(t) {
    db[t] ||= [];
    const filters = [], log = [];
    const q = {
      in(c, v) { filters.push(r => v.includes(r[c])); log.push(`in:${c}`); return q; },
      eq(c, v) { filters.push(r => r[c] === v); log.push(`eq:${c}`); return q; },
      neq(c, v) { filters.push(r => r[c] !== v); return q; },
      is(c, v) { filters.push(r => (r[c] ?? null) === v); log.push(`is:${c}`); return q; },
      gte(c, v) { filters.push(r => r[c] >= v); log.push(`gte:${c}`); return q; },
      lte(c, v) { filters.push(r => r[c] <= v); log.push(`lte:${c}`); return q; },
      or(expr) { const parts = expr.split(',').map(p => p.split('.')); filters.push(r => parts.some(([c, op, ...v]) => cmp(op, r[c], v.join('.')))); log.push(`or:${expr}`); return q; },
      order() { return q; }, limit() { return q; },
      then(ok, ko) { return q.range(0, 100000).then(ok, ko); },
      async range(a, b) { count('read', t); (calls.filters[t] ||= []).push(log.join(' ')); return { data: db[t].filter(r => filters.every(f => f(r))).slice(a, b + 1), error: null }; },
    };
    return {
      select() { return q; },
      upsert(rows, { ignoreDuplicates } = {}) {
        count('write', t);
        const out = [];
        for (const row of [].concat(rows)) {
          const i = db[t].findIndex(r => keyOf(t, r) === keyOf(t, row));
          if (i < 0) { const copy = { id: `${t}-${db[t].length + 1}`, ...row }; db[t].push(copy); out.push(copy); }
          else if (!ignoreDuplicates) { Object.assign(db[t][i], row); out.push(db[t][i]); }
        }
        const res = { data: out, error: null };
        return { select: async () => res, then: (ok, ko) => Promise.resolve(res).then(ok, ko) };
      },
      update(patch) { count('write', t); const conds = []; const u = { eq(c, v) { conds.push(r => r[c] === v); return u; }, then(ok) { for (const r of db[t]) if (conds.every(f => f(r))) Object.assign(r, patch); return Promise.resolve({ error: null }).then(ok); } }; return u; },
      delete() { count('write', t); const conds = []; const d = { eq(c, v) { conds.push(r => r[c] === v); return d; }, then(ok) { db[t] = db[t].filter(r => !conds.every(f => f(r))); return Promise.resolve({ error: null }).then(ok); } }; return d; },
    };
  } };
}
const reads = a => Object.values(a.calls.read).reduce((x, y) => x + y, 0);
const counts = () => ({ errors: [], summaries_created: 0, summary_push_sent: 0, summary_emails_sent: 0 });
const people = () => ({
  home_members: [{ home_id: 'h1', user_id: 'anna' }, { home_id: 'h1', user_id: 'bruno' }],
  user_language_preferences: [{ user_id: 'bruno', language: 'de' }],
  user_alert_preferences: [{ user_id: 'bruno', push_maintenance: false }],
  push_subscriptions: [{ id: 'd1', user_id: 'anna', endpoint: 'a' }, { id: 'd2', user_id: 'bruno', endpoint: 'b' }, { id: 'd3', user_id: 'carla', endpoint: 'gone' }],
  user_alerts: [],
});
const pushDeps = sent => ({ configuredPush: () => true, sendPush: async (device, copy) => { if (device.endpoint === 'gone') throw Object.assign(new Error('gone'), { statusCode: 410 }); sent.push([device.user_id, copy.title]); } });

test('deliverAlerts: destinatari, lingua di ciascuno, un avviso per voce e giorno, push solo la prima volta', async () => {
  const admin = fakeAdmin(people()), sent = [], c = counts();
  const entries = [
    { item: { user_id: 'anna', home_id: 'h1' }, event: { kind: 'maintenance', reference_id: 'caldaia', event_date: '2026-11-23' }, copy: l => ({ title: `Caldaia (${l})`, body: 'b' }) },
    { item: { user_id: 'carla', home_id: null }, event: { kind: 'contract', reference_id: 'luce', event_date: '2026-11-23' }, copy: l => ({ title: `Luce (${l})`, body: 'b' }) },
    { item: { user_id: 'anna', home_id: 'h1' }, event: { kind: 'automation', reference_id: 'regola', event_date: '2026-11-23' }, copy: l => ({ title: `Regola (${l})`, body: 'b' }), recipients: ['anna', 'uscito'] },
  ];
  await deliverAlerts(admin, entries, c, pushDeps(sent));
  assert.deepEqual(admin.db.user_alerts.map(r => `${r.user_id}:${r.reference_id}:${r.title}`).sort(),
    ['anna:caldaia:Caldaia (it)', 'anna:regola:Regola (it)', 'bruno:caldaia:Caldaia (de)', 'carla:luce:Luce (it)']);
  assert.equal(c.extra_alerts_created, 4);
  // bruno ha spento le push di manutenzione; il dispositivo di carla non esiste più (410) e si toglie.
  assert.deepEqual(sent.sort(), [['anna', 'Caldaia (it)'], ['anna', 'Regola (it)']]);
  assert.equal(admin.db.push_subscriptions.some(d => d.id === 'd3'), false);
  const again = [], c2 = counts();
  await deliverAlerts(admin, entries, c2, pushDeps(again));
  assert.equal(c2.extra_alerts_created, 0);
  assert.deepEqual(again, [], 'nessuna push due volte per lo stesso avviso');
});

test('deliverAlerts: letture costanti con 3 o 300 avvisi', async () => {
  const many = Array.from({ length: 300 }, (_, i) => ({ item: { user_id: 'anna', home_id: 'h1' }, event: { kind: 'maintenance', reference_id: `o${i}`, event_date: '2026-11-23' }, copy: () => ({ title: 't', body: 'b' }) }));
  const small = fakeAdmin(people()); await deliverAlerts(small, many.slice(0, 3), counts(), pushDeps([]));
  const big = fakeAdmin(people()); await deliverAlerts(big, many, counts(), pushDeps([]));
  assert.equal(reads(big), reads(small), `letture: ${reads(small)} e ${reads(big)}`);
  assert.ok(reads(big) <= 4);
  assert.equal(big.calls.write.user_alerts, 2, '600 avvisi (300 × 2 membri) scritti in 2 blocchi');
});

test('avvisi di contratti, manutenzioni e autoletture: si leggono solo le voci di oggi', async () => {
  const today = '2026-11-23';
  const db = { ...people(),
    home_contracts: [{ id: 'k1', user_id: 'carla', home_id: null, renewal_on: addDaysISO(today, 30), alert_days: 30, supplier: 'Enel', service: 'Luce' }, { id: 'k2', user_id: 'carla', home_id: null, renewal_on: addDaysISO(today, 400), alert_days: 30 }],
    maintenance_assets: [{ id: 'a1', user_id: 'anna', home_id: 'h1', name: 'Caldaia', next_service_on: addDaysISO(today, 3) }, { id: 'a2', user_id: 'anna', home_id: 'h1', name: 'Frigo', next_service_on: addDaysISO(today, 50) }],
    meter_reminders: [{ id: 'm1', user_id: 'carla', home_id: null, meter_name: 'Gas', next_due_on: '2026-10-01', repeat_months: 3 }],
  };
  const admin = fakeAdmin(db), c = counts();
  await processExtraAlerts(admin, today, c, { configuredPush: () => false });
  assert.match(admin.calls.filters.home_contracts[0], /gte:renewal_on lte:renewal_on/);
  assert.match(admin.calls.filters.maintenance_assets[0], new RegExp(`or:next_service_on\\.eq\\.${addDaysISO(today, 3)},warranty_until\\.eq\\.${addDaysISO(today, 30)}`));
  assert.match(admin.calls.filters.meter_reminders[0], new RegExp(`or:next_due_on\\.eq\\.${addDaysISO(today, 3)},next_due_on\\.lt\\.${today}`));
  assert.deepEqual(admin.db.user_alerts.map(r => `${r.user_id}:${r.kind}:${r.reference_id}`).sort(), ['anna:maintenance:a1', 'bruno:maintenance:a1', 'carla:contract:k1']);
  assert.equal(admin.db.meter_reminders[0].next_due_on, '2026-01-01'.replace('2026', '2027'), 'autolettura scaduta spostata in avanti');
  assert.deepEqual(c.errors, []);
});

test('avvisi v20: la riga salvata non contiene home_id (la tabella non ce l’ha)', async () => {
  const today = '2026-11-23';
  const db = { ...people(), utilities: [], bills: [], mail_connections: [], home_savings_goals: [],
    home_move_plans: [{ id: 'trasloco', user_id: 'anna', home_id: 'h1', title: 'Via Roma', move_on: addDaysISO(today, 3) }] };
  const admin = fakeAdmin(db), c = counts();
  await processV20Alerts(admin, today, c, { configuredPush: () => false });
  assert.equal(c.v20_alerts, 2, 'un avviso per ciascun membro della casa');
  for (const row of admin.db.user_alerts) {
    assert.equal('home_id' in row, false);
    assert.deepEqual(Object.keys(row).filter(k => k !== 'id').sort(), ['body', 'event_date', 'kind', 'reference_id', 'title', 'user_id']);
  }
});

test('riepiloghi: bollette personali e delle case, uno per persona e giorno, letture a blocchi', async () => {
  const today = '2026-11-23';
  const db = { ...people(),
    bills: [
      { id: 'p1', user_id: 'anna', home_id: null, title: 'Gas', supplier: 'Eni', amount: 40, due_date: '2026-11-27', paid_at: null },
      { id: 's1', user_id: 'bruno', home_id: 'h1', title: 'Luce', supplier: 'Enel', amount: 80, due_date: '2026-11-28', paid_at: null },
      { id: 's2', user_id: 'bruno', home_id: 'h1', title: 'Acqua', supplier: 'Acea', amount: 20, due_date: '2026-11-25', paid_at: '2026-11-20' },
      { id: 'x1', user_id: 'anna', home_id: null, title: 'Dicembre', supplier: 'Tim', amount: 30, due_date: '2026-12-05', paid_at: null },
    ],
    bill_summaries: [],
  };
  const profiles = [
    { id: 'anna', email: 'anna@x.it', summary_frequency: 'daily' },
    { id: 'bruno', email: 'bruno@x.it', summary_frequency: 'daily' },
    { id: 'dario', email: 'dario@x.it', summary_frequency: 'daily' },
    { id: 'eva', email: 'eva@x.it', summary_frequency: 'monthly', summary_month_day: 1 },
  ];
  const sent = { push: [], email: [] };
  const deps = { push: { allowed: () => true, copy: ({ language, count, total }) => ({ title: `${count}/${total}/${language}` }), send: async (d, copy) => sent.push.push([d.user_id, copy.title]) },
    email: { send: async (to, items, day, lang) => { sent.email.push([to, items.map(b => b.id).join('+'), lang]); return { sent: true }; } } };
  const admin = fakeAdmin(db), c = counts();
  await processSummaries(admin, profiles, { today, appUrl: 'x', counts: c, ...deps });
  assert.equal(c.summaries_created, 2, 'anna e bruno; dario non ha bollette, eva non è il suo giorno');
  assert.deepEqual(sent.email.sort(), [['anna@x.it', 'p1+s1', 'it'], ['bruno@x.it', 's1', 'de']]);
  assert.deepEqual(sent.push.sort(), [['anna', '2/120/it'], ['bruno', '1/80/de']]);
  assert.ok(admin.db.bill_summaries.every(r => r.email_sent_at && r.push_sent_at));
  assert.ok(reads(admin) <= 7, `letture: ${reads(admin)}`);
  const again = fakeAdmin(admin.db), c2 = counts(), sent2 = { push: [], email: [] };
  await processSummaries(again, profiles, { today, appUrl: 'x', counts: c2, push: { ...deps.push, send: async () => sent2.push.push(1) }, email: { send: async () => { sent2.email.push(1); return { sent: true }; } } });
  assert.equal(c2.summaries_created, 0);
  assert.deepEqual(sent2, { push: [], email: [] }, 'il secondo giro non rimanda niente');
});

test('il cron usa i lavori a blocchi', () => {
  const cron = readFileSync(new URL('../app/api/cron/route.js', import.meta.url), 'utf8');
  assert.match(cron, /await processSummaries\(admin,profiles\|\|\[\],\{today,appUrl,counts,/);
  assert.doesNotMatch(cron, /for\(const profile of profiles\|\|\[\]\)/);
});

test('cron delle caselle: documenti scaduti tolti in blocco', () => {
  const mail = readFileSync(new URL('../app/api/mail/cron/route.js', import.meta.url), 'utf8');
  assert.match(mail, /remove\(old\.map\(d=>d\.storage_path\)\.filter\(Boolean\)\)/);
  assert.match(mail, /\.in\('id',ids\)/);
  assert.doesNotMatch(mail, /for\(const d of old\|\|\[\]\)/);
});
