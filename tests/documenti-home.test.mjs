// Documenti di famiglia in scadenza, riquadri nuovi della Home e ricerca nelle sezioni nuove
// (scelte dell'utente del 26 novembre 2026, notte).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DOC_KINDS, DOC_NOTICE, normalizeDocument, documentState, documentAgenda, documentNotices, holderSuggestions } from '../lib/family-documents.mjs';
import { documentAlertCopy, processDocumentAlerts } from '../lib/document-alerts.mjs';
import { HOME_WIDGETS, normalizeHomePreferences, toggleHomeWidget } from '../lib/home-preferences.mjs';
import { BACKUP_TABLES } from '../lib/backup-tables.mjs';
import { RESTORE_ORDER } from '../lib/backup-restore.mjs';
import { SEARCH_SOURCES } from '../lib/search.mjs';
import { MENU_GROUPS } from '../lib/menu-groups.mjs';
import { TRANSLATIONS } from '../lib/i18n.mjs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const sql = read('supabase/migrate_v63_documenti_home.sql');
// Tipi e riquadri aggiunti dopo (v65: certificato medico sportivo, riquadro delle rate).
const sql65 = read('supabase/migrate_v65_scadenze_prevenzione.sql');
// L'elenco dei riquadri accettati è nell'ultima migrazione che lo cambia.
const sqlWidgets = read('supabase/migrate_v66_uscite_home.sql');
const LANGS = ['it', 'en', 'es', 'fr', 'de', 'pt'];
const TODAY = '2026-11-26';

test('documento controllato: chi, tipo, scadenza (o nessuna), preavviso di partenza per tipo', () => {
  assert.equal(normalizeDocument({ holder: '  ' }).error, 'iddocs.error.holder');
  assert.equal(normalizeDocument({ holder: 'Luca', expires_on: '2027-02-30' }).error, 'iddocs.error.date');
  assert.equal(normalizeDocument({ holder: 'Luca', expires_on: '2027-05-12', notice_days: 3 }).error, 'iddocs.error.notice');
  const { value } = normalizeDocument({ holder: ' Luca ', kind: 'passport', expires_on: '2027-05-12' });
  assert.deepEqual([value.holder, value.kind, value.expires_on, value.notice_days], ['Luca', 'passport', '2027-05-12', 180]);
  assert.equal(normalizeDocument({ holder: 'Gino', kind: 'identity_card', expires_on: '2030-01-01', no_expiry: true }).value.expires_on, null);
  assert.equal(normalizeDocument({ holder: 'Gino', kind: 'boh' }).value.kind, 'other');
  for (const kind of DOC_KINDS) { assert.match(sql65, new RegExp(`'${kind}'`)); assert.ok(DOC_NOTICE[kind] >= 7 && DOC_NOTICE[kind] <= 365); }
  assert.equal(DOC_NOTICE.residence_permit > 60, true, 'il permesso si rinnova almeno 60 giorni prima: l’avviso arriva prima');
});

test('stato e ordine: scaduti, da rinnovare, validi, senza scadenza', () => {
  const docs = [
    { id: 'ok', holder: 'Anna', kind: 'passport', expires_on: '2030-01-01', notice_days: 180 },
    { id: 'none', holder: 'Gino', kind: 'identity_card', expires_on: null, notice_days: 120 },
    { id: 'renew', holder: 'Luca', kind: 'identity_card', expires_on: '2027-02-01', notice_days: 120 },
    { id: 'expired', holder: 'Mia', kind: 'driving_license', expires_on: '2026-11-20', notice_days: 120 },
  ];
  assert.deepEqual(documentState(docs[2], TODAY), { state: 'renew', days: 67 });
  assert.deepEqual(documentState(docs[3], TODAY), { state: 'expired', days: -6 });
  assert.deepEqual(documentAgenda(docs, TODAY).map(a => a.doc.id), ['expired', 'renew', 'ok', 'none']);
  assert.deepEqual(holderSuggestions(docs, [{ name: 'Luca' }, { name: 'Zoe' }]), ['Anna', 'Gino', 'Luca', 'Mia', 'Zoe']);
});

test('avvisi: quando comincia il preavviso (data: la scadenza) e il giorno dopo la scadenza, per un mese', () => {
  const doc = { id: 'd1', user_id: 'anna', home_id: null, holder: 'Luca', kind: 'passport', label: '', expires_on: '2027-05-12', notice_days: 180 };
  assert.deepEqual(documentNotices([doc], '2026-11-12'), [], 'un giorno prima del preavviso: niente');
  assert.deepEqual(documentNotices([doc], '2026-11-13').map(n => [n.type, n.event_date, n.days]), [['renew', '2027-05-12', 180]]);
  assert.deepEqual(documentNotices([doc], '2027-05-13').map(n => [n.type, n.event_date]), [['expired', '2027-05-13']]);
  assert.deepEqual(documentNotices([doc], '2027-06-11').map(n => n.type), ['expired']);
  assert.deepEqual(documentNotices([doc], '2027-06-12'), [], 'dopo un mese basta');
  assert.deepEqual(documentNotices([{ ...doc, expires_on: null }], TODAY), []);
  const it = documentAlertCopy({ holder: 'Luca', kind: 'passport', expires_on: '2027-05-12', days: 180, type: 'renew' }, 'it');
  assert.equal(it.title, 'Passaporto di Luca da rinnovare');
  assert.match(it.body, /^Scade il 12 mag 2027, tra 180 giorni/);
  assert.equal(documentAlertCopy({ holder: 'Luca', kind: 'driving_license', label: 'Patente B', expires_on: '2026-11-20', type: 'expired' }, 'it').title, 'Patente B di Luca scaduto');
  for (const lang of LANGS) for (const type of ['renew', 'expired']) for (const days of [1, 30]) {
    const c = documentAlertCopy({ holder: 'Luca', kind: 'identity_card', expires_on: '2027-05-12', days, type }, lang);
    assert.ok(!/\{|undefined|iddocs\./.test(c.title + c.body), `${lang} ${type} ${days}: ${c.title} ${c.body}`);
  }
  assert.throws(() => documentAlertCopy({ holder: '', expires_on: '2027-05-12' }));
});

function fakeAdmin(tables) {
  return {
    from(name) {
      const filters = []; let upsert = null;
      const builder = {
        select() {
          if (!upsert) return builder;
          const list = (tables[name] ||= []), keys = upsert.options.onConflict.split(','), added = [];
          for (const row of [].concat(upsert.rows)) { if (list.some(r => keys.every(k => String(r[k]) === String(row[k])))) continue; list.push(row); added.push(row); }
          return Promise.resolve({ data: added, error: null });
        },
        order() { return builder; },
        range(from, to) { return builder.then(r => ({ data: r.data ? r.data.slice(from, to + 1) : null, error: r.error })); },
        eq(c, v) { filters.push(r => r[c] === v); return builder; }, in(c, vs) { filters.push(r => vs.includes(r[c])); return builder; },
        gte(c, v) { filters.push(r => r[c] !== null && r[c] >= v); return builder; }, lte(c, v) { filters.push(r => r[c] !== null && r[c] <= v); return builder; },
        is(c, v) { filters.push(r => (r[c] ?? null) === v); return builder; },
        upsert(rows, options) { upsert = { rows, options }; return builder; },
        then(resolve, reject) { return Promise.resolve({ data: (tables[name] || []).filter(r => filters.every(f => f(r))), error: null }).then(resolve, reject); },
      };
      return builder;
    },
  };
}

test('lavoro giornaliero: un avviso «document» per documento e data, una volta sola', async () => {
  const tables = { family_documents: [
    { id: 'd1', user_id: 'anna', home_id: null, holder: 'Luca', kind: 'passport', label: '', expires_on: '2027-05-12', notice_days: 180 },
    { id: 'd2', user_id: 'anna', home_id: null, holder: 'Gino', kind: 'identity_card', label: '', expires_on: '2031-01-01', notice_days: 120 },
  ], user_alerts: [], user_alert_preferences: [] };
  const counts = { errors: [] };
  await processDocumentAlerts(fakeAdmin(tables), '2026-11-26', counts);
  assert.deepEqual(counts.errors, []);
  assert.deepEqual(tables.user_alerts.map(a => [a.user_id, a.kind, a.reference_id, a.event_date, a.title]), [['anna', 'document', 'd1', '2027-05-12', 'Passaporto di Luca da rinnovare']]);
  await processDocumentAlerts(fakeAdmin(tables), '2026-11-27', { errors: [] });
  assert.equal(tables.user_alerts.length, 1, 'il giorno dopo non ripete');
  assert.match(read('lib/daily-jobs.mjs'), /await processDocumentAlerts\(admin,today,counts,/);
  assert.match(read('lib/push-preferences.mjs'), /document:'push_documents'/);
  assert.match(sql, /'health','document'\)\)/);
});

test('Home: cinque riquadri nuovi, spenti di partenza, accettati dal database', () => {
  const ids = HOME_WIDGETS.map(w => w.id);
  assert.deepEqual(ids, ['bills', 'shopping', 'tasks', 'five_minutes', 'medicines', 'health', 'pets', 'garden', 'documents', 'installments', 'spending']);
  assert.deepEqual(normalizeHomePreferences(null).widgets, ['bills', 'shopping', 'tasks', 'five_minutes']);
  assert.deepEqual(toggleHomeWidget(null, 'medicines').widgets.slice(-1), ['medicines']);
  assert.match(sqlWidgets, new RegExp(`array\\[${ids.map(i => `'${i}'`).join(',')}\\]`));
  assert.match(sqlWidgets, /cardinality\(widget_order\) between 1 and 11/);
  for (const lang of LANGS) for (const id of ids.slice(4)) assert.ok(TRANSLATIONS[lang]['home.widget.' + id] && TRANSLATIONS[lang]['home.widget.' + id + '.empty'], `${lang} ${id}`);
});

test('backup, menu e ricerca conoscono i documenti di famiglia', () => {
  assert.ok(BACKUP_TABLES.some(t => t.name === 'family_documents' && !t.parent));
  assert.ok(RESTORE_ORDER.includes('family_documents'));
  assert.ok(MENU_GROUPS.find(g => g.id === 'family').items.includes('iddocs'));
  for (const tab of ['health', 'pets', 'garden', 'taxes', 'projects', 'iddocs']) assert.ok(SEARCH_SOURCES.some(s => s.tab === tab), tab);
  for (const s of SEARCH_SOURCES.filter(x => x.parent)) assert.ok(SEARCH_SOURCES.some(p => p.table === s.parent.table), `${s.table} cerca tra ${s.parent.table}`);
});

test('ricerca: «passaporto» trova i passaporti anche se il tipo è salvato come codice', async () => {
  const { searchQuery, rowMatches } = await import('../lib/search.mjs');
  const source = SEARCH_SOURCES.find(s => s.type === 'iddocs');
  const steps = [];
  const builder = { select() { return builder; }, eq() { return builder; }, is() { return builder; }, or(f) { steps.push(f); return builder; }, order() { return builder; }, limit() { return Promise.resolve({ data: [] }); } };
  const categories = { Luce: 'Luce', iddocs: { Passaporto: 'passport', "Carta d'identità": 'identity_card' } };
  await searchQuery({ from: () => builder }, source, { words: ['passap'], userId: 'u1', categories });
  assert.match(steps[0], /kind\.eq\."passport"/);
  assert.doesNotMatch(steps[0], /category\.eq/);
  assert.ok(rowMatches({ holder: 'Luca', label: '', notes: '', kind: 'passport' }, source, ['passap'], categories));
  assert.ok(!rowMatches({ holder: 'Luca', label: '', notes: '', kind: 'driving_license' }, source, ['passap'], categories));
});
