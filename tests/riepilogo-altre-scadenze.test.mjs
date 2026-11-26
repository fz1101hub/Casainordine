// Altre scadenze nel riepilogo (scelta dell'utente del 26 novembre 2026, mattina): rate, documenti,
// salute (con o senza dettagli) e animali, personali e delle case; riepilogo anche senza bollette.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSummaryExtras, summaryExtrasCopy, summaryExtraCount, extrasHorizon } from '../lib/summary-extras.mjs';
import { processSummaries } from '../lib/summary-run.mjs';
import { summaryEmail } from '../lib/reminder-email.mjs';
import { billSummaryPushCopy } from '../lib/notification-push-copy.mjs';

const TODAY = '2026-11-26';
// Firma dei collegamenti per smettere di ricevere le email (lib/email-unsubscribe.mjs).
process.env.SUPABASE_SECRET_KEY ||= 'chiave-di-servizio-finta';

function fakeAdmin(db) {
  const reads = [];
  return {
    reads,
    from(name) {
      const filters = [];
      const b = {
        select() { return b; },
        in(c, vs) { filters.push(r => vs.includes(r[c])); return b; },
        eq(c, v) { filters.push(r => r[c] === v); return b; },
        is(c, v) { filters.push(r => (r[c] ?? null) === v); return b; },
        not(c, op, v) { filters.push(r => (r[c] ?? null) !== v); return b; },
        gte(c, v) { filters.push(r => r[c] >= v); return b; },
        lte(c, v) { filters.push(r => r[c] <= v); return b; },
        order() { return b; },
        range() { return b; },
        then(resolve, reject) {
          reads.push(name);
          if (!(name in db)) return Promise.resolve({ data: null, error: { code: 'PGRST205', message: 'missing' } }).then(resolve, reject);
          return Promise.resolve({ data: db[name].filter(r => filters.every(f => f(r))), error: null }).then(resolve, reject);
        },
      };
      return b;
    },
  };
}

const memberships = new Map([['anna', [{ home_id: 'h1', user_id: 'anna' }]], ['bruno', [{ home_id: 'h1', user_id: 'bruno' }]]]);
const db = () => ({
  payment_plans: [
    { id: 'p1', user_id: 'anna', home_id: null, title: 'Retta scuola', ended_on: null },
    { id: 'p2', user_id: 'bruno', home_id: 'h1', title: 'Colf', ended_on: null },
    { id: 'p3', user_id: 'anna', home_id: null, title: 'Finito', ended_on: '2026-06-30' },
  ],
  payment_installments: [
    { id: 'i1', plan_id: 'p1', label: 'Retta di dicembre', due_on: '2026-11-30', amount_cents: 35000, paid_on: null },
    { id: 'i2', plan_id: 'p1', label: 'Retta di novembre', due_on: '2026-11-16', amount_cents: 35000, paid_on: null },
    { id: 'i3', plan_id: 'p1', label: 'Pagata', due_on: '2026-11-28', amount_cents: 35000, paid_on: '2026-11-20' },
    { id: 'i4', plan_id: 'p1', label: 'Troppo avanti', due_on: '2027-01-10', amount_cents: 35000, paid_on: null },
    { id: 'i5', plan_id: 'p2', label: 'Contributi INPS', due_on: '2026-12-01', amount_cents: null, paid_on: null },
    { id: 'i6', plan_id: 'p3', label: 'Di un piano finito', due_on: '2026-11-29', amount_cents: 100, paid_on: null },
  ],
  family_documents: [
    { id: 'd1', user_id: 'anna', home_id: null, holder: 'Anna', kind: 'passport', label: '', expires_on: '2027-03-01', notice_days: 180 },
    { id: 'd2', user_id: 'bruno', home_id: 'h1', holder: 'Luca', kind: 'identity_card', label: '', expires_on: '2026-11-20', notice_days: 120 },
    { id: 'd3', user_id: 'anna', home_id: null, holder: 'Anna', kind: 'driving_license', label: '', expires_on: '2036-01-01', notice_days: 120 },
  ],
  health_people: [
    { id: 'luca', user_id: 'anna', home_id: null, name: 'Luca', birth_on: '2026-09-20', vaccine_plan: 'mandatory', checkup_plan: false, screening_plan: false, sex: null },
    { id: 'nonna', user_id: 'bruno', home_id: 'h1', name: 'Nonna', birth_on: '1950-01-01', vaccine_plan: 'off', checkup_plan: false, screening_plan: false, sex: 'female' },
  ],
  health_appointments: [
    { id: 'a1', person_id: 'nonna', kind: 'visit', title: 'Cardiologo', on_date: '2026-12-02', at_time: '09:30:00', done_on: null, schedule_key: null },
    { id: 'a2', person_id: 'nonna', kind: 'exam', title: 'Esami del sangue', on_date: '2026-11-20', at_time: null, done_on: null, schedule_key: null },
  ],
  home_pets: [{ id: 'fido', user_id: 'bruno', home_id: 'h1', name: 'Fido', ended_on: null }],
  home_pet_tasks: [
    { id: 't1', pet_id: 'fido', title: 'Antiparassitario', next_on: '2026-11-29' },
    { id: 't2', pet_id: 'fido', title: 'Vaccino', next_on: '2027-02-01' },
  ],
  user_alert_preferences: [{ user_id: 'anna', health_push_details: true }, { user_id: 'bruno', health_push_details: false }],
});

test('orizzonte: fino a fine mese, almeno una settimana', () => {
  assert.equal(extrasHorizon('2026-11-10'), '2026-11-30');
  assert.equal(extrasHorizon(TODAY), '2026-12-03');
});

test('altre scadenze: personali e della casa, a ciascuno le sue', async () => {
  const admin = fakeAdmin(db());
  const extras = await loadSummaryExtras(admin, { ids: ['anna', 'bruno', 'carla'], memberships, today: TODAY });
  const anna = extras.get('anna'), bruno = extras.get('bruno');
  assert.deepEqual(anna.installments.map(i => [i.label, i.late]), [['Retta di novembre', true], ['Retta di dicembre', false], ['Contributi INPS', false]], 'rate personali e della casa; non pagate, non oltre, non dei piani finiti');
  assert.deepEqual(bruno.installments.map(i => i.label), ['Contributi INPS'], 'Bruno non vede le rate personali di Anna');
  assert.deepEqual(anna.documents.map(d => [d.holder, d.kind, d.expired]), [['Luca', 'identity_card', true], ['Anna', 'passport', false]]);
  assert.deepEqual(bruno.documents.map(d => d.holder), ['Luca']);
  assert.deepEqual(anna.visits.map(v => v.title), ['Cardiologo'], 'visite non fatte da oggi all’orizzonte');
  assert.deepEqual(anna.toBook.map(b => [b.person, b.keys.length > 0]), [['Luca', true]], 'vaccini di Luca da prenotare');
  assert.deepEqual(bruno.toBook, [], 'Luca è nello spazio personale di Anna');
  assert.deepEqual(anna.pets.map(p => p.title), ['Antiparassitario']);
  assert.equal(anna.details, true);
  assert.equal(bruno.details, false);
  assert.equal(summaryExtraCount(extras.get('carla')), 0);
  assert.ok(admin.reads.length <= 13, `una lettura per tipo di dato (${admin.reads.length})`);
});

test('senza le tabelle nuove: nessuna altra scadenza, nessun errore', async () => {
  const extras = await loadSummaryExtras(fakeAdmin({}), { ids: ['anna'], memberships, today: TODAY });
  assert.equal(summaryExtraCount(extras.get('anna')), 0);
});

test('testi: dettagli della salute solo per chi li vuole', async () => {
  const extras = await loadSummaryExtras(fakeAdmin(db()), { ids: ['anna', 'bruno'], memberships, today: TODAY });
  const anna = summaryExtrasCopy({ language: 'it', extra: extras.get('anna') });
  assert.deepEqual(anna.map(s => s.heading), ['Rate da pagare', 'Documenti da rinnovare', 'Salute', 'Cure degli animali']);
  assert.match(anna[0].rows[0], /^Retta scuola · Retta di novembre: era il 16 nov 2026, 350,00\s€ \(in ritardo\)$/);
  assert.match(anna[0].rows[2], /^Colf · Contributi INPS: 1 dic 2026, importo da definire$/);
  assert.match(anna[1].rows[0], /^Carta d.identità di Luca: scaduto il 20 nov 2026$/);
  assert.match(anna[2].rows[0], /^Nonna: Cardiologo, 2 dic 2026 09:30$/);
  assert.match(anna[2].rows[1], /^Luca: da prenotare .*Esavalente/);
  const bruno = summaryExtrasCopy({ language: 'it', extra: extras.get('bruno') });
  const health = bruno.find(s => s.heading === 'Salute');
  assert.match(health.rows[0], /^Nonna: visita, 2 dic 2026 09:30$/, 'senza dettagli: il tipo, non il nome');
  assert.ok(!JSON.stringify(bruno).includes('Cardiologo'));
  for (const lang of ['en', 'es', 'fr', 'de', 'pt']) {
    const copy = summaryExtrasCopy({ language: lang, extra: extras.get('anna') });
    assert.equal(copy.length, 4);
    const words = copy.flatMap(x => [x.heading, ...x.rows]).join(' | ');
    assert.ok(!/\{|\}|undefined|server\.summary|iddocs\.|health\./.test(words), `${lang} ${words}`);
  }
  const many = { ...extras.get('bruno'), pets: Array.from({ length: 11 }, (_, i) => ({ pet: 'Fido', title: `Cura ${i}`, date: TODAY, late: false })) };
  const pets = summaryExtrasCopy({ language: 'it', extra: many }).find(s => s.heading === 'Cure degli animali');
  assert.equal(pets.rows.length, 9);
  assert.equal(pets.rows.at(-1), 'E altre 3.');
});

test('email e notifica: anche senza bollette, con le sezioni', async () => {
  const extras = await loadSummaryExtras(fakeAdmin(db()), { ids: ['bruno'], memberships, today: TODAY });
  const mail = summaryEmail({ language: 'it', bills: [], today: TODAY, appUrl: 'https://casa.example', userId: 'bruno', extra: extras.get('bruno') });
  assert.equal(mail.subject, 'Casa in Ordine · Riepilogo delle scadenze del mese (2026-11)');
  assert.match(mail.html, /Nessuna bolletta da pagare entro fine mese\./);
  assert.match(mail.html, /<h2[^>]*>Rate da pagare<\/h2>/);
  assert.match(mail.text, /\nCure degli animali\n- Fido: Antiparassitario, 29 nov 2026/);
  const withBills = summaryEmail({ language: 'it', bills: [{ title: 'Luce <b>', supplier: 'Enel', amount: 80, due_date: '2026-11-28' }], today: TODAY, appUrl: 'https://casa.example', userId: 'bruno', extra: extras.get('bruno') });
  assert.match(withBills.subject, /Riepilogo bollette del mese/);
  assert.match(withBills.html, /Luce &lt;b&gt;/);
  assert.match(withBills.html, /Documenti da rinnovare/);
  assert.deepEqual(billSummaryPushCopy({ language: 'it', count: 0, total: 0, extras: 3 }).body, '3 scadenze da guardare: rate, documenti, salute o animali.');
  assert.match(billSummaryPushCopy({ language: 'it', count: 2, total: 120, extras: 1 }).body, /E 1 altra scadenza: rate, documenti, salute o animali\.$/);
  assert.throws(() => billSummaryPushCopy({ language: 'it', count: 0, total: 0 }), /Invalid bill count/);
});

test('riepilogo: parte anche senza bollette se ci sono altre scadenze', async () => {
  const data = { ...db(), home_members: [], bills: [], bill_summaries: [], user_language_preferences: [], push_subscriptions: [] };
  const sent = [];
  const admin = fakeAdmin(data);
  // upsert del riepilogo: il finto restituisce le righe inserite.
  const from = admin.from.bind(admin);
  admin.from = name => {
    const b = from(name);
    b.upsert = rows => { data.bill_summaries.push(...rows.map((r, i) => ({ id: `s${i}`, ...r }))); return { select: () => Promise.resolve({ data: data.bill_summaries, error: null }) }; };
    b.update = () => ({ in: () => Promise.resolve({ error: null }), eq: () => Promise.resolve({ error: null }) });
    return b;
  };
  const counts = { summaries_created: 0, summary_emails_sent: 0, summary_push_sent: 0, errors: [] };
  await processSummaries(admin, [{ id: 'bruno', email: 'bruno@example.org', summary_frequency: 'daily' }], {
    today: TODAY, appUrl: 'x', counts, extras: (a, o) => loadSummaryExtras(a, { ...o, memberships }),
    email: { send: async (to, items, day, lang, url, id, extra) => { sent.push([to, items.length, summaryExtraCount(extra)]); return { sent: true }; } },
  });
  assert.deepEqual(counts.errors, []);
  assert.equal(data.bill_summaries.length, 1);
  assert.equal(data.bill_summaries[0].bill_count, 0);
  assert.deepEqual(sent, [['bruno@example.org', 0, 4]], 'rata, documento, visita, cura di Fido');
});
