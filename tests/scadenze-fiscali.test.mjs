// Scadenze fiscali di famiglia (scelta dell'utente del 26 novembre 2026, mattina): date di ogni anno
// spostate al primo giorno lavorativo, agenda, avvisi, documenti per il 730, migrazione v67.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TAX_GROUPS, TAX_DEADLINES, TAX_DOCS, deadlineDate, normalizeTaxSettings, taxAgenda, taxNotices, taxYearFor, taxChecklist, toggleDone, doneKey, docKey } from '../lib/tax-calendar.mjs';
import { taxAlertCopy, processTaxAlerts } from '../lib/tax-alerts.mjs';
import { TRANSLATIONS, translate } from '../lib/i18n.mjs';
import { BACKUP_TABLES } from '../lib/backup-tables.mjs';
import { RESTORE_ORDER, RESTORE_SKIPPED } from '../lib/backup-restore.mjs';
import { calendarText } from '../lib/calendar.mjs';

const LANGS = ['it', 'en', 'es', 'fr', 'de', 'pt'];
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const by = key => TAX_DEADLINES.find(d => d.key === key);
const TODAY = '2026-11-26';

test('date: le scadenze fiscali di sabato o festivo passano al primo giorno lavorativo', () => {
  assert.equal(deadlineDate(by('redditi'), 2026), '2026-11-02', '31 ottobre 2026 è sabato');
  assert.equal(deadlineDate(by('redditi'), 2027), '2027-11-02', '31 ottobre 2027 è domenica e il 1° novembre è festa');
  assert.equal(deadlineDate(by('cu'), 2025), '2025-03-17', '16 marzo 2025 era domenica');
  assert.equal(deadlineDate(by('imu_balance'), 2028), '2028-12-18', '16 dicembre 2028 è sabato');
  assert.equal(deadlineDate(by('imu_first'), 2027), '2027-06-16');
  assert.equal(deadlineDate(by('730'), 2027), '2027-09-30');
  assert.equal(deadlineDate(by('isee'), 2027), '2027-02-28', 'la DSU per l’Assegno unico non si sposta');
  assert.equal(deadlineDate(by('precompiled'), 2027), '2027-04-30');
});

test('agenda: i gruppi scelti, i prossimi 12 mesi, «fatto»', () => {
  const settings = { groups: ['730', 'imu', 'isee'], remind_days: 14, done: [] };
  assert.deepEqual(taxAgenda(settings, TODAY).map(a => `${a.key}:${a.date}`), [
    'imu_balance:2026-12-16', 'isee:2027-02-28', 'cu:2027-03-16', 'precompiled:2027-04-30', 'imu_first:2027-06-16', 'isee_arrears:2027-06-30', '730:2027-09-30']);
  const done = toggleDone(settings, doneKey('imu_balance', 2026));
  const first = taxAgenda(done, TODAY)[0];
  assert.deepEqual([first.key, first.state, first.done], ['imu_balance', 'done', true], 'fatta: resta in elenco fino alla data');
  assert.equal(taxAgenda(done, '2026-12-17').some(a => a.key === 'imu_balance' && a.year === 2026), false, 'fatta e passata: sparisce');
  assert.equal(taxAgenda(settings, '2026-12-18').find(a => a.key === 'imu_balance' && a.year === 2026).state, 'late', 'non fatta: in ritardo per una settimana');
  assert.deepEqual(taxAgenda({ groups: [] }, TODAY), []);
  assert.deepEqual(taxAgenda({ groups: ['redditi'] }, '2027-06-01').map(a => a.key), ['redditi_payment', 'redditi', 'redditi_second']);
});

test('avvisi: dal preavviso alla data; le «info» il giorno stesso', () => {
  const settings = { groups: ['730', 'imu'], remind_days: 14, done: [] };
  assert.deepEqual(taxNotices(settings, '2026-12-01').map(n => n.key), [], '15 giorni prima: ancora niente');
  assert.deepEqual(taxNotices(settings, '2026-12-02').map(n => [n.key, n.days]), [['imu_balance', 14]]);
  assert.deepEqual(taxNotices(settings, '2027-03-15').map(n => n.key), [], 'CU: non il giorno prima');
  assert.deepEqual(taxNotices(settings, '2027-03-16').map(n => n.key), ['cu']);
  assert.deepEqual(taxNotices(toggleDone(settings, doneKey('imu_balance', 2026)), '2026-12-10'), [], 'fatta: nessun avviso');
});

test('impostazioni: solo valori validi', () => {
  assert.deepEqual(normalizeTaxSettings({ groups: ['imu', 'tasse', '730', 'imu'], remind_days: 500, done: ['730_2027', '<b>', 'doc_cu_2026', 7] }),
    { groups: ['730', 'imu'], remind_days: 14, done: ['730_2027', 'doc_cu_2026'] });
  assert.deepEqual(TAX_GROUPS, ['730', 'redditi', 'imu', 'isee']);
});

test('730: anno d’imposta e documenti con le voci registrate', () => {
  assert.equal(taxYearFor('2026-09-30'), 2025);
  assert.equal(taxYearFor('2026-10-01'), 2026);
  assert.equal(taxYearFor(TODAY), 2026);
  const items = [{ tax_year: 2026, category: 'medical' }, { tax_year: 2026, category: 'medical' }, { tax_year: 2025, category: 'medical' }, { tax_year: 2026, category: 'energy' }];
  const list = taxChecklist({ done: [docKey('cu', 2026)] }, items, 2026);
  assert.equal(list.length, TAX_DOCS.length);
  assert.deepEqual(list.find(c => c.key === 'medical'), { key: 'medical', count: 2, ready: false, counted: true });
  assert.deepEqual(list.find(c => c.key === 'renovation').count, 1, 'risparmio energetico con i lavori');
  assert.deepEqual(list.find(c => c.key === 'cu'), { key: 'cu', count: 0, ready: true, counted: false });
});

test('testi in 6 lingue, avvisi «tax» dal lavoro giornaliero', async () => {
  for (const lang of LANGS) {
    for (const d of TAX_DEADLINES) {
      for (const days of [0, 1, 9]) {
        const c = taxAlertCopy({ key: d.key, year: 2027, date: '2027-06-16', days }, lang);
        assert.ok(!/\{|\}|undefined|taxes\.cal|server\./.test(c.title + c.body), `${lang} ${d.key} ${days}: ${c.title} ${c.body}`);
      }
      assert.ok(TRANSLATIONS[lang][`taxes.cal.hint.${d.key}`], `${lang} hint ${d.key}`);
    }
    for (const g of TAX_GROUPS) assert.ok(TRANSLATIONS[lang][`taxes.cal.group.${g}`], `${lang} ${g}`);
    for (const doc of TAX_DOCS) assert.ok(TRANSLATIONS[lang][`taxes.cal.doc.${doc.key}`], `${lang} ${doc.key}`);
  }
  assert.deepEqual(taxAlertCopy({ key: 'imu_balance', year: 2026, date: '2026-12-16', days: 14 }, 'it'),
    { title: 'Scadenza fiscale: Saldo IMU 2026', body: 'Tra 14 giorni, il 16 dic 2026. Seconda rata dell\'IMU, con l\'eventuale conguaglio.' });
  const tables = { tax_calendar_settings: [{ id: 't1', user_id: 'anna', home_id: null, groups: ['imu'], remind_days: 14, done: [] },
    { id: 't2', user_id: 'bruno', home_id: null, groups: ['730'], remind_days: 14, done: [] }], user_alerts: [], user_alert_preferences: [] };
  const admin = { from(name) { const f = []; const b = { select() { return b; }, order() { return b; }, is(c, v) { f.push(r => (r[c] ?? null) === v); return b; },
    gte(c, v) { f.push(r => r[c] >= v); return b; }, lte(c, v) { f.push(r => r[c] <= v); return b; }, in(c, vs) { f.push(r => vs.includes(r[c])); return b; },
    range(from, to) { return b.then(r => ({ data: r.data.slice(from, to + 1), error: null })); }, eq(c, v) { f.push(r => r[c] === v); return b; },
    upsert(rows) { (tables[name] ||= []).push(...[].concat(rows)); return { select: () => Promise.resolve({ data: [].concat(rows), error: null }) }; },
    then(res, rej) { return Promise.resolve({ data: (tables[name] || []).filter(r => f.every(fn => fn(r))), error: null }).then(res, rej); } }; return b; } };
  const counts = { errors: [] };
  await processTaxAlerts(admin, '2026-12-02', counts);
  assert.deepEqual(counts.errors, []);
  assert.deepEqual(tables.user_alerts.map(a => [a.user_id, a.kind, a.reference_id, a.event_date]), [['anna', 'tax', 't1', '2026-12-16']]);
  assert.match(read('lib/daily-jobs.mjs'), /await processTaxAlerts\(admin,today,counts,/);
  const missing = { from() { const b = { select: () => b, order: () => b, range: () => Promise.resolve({ data: null, error: { code: 'PGRST205' } }) }; return b; } };
  const c2 = { errors: [] };
  await processTaxAlerts(missing, '2026-12-02', c2);
  assert.deepEqual(c2.errors, [], 'senza la tabella (v67 non eseguita) nessun errore');
});

test('calendario, backup, push, migrazione v67', () => {
  const ics = calendarText([], '20261126T000000Z', 'it', [], [], [{ uid: 'tax-t1-imu_balance-2026', date: '2026-12-16', key: 'tax', params: { taxKey: 'imu_balance', year: 2026 } }]);
  assert.match(ics, /SUMMARY:Saldo IMU 2026/);
  assert.match(read('app/api/calendar/[token]/route.js'), /tax_calendar_settings/);
  assert.ok(BACKUP_TABLES.some(t => t.name === 'tax_calendar_settings'));
  assert.ok(RESTORE_ORDER.includes('tax_calendar_settings') && !RESTORE_SKIPPED.tax_calendar_settings, 'si ripristina (se c’è già, resta quella)');
  assert.match(read('lib/push-preferences.mjs'), /tax:'push_taxes'/);
  assert.match(read('app/HomeExtra.jsx'), /\['push_taxes','extra\.alerts\.taxes'\]/);
  const sql = read('supabase/migrate_v67_scadenze_fiscali.sql');
  for (const g of TAX_GROUPS) assert.match(sql, new RegExp(`'${g}'`));
  assert.match(sql, /'installment','tax'\)\);/);
  assert.match(sql, /grant update \(groups, remind_days, done\) on public\.tax_calendar_settings to authenticated;/);
  assert.match(read('scripts/db-tests.sh'), /migrate_v67_scadenze_fiscali\.sql/);
  assert.match(translate('it', 'taxes.cal.source'), /legge 160\/2019/);
});
