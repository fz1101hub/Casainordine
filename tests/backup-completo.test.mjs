import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { BACKUP_MAIN, BACKUP_TABLES, BACKUP_EXCLUDED, collectBackupTables } from '../lib/backup-tables.mjs';
import { safeBackup } from '../lib/home-insights.mjs';
import { TRANSLATIONS } from '../lib/i18n.mjs';

const dir = new URL('../supabase/', import.meta.url);
const sql = readdirSync(dir).filter(f => f.endsWith('.sql')).map(f => readFileSync(new URL(f, dir), 'utf8')).join('\n');
const dbTables = [...new Set([...sql.matchAll(/create table (?:if not exists )?public\.([a-z_]+)/gi)].map(m => m[1]))].sort();

test('ogni tabella del database è nel backup oppure esclusa con un motivo', () => {
  const included = [...BACKUP_MAIN, ...BACKUP_TABLES.map(t => t.name)];
  const excluded = Object.keys(BACKUP_EXCLUDED);
  assert.ok(dbTables.length >= 70, 'tabelle trovate nelle migrazioni');
  const both = included.filter(t => excluded.includes(t));
  assert.deepEqual(both, [], 'nessuna tabella è sia inclusa sia esclusa');
  const unknown = dbTables.filter(t => !included.includes(t) && !excluded.includes(t));
  assert.deepEqual(unknown, [], 'tabelle nuove da aggiungere al backup o a BACKUP_EXCLUDED');
  const stale = [...included, ...excluded].filter(t => !dbTables.includes(t));
  assert.deepEqual(stale, [], 'nessun nome che non esiste più');
  for (const [table, reason] of Object.entries(BACKUP_EXCLUDED)) assert.ok(reason.length > 10, table);
});

test('le sezioni della Fase 2 e quelle rimaste fuori ora ci sono', () => {
  const names = BACKUP_TABLES.map(t => t.name);
  for (const t of ['home_automations', 'home_professionals', 'home_professional_notes', 'home_seasonal_settings', 'home_seasonal_done',
    'home_stock_items', 'home_projects', 'home_project_phases', 'home_project_quotes', 'home_project_expenses', 'home_project_photos',
    'home_replacement_plans', 'home_leases', 'home_lease_reports', 'home_lease_photos', 'pagopa_notices', 'home_inventory_items',
    'home_move_plans', 'home_move_steps', 'home_decisions', 'home_decision_votes', 'home_savings_goals', 'home_vacation_plans', 'home_emergency_cards'])
    assert.ok(names.includes(t), t);
  // Le tabelle collegate vengono dopo la loro tabella madre.
  for (const t of BACKUP_TABLES.filter(x => x.parent && !BACKUP_MAIN.includes(x.parent)))
    assert.ok(names.indexOf(t.parent) < names.indexOf(t.name), `${t.parent} prima di ${t.name}`);
  // Segreti e dati di altre persone restano fuori.
  for (const t of ['home_sos_keys', 'mail_connections', 'integration_keys', 'calendar_feeds', 'home_members', 'home_invites', 'push_subscriptions'])
    assert.ok(BACKUP_EXCLUDED[t], t);
});

// Client finto: registra le richieste e restituisce righe da tabelle in memoria.
function fakeClient(db, { missing = [] } = {}) {
  const calls = [];
  return { calls, from(name) {
    const q = { name, filters: [], order: null };
    const api = {
      select() { return api; },
      eq(col, val) { q.filters.push(r => r[col] === val); q.eq = [col, val]; return api; },
      is(col, val) { q.filters.push(r => (r[col] ?? null) === val); q.is = [col, val]; return api; },
      in(col, vals) { q.filters.push(r => vals.includes(r[col])); q.in = [col, vals.length]; return api; },
      order(col) { q.order = col; return api; },
      async range(a, b) {
        calls.push({ ...q, range: [a, b] });
        if (missing.includes(name)) return { data: null, error: { code: '42P01' } };
        const rows = (db[name] || []).filter(r => q.filters.every(f => f(r)));
        return { data: rows.slice(a, b + 1), error: null };
      },
    };
    return api;
  } };
}

test('lettura: spazio, impostazioni personali, tabelle collegate, percorsi dei file tolti', async () => {
  const db = {
    home_projects: [{ id: 'p1', home_id: 'h1' }, { id: 'p2', home_id: 'h2' }],
    home_project_phases: [{ id: 'f1', project_id: 'p1' }, { id: 'f2', project_id: 'p2' }],
    home_leases: [{ id: 'l1', home_id: 'h1' }],
    home_lease_reports: [{ id: 'r1', lease_id: 'l1' }],
    home_lease_photos: [{ id: 'x1', report_id: 'r1', storage_path: 'l1/segreto.jpg', room: 'Cucina' }],
    home_replacement_plans: [{ asset_id: 'a1', cost: 900 }, { asset_id: 'a9', cost: 1 }],
    user_suppliers: [{ id: 's1', user_id: 'u1' }, { id: 's2', user_id: 'u2' }],
  };
  const client = fakeClient(db);
  const { tables, missing } = await collectBackupTables(client, { homeId: 'h1', userId: 'u1', known: { maintenance_assets: [{ id: 'a1' }] } });
  assert.deepEqual(missing, []);
  assert.deepEqual(tables.home_projects.map(r => r.id), ['p1']);
  assert.deepEqual(tables.home_project_phases.map(r => r.id), ['f1']);
  assert.deepEqual(tables.home_lease_photos, [{ id: 'x1', report_id: 'r1', room: 'Cucina' }]);
  assert.deepEqual(tables.home_replacement_plans.map(r => r.asset_id), ['a1']);
  assert.deepEqual(tables.user_suppliers.map(r => r.id), ['s1']);
  assert.ok(client.calls.find(c => c.name === 'home_projects').eq[0] === 'home_id');
  assert.ok(client.calls.find(c => c.name === 'home_replacement_plans').order === 'asset_id');
  // Una tabella collegata senza righe madri non fa richieste.
  assert.equal(client.calls.filter(c => c.name === 'home_decision_votes').length, 0);
});

test('spazio personale: righe senza casa e contratti in cui si è inquilini', async () => {
  const db = { home_leases: [{ id: 'mio', home_id: null, user_id: 'u1' }, { id: 'affitto', home_id: 'hX', tenant_id: 'u1' }, { id: 'altro', home_id: 'hX', tenant_id: 'u2' }] };
  const { tables } = await collectBackupTables(fakeClient(db), { homeId: null, userId: 'u1' });
  assert.deepEqual(tables.home_leases.map(r => r.id).sort(), ['affitto', 'mio']);
});

test('pagine da 500, limite di righe e tabelle che mancano', async () => {
  const many = Array.from({ length: 1200 }, (_, i) => ({ id: String(i).padStart(5, '0'), home_id: 'h1' }));
  const client = fakeClient({ house_tasks: many }, { missing: ['home_stock_items'] });
  const { tables, missing } = await collectBackupTables(client, { homeId: 'h1', userId: 'u1' });
  assert.equal(tables.house_tasks.length, 1200);
  assert.equal(client.calls.filter(c => c.name === 'house_tasks').length, 3);
  assert.deepEqual(missing, ['home_stock_items']);
  await assert.rejects(collectBackupTables(fakeClient({ house_tasks: many }), { homeId: 'h1', userId: 'u1' }, { maxRows: 1000 }),
    e => e.i18nKey === 'extra.backup.tooManyRows' && e.params.table === 'house_tasks');
  await assert.rejects(collectBackupTables({ from: () => ({ select() { return this; }, eq() { return this; }, is() { return this; }, order() { return this; }, range: async () => ({ error: { code: '42501', message: 'permesso negato' } }) }) }, { homeId: 'h1', userId: 'u1' }),
    e => e.code === '42501');
});

test('file di backup: versione 2, senza percorsi privati, nota su ciò che manca', () => {
  const out = safeBackup({ documents: [{ id: 'd', name: 'a', storage_path: 'u/segreto' }] });
  assert.equal(out.version, 2);
  assert.equal('storage_path' in out.documents[0], false);
  const page = readFileSync(new URL('../app/HomeExtra.jsx', import.meta.url), 'utf8');
  assert.match(page, /collectBackupTables\(client,\{homeId:homeId\|\|null,userId:user\?\.id,known:\{maintenance_assets:rows\.assets\}\}\)/);
  assert.match(page, /bundle\.not_included=tr\('extra\.backup\.notIncluded'\)/);
  for (const [lang, dict] of Object.entries(TRANSLATIONS)) assert.ok((dict['extra.backup.notIncluded'] || '').length > 60, lang);
});
