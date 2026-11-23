// Fase 2 · 3.3 — automazioni personalizzate: soglie delle bollette, rinnovi, promemoria periodici.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeAutomation, simulateAutomation, automationEventsToday, nextOccurrence, addMonthsFrom, inScope, AUTOMATION_LIMITS } from '../lib/automations.mjs';
import { processAutomations } from '../lib/automation-alerts.mjs';
import { automationAlertCopy } from '../lib/extra-alert-copy.mjs';
import { pushAllowed } from '../lib/extra-alerts.mjs';
import { MESSAGE_KEYS } from '../lib/i18n.mjs';
import { CODES } from '../lib/i18n-core.mjs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const TODAY = '2026-11-22';

test('Controllo delle regole: solo i dati del tipo scelto, nei limiti', () => {
  assert.deepEqual(normalizeAutomation({ kind: 'bill_amount', name: '  Luce  alta ', amount_threshold: '120,5', category: 'Luce', days_before: 9, next_on: '2026-01-01' }).value,
    { kind: 'bill_amount', name: 'Luce alta', amount_threshold: 120.5, category: 'Luce', supplier_match: null, service_match: null, days_before: null, every_months: null, next_on: null, notify_all: false, paused: false });
  assert.equal(normalizeAutomation({ kind: 'contract_renewal', name: 'Rinnovi', days_before: '45' }).value.days_before, 45);
  assert.deepEqual(normalizeAutomation({ kind: 'recurring', name: 'Filtri', every_months: 3, next_on: '2026-12-01' }).value.days_before, 0);
  for (const [input, error] of [
    [{ kind: 'altro', name: 'xx' }, 'automation.error.kind'],
    [{ kind: 'bill_amount', name: 'x', amount_threshold: 5 }, 'automation.error.name'],
    [{ kind: 'bill_amount', name: 'Soglia', amount_threshold: 0 }, 'automation.error.amount'],
    [{ kind: 'bill_amount', name: 'Soglia', amount_threshold: 100000.01 }, 'automation.error.amount'],
    [{ kind: 'contract_renewal', name: 'Rinnovi', days_before: 0 }, 'automation.error.days'],
    [{ kind: 'contract_renewal', name: 'Rinnovi', days_before: 2.5 }, 'automation.error.days'],
    [{ kind: 'recurring', name: 'Filtri', every_months: 25, next_on: '2026-12-01' }, 'automation.error.every'],
    [{ kind: 'recurring', name: 'Filtri', every_months: 3, next_on: '' }, 'automation.error.date'],
    [{ kind: 'recurring', name: 'Filtri', every_months: 3, next_on: '2026-12-01', days_before: 181 }, 'automation.error.days'],
  ]) assert.equal(normalizeAutomation(input).error, error, JSON.stringify(input));
});

test('Promemoria periodici: il giorno non scivola e si conta dalla partenza', () => {
  assert.equal(addMonthsFrom('2026-01-31', 1), '2026-02-28');
  assert.equal(addMonthsFrom('2026-01-31', 2), '2026-03-31');
  assert.equal(addMonthsFrom('2027-11-30', 3), '2028-02-29');
  assert.equal(nextOccurrence('2026-01-31', 1, TODAY), '2026-11-30');
  assert.equal(nextOccurrence('2026-12-05', 3, TODAY), '2026-12-05');
  assert.equal(nextOccurrence('2025-11-22', 12, TODAY), '2026-11-22', 'oggi compreso');
  assert.equal(nextOccurrence('', 3, TODAY), '');
});

const bills = [
  { id: 'b1', supplier: 'Enel Energia', title: 'Luce', category: 'Luce', amount: 180, due_date: '2026-12-01', paid_at: null },
  { id: 'b2', supplier: 'Enel Energia', title: 'Luce', category: 'Luce', amount: 90, due_date: '2026-12-15', paid_at: null },
  { id: 'b3', supplier: 'Gas Più', title: 'Gas', category: 'Gas', amount: 210, due_date: '2026-11-30', paid_at: null },
  { id: 'b4', supplier: 'Enel Energia', title: 'Luce', category: 'Luce', amount: 300, due_date: '2026-11-01', paid_at: null },
  { id: 'b5', supplier: 'Enel Energia', title: 'Luce', category: 'Luce', amount: 400, due_date: '2026-12-20', paid_at: '2026-11-20T10:00:00Z' },
];

test('Soglia delle bollette: solo bollette da pagare, non scadute, sopra la soglia e del filtro scelto', () => {
  const rule = { kind: 'bill_amount', amount_threshold: 150 };
  assert.deepEqual(simulateAutomation(rule, { bills }, TODAY).map(i => i.reference_id), ['b3', 'b1']);
  assert.deepEqual(simulateAutomation({ ...rule, category: 'Luce' }, { bills }, TODAY).map(i => i.reference_id), ['b1']);
  assert.deepEqual(simulateAutomation({ ...rule, supplier_match: 'gas più' }, { bills }, TODAY).map(i => i.reference_id), ['b3']);
  const [item] = simulateAutomation({ ...rule, category: 'Luce' }, { bills }, TODAY);
  assert.deepEqual(item, { reference_id: 'b1', event_date: '2026-12-01', fire_on: TODAY, source: { name: 'Enel Energia', amount: 180, date: '2026-12-01', threshold: 150 } });
});

test('Rinnovi: avviso dal giorno scelto, anche se il controllo di quel giorno è saltato', () => {
  const contracts = [
    { id: 'c1', supplier: 'Enel', service: 'Luce casa', renewal_on: '2026-12-12' },
    { id: 'c2', supplier: 'Fibra Ok', service: 'Internet', renewal_on: '2027-03-01' },
    { id: 'c3', supplier: 'Vecchio', service: 'Gas', renewal_on: '2026-10-01' },
    { id: 'c4', supplier: 'Lontano', service: 'Gas', renewal_on: '2028-01-01' },
  ];
  const rule = { kind: 'contract_renewal', days_before: 20 };
  const items = simulateAutomation(rule, { contracts }, TODAY);
  assert.deepEqual(items.map(i => [i.reference_id, i.fire_on, i.event_date]), [['c1', TODAY, '2026-12-12'], ['c2', '2027-02-09', '2027-03-01']]);
  assert.deepEqual(automationEventsToday(rule, { contracts }, TODAY).map(i => i.reference_id), ['c1'], 'c1 entrava nella finestra il 22: scatta oggi');
  assert.deepEqual(automationEventsToday(rule, { contracts }, '2026-11-25').map(i => i.reference_id), ['c1'], 'un giorno di controllo saltato non perde l’avviso');
  assert.deepEqual(simulateAutomation({ ...rule, service_match: 'internet' }, { contracts }, TODAY).map(i => i.reference_id), ['c2']);
});

test('Promemoria: un avviso per scadenza, con anticipo; una regola sospesa tace', () => {
  const rule = { id: 'r1', kind: 'recurring', name: 'Filtri del condizionatore', every_months: 3, next_on: '2026-09-01', days_before: 10 };
  const [item] = simulateAutomation(rule, {}, TODAY);
  assert.deepEqual(item, { reference_id: 'r1', event_date: '2026-12-01', fire_on: TODAY, source: { name: 'Filtri del condizionatore', date: '2026-12-01' } });
  assert.equal(automationEventsToday({ ...rule, days_before: 0 }, {}, TODAY).length, 0, 'senza anticipo scatta il 1° dicembre');
  assert.equal(automationEventsToday({ ...rule, paused: true }, {}, TODAY).length, 0);
});

test('Spazio della regola: la stessa casa, oppure lo spazio personale di chi l’ha creata', () => {
  assert.ok(inScope({ home_id: 'h1', user_id: 'u1' }, { home_id: 'h1', user_id: 'u2' }));
  assert.ok(!inScope({ home_id: 'h1', user_id: 'u1' }, { home_id: 'h2', user_id: 'u1' }));
  assert.ok(inScope({ home_id: null, user_id: 'u1' }, { home_id: null, user_id: 'u1' }));
  assert.ok(!inScope({ home_id: null, user_id: 'u1' }, { home_id: 'h1', user_id: 'u1' }), 'le bollette della casa non entrano nelle regole personali');
  assert.ok(!inScope({ home_id: null, user_id: 'u1' }, { home_id: null, user_id: 'u2' }));
});

test('Testi degli avvisi nelle 6 lingue', () => {
  const texts = CODES.map(lang => automationAlertCopy('bill_amount', { name: 'Enel', amount: 180, date: '2026-12-01', threshold: 150 }, lang));
  assert.equal(new Set(texts.map(t => t.title)).size, CODES.length, 'ogni lingua ha il suo titolo');
  assert.match(texts[0].body, /180,00\s€, scadenza 1 dic 2026 \(soglia 150,00\s€\)\./);
  assert.match(automationAlertCopy('contract_renewal', { name: 'Enel', service: 'Luce', date: '2026-12-12' }, 'de').body, /^Luce verlängert sich am 12\. Dez\. 2026/);
  assert.equal(automationAlertCopy('recurring', { name: 'Filtri', date: '2026-12-01' }, 'en').title, 'Reminder: Filtri');
  assert.throws(() => automationAlertCopy('recurring', { name: '', date: '2026-12-01' }, 'it'));
  assert.throws(() => automationAlertCopy('recurring', { name: 'X', date: 'domani' }, 'it'));
  assert.throws(() => automationAlertCopy('altro', { name: 'X', date: '2026-12-01' }, 'it'));
  for (const key of ['nav.automations', 'automation.help', 'automation.kind.bill_amount', 'automation.kind.contract_renewal', 'automation.kind.recurring',
    'automation.placeholder.recurring', 'automation.sim.bill', 'automation.sim.renewal', 'automation.sim.recurring', 'automation.summary.recurringMonthly',
    'automation.error.limit', 'automation.migration', 'extra.alerts.automations', 'server.automation.amountBody'])
    assert.ok(MESSAGE_KEYS.includes(key), key);
});

// Database finto: tabelle in memoria e le sole operazioni usate dal controllo programmato.
function fakeAdmin(tables) {
  const alerts = tables.user_alerts ||= [];
  return {
    from(name) {
      const filters = []; let upsertRow = null;
      const builder = {
        // Dopo un upsert (consegna a blocchi) select() restituisce le righe nuove; altrimenti legge.
        select() {
          if (!upsertRow) return builder;
          const added = [];
          for (const row of [].concat(upsertRow)) {
            const exists = alerts.some(a => a.user_id === row.user_id && a.kind === row.kind && a.reference_id === row.reference_id && a.event_date === row.event_date);
            if (!exists) { alerts.push(row); added.push(row); }
          }
          return Promise.resolve({ data: added, error: null });
        },
        limit() { return builder; },
        range(from, to) { return builder.then(result => ({ data: result.data ? result.data.slice(from, to + 1) : null, error: result.error })); },
        eq(column, value) { filters.push(row => row[column] === value); return builder; },
        is(column, value) { filters.push(row => (row[column] ?? null) === value); return builder; },
        in(column, values) { filters.push(row => values.includes(row[column])); return builder; },
        gte(column, value) { filters.push(row => row[column] >= value); return builder; },
        lte(column, value) { filters.push(row => row[column] <= value); return builder; },
        upsert(row) { upsertRow = row; return builder; },
        maybeSingle() {
          if (upsertRow) {
            const exists = alerts.some(a => a.user_id === upsertRow.user_id && a.kind === upsertRow.kind && a.reference_id === upsertRow.reference_id && a.event_date === upsertRow.event_date);
            if (exists) return Promise.resolve({ data: null, error: null });
            alerts.push(upsertRow); return Promise.resolve({ data: { id: String(alerts.length) }, error: null });
          }
          return builder.then(result => ({ data: result.data[0] || null, error: result.error }));
        },
        then(resolve, reject) {
          if (tables.error?.[name]) return Promise.resolve({ data: null, error: tables.error[name] }).then(resolve, reject);
          return Promise.resolve({ data: (tables[name] || []).filter(row => filters.every(f => f(row))), error: null }).then(resolve, reject);
        },
      };
      return builder;
    },
  };
}

test('Controllo programmato: avvisi a chi devono arrivare, una volta sola, nella sua lingua', async () => {
  const tables = {
    home_automations: [
      { id: 'r-casa', user_id: 'anna', home_id: 'h1', kind: 'bill_amount', name: 'Care', amount_threshold: 150, notify_all: true, paused: false },
      { id: 'r-mia', user_id: 'bruno', home_id: 'h1', kind: 'contract_renewal', name: 'Rinnovi', days_before: 30, notify_all: false, paused: false },
      { id: 'r-pers', user_id: 'carla', home_id: null, kind: 'recurring', name: 'Caldaia', every_months: 12, next_on: '2026-11-22', days_before: 0, notify_all: false, paused: false },
      { id: 'r-ferma', user_id: 'anna', home_id: 'h1', kind: 'bill_amount', name: 'Ferma', amount_threshold: 1, notify_all: true, paused: true },
    ],
    bills: [
      { id: 'b-casa', user_id: 'anna', home_id: 'h1', supplier: 'Enel', amount: 200, due_date: '2026-12-01', paid_at: null },
      { id: 'b-altra', user_id: 'anna', home_id: 'h2', supplier: 'Altra casa', amount: 900, due_date: '2026-12-01', paid_at: null },
    ],
    home_contracts: [{ id: 'c1', user_id: 'anna', home_id: 'h1', supplier: 'Fibra', service: 'Internet', renewal_on: '2026-12-10' }],
    home_members: [{ home_id: 'h1', user_id: 'anna' }, { home_id: 'h1', user_id: 'bruno' }],
    user_language_preferences: [{ user_id: 'bruno', language: 'en' }],
  };
  // Il filtro «paused=false» lo fa la query: qui lo applica il database finto.
  const admin = fakeAdmin(tables);
  const counts = { errors: [] };
  await processAutomations(admin, TODAY, counts);
  assert.deepEqual(counts.errors, []);
  const got = tables.user_alerts.map(a => [a.user_id, a.kind, a.reference_id, a.event_date]).sort();
  assert.deepEqual(got, [
    ['anna', 'automation', 'b-casa', '2026-12-01'],
    ['bruno', 'automation', 'b-casa', '2026-12-01'],
    ['bruno', 'automation', 'c1', '2026-12-10'],
    ['carla', 'automation', 'r-pers', '2026-11-22'],
  ], 'tutta la casa per «Care», solo Bruno per la sua regola, solo Carla per quella personale; niente dall’altra casa né dalla regola sospesa');
  assert.equal(tables.user_alerts.find(a => a.user_id === 'bruno' && a.reference_id === 'c1').title, 'Renewal coming up: Fibra');
  const before = tables.user_alerts.length;
  await processAutomations(admin, TODAY, { errors: [] });
  assert.equal(tables.user_alerts.length, before, 'il giorno dopo (o rilanciato) non duplica');
  // Chi ha lasciato la casa non riceve più gli avvisi della sua regola «solo io».
  tables.home_members = [{ home_id: 'h1', user_id: 'anna' }];
  tables.home_contracts[0].renewal_on = '2026-12-11';
  await processAutomations(admin, TODAY, { errors: [] });
  assert.ok(!tables.user_alerts.some(a => a.user_id === 'bruno' && a.event_date === '2026-12-11'));
});

test('Senza la migrazione il controllo programmato salta le automazioni senza errori', async () => {
  const counts = { errors: [] };
  await processAutomations(fakeAdmin({ error: { home_automations: { code: 'PGRST205', message: 'missing' } } }), TODAY, counts);
  assert.deepEqual(counts.errors, []);
  const other = { errors: [] };
  await processAutomations(fakeAdmin({ error: { home_automations: { code: '57014', message: 'timeout' } } }), TODAY, other);
  assert.equal(other.errors.length, 1);
});

test('Notifiche push: interruttore proprio e ore di silenzio', () => {
  assert.ok(pushAllowed({}, 'automation', new Date('2026-11-22T10:00:00Z')));
  assert.ok(!pushAllowed({ push_automations: false }, 'automation', new Date('2026-11-22T10:00:00Z')));
  assert.ok(!pushAllowed({ quiet_from: '22:00', quiet_until: '07:00' }, 'automation', new Date('2026-11-22T23:30:00Z')));
});

test('Migrazione v43: accesso per casa, limiti uguali a quelli dell’app, avvisi «automation»', () => {
  const sql = read('supabase/migrate_v43_automazioni.sql');
  assert.match(sql, /using \(public\.v19_can_read\(user_id, home_id\)\)/);
  assert.match(sql, /with check \(user_id = \(select auth\.uid\(\)\) and public\.v19_can_edit\(user_id, home_id\)\)/);
  assert.match(sql, /revoke all on public\.home_automations from anon, authenticated;/);
  const columns = sql.match(/grant update \(([^)]+)\)/)[1];
  assert.doesNotMatch(columns, /user_id|home_id|created_at/, 'autore e casa non si cambiano');
  assert.match(sql, new RegExp(`>= ${AUTOMATION_LIMITS.perSpace} then`));
  assert.match(sql, new RegExp(`amount_threshold <= ${AUTOMATION_LIMITS.maxAmount}`));
  assert.match(sql, new RegExp(`days_before between 1 and ${AUTOMATION_LIMITS.maxDaysBefore}`));
  assert.match(sql, new RegExp(`every_months between 1 and ${AUTOMATION_LIMITS.maxEveryMonths}`));
  assert.match(sql, /'contract','maintenance','warranty','meter','missing_bill','mail_sync','move','savings','fraud','automation'/);
  assert.match(sql, /add column if not exists push_automations boolean not null default true/);
  assert.match(sql, /^begin;$/m); assert.match(sql, /^commit;$/m);
  assert.match(read('README.md'), /migrate_v43_automazioni\.sql/);
});

test('Collegamenti: menu, sezione caricata a richiesta, controllo programmato, preferenze', () => {
  const page = read('app/page.jsx');
  assert.match(page, /\{id:'automations',icon:Zap\}/);
  assert.match(page, /const Automations=lazy\(\(\)=>import\('\.\/Automations'\)\);/);
  assert.match(read('lib/daily-jobs.mjs'), /await processAutomations\(admin,today,counts,\{sendPush,configuredPush:\(\)=>pushOn,now\}\);/);
  assert.match(read('app/HomeExtra.jsx'), /\['push_automations','extra\.alerts\.automations'\]/);
  const ui = read('app/Automations.jsx');
  assert.match(ui, /simulateAutomation\(rule, data, today\)/, 'la prova usa lo stesso calcolo del controllo programmato');
  assert.match(ui, /const writable = demo \|\| canWrite;/);
  assert.doesNotMatch(ui, /from '\.\.\/lib\/i18n\.mjs'/);
});
