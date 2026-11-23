// Fase 2 · 3.3 — profilo locatore/inquilino: contratto, verbali d'ingresso e d'uscita, foto e letture,
// accesso separato per ruolo senza esporre i dati privati dell'altra parte.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LEASE_STATUSES, REPORT_KINDS, ROOM_STATES, normalizeLease, normalizeRooms, normalizeReadings, reportState, compareReports, leasePhotoPath } from '../lib/rental.mjs';
import { MESSAGE_KEYS } from '../lib/i18n.mjs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('Contratto: nome, email in minuscolo, date e importi', () => {
  assert.deepEqual(normalizeLease({ property_label: ' Bilocale  via Roma ', tenant_email: ' Inquilina@Esempio.IT ', start_on: '2027-01-01', end_on: '', rent: '800', deposit: '1600,00', notes: ' ok ' }).value,
    { property_id: null, property_label: 'Bilocale via Roma', property_address: '', tenant_email: 'inquilina@esempio.it', start_on: '2027-01-01', end_on: null, rent: 800, deposit: 1600, notes: 'ok' });
  for (const [input, error] of [
    [{ property_label: 'B' }, 'rental.error.label'],
    [{ property_label: 'Bilocale', tenant_email: 'non-una-email' }, 'rental.error.email'],
    [{ property_label: 'Bilocale', tenant_email: 'a@b.it' }, 'rental.error.start'],
    [{ property_label: 'Bilocale', tenant_email: 'a@b.it', start_on: '2027-01-01', end_on: '2026-01-01' }, 'rental.error.dates'],
    [{ property_label: 'Bilocale', tenant_email: 'a@b.it', start_on: '2027-01-01', rent: -5 }, 'rental.error.amount'],
  ]) assert.equal(normalizeLease(input).error, error, JSON.stringify(input));
});

test('Verbale: stanze e letture ripulite, stato delle firme', () => {
  assert.deepEqual(normalizeRooms([{ room: ' Cucina ', state: 'worn', notes: ' graffio ' }, { room: '', state: 'good' }, { room: 'Bagno', state: 'rotto' }]),
    [{ room: 'Cucina', state: 'worn', notes: 'graffio' }, { room: 'Bagno', state: 'good', notes: '' }]);
  assert.equal(normalizeRooms(Array.from({ length: 50 }, (_, i) => ({ room: 'Stanza ' + i }))).length, 40);
  assert.deepEqual(normalizeReadings([{ meter: 'Luce', value: '1234,5', unit: 'kWh' }, { meter: 'Gas', value: '' }, { meter: '', value: 3 }, { meter: 'Acqua', value: -1 }]),
    [{ meter: 'Luce', value: 1234.5, unit: 'kWh' }]);
  assert.equal(reportState({}), 'draft');
  assert.equal(reportState({ landlord_signed_at: 'x' }), 'landlord');
  assert.equal(reportState({ tenant_signed_at: 'x' }), 'tenant');
  assert.equal(reportState({ landlord_signed_at: 'x', tenant_signed_at: 'y' }), 'locked');
});

test('Confronto ingresso → uscita: stanze peggiorate e consumi', () => {
  const checkIn = { rooms: [{ room: 'Cucina', state: 'good' }, { room: 'Camera', state: 'worn' }, { room: 'Bagno', state: 'good' }], readings: [{ meter: 'Luce', value: 1000, unit: 'kWh' }, { meter: 'Gas', value: 50, unit: 'Smc' }] };
  const checkOut = { rooms: [{ room: 'cucina', state: 'damaged' }, { room: 'Camera', state: 'good' }, { room: 'Bagno', state: 'good' }], readings: [{ meter: 'Luce', value: 2850.5, unit: 'kWh' }, { meter: 'Acqua', value: 3 }] };
  assert.deepEqual(compareReports(checkIn, checkOut), { worse: [{ room: 'cucina', from: 'good', to: 'damaged' }], usage: [{ meter: 'Luce', unit: 'kWh', used: 1850.5 }] });
});

test('Foto nella cartella del contratto, solo immagini', () => {
  const lease = '90000000-0000-0000-0000-000000000001';
  assert.match(leasePhotoPath(lease, 'image/png', 'b0000000-0000-0000-0000-000000000001'), /^90000000-0000-0000-0000-000000000001\/b0000000-0000-0000-0000-000000000001\.png$/);
  assert.equal(leasePhotoPath(lease, 'application/pdf'), '');
  // Lo stesso formato che accetta il database.
  const sql = read('supabase/migrate_v49_affitti.sql');
  assert.match(sql, /storage_path ~ '\^\[0-9a-f-\]\{36\}\/\[0-9a-f-\]\{36\}\\\.\(jpg\|png\|webp\)\$'/);
});

test('Migrazione v49: ruoli separati, inviti per email, firme, foto private', () => {
  const sql = read('supabase/migrate_v49_affitti.sql');
  assert.match(sql, new RegExp(`status in \\(${LEASE_STATUSES.map(s => `'${s}'`).join(',')}\\)`));
  assert.match(sql, new RegExp(`kind in \\(${REPORT_KINDS.map(s => `'${s}'`).join(',')}\\)`));
  // Inquilino: legge solo contratto, verbali e foto; scrive solo a contratto attivo.
  assert.match(sql, /or \(l\.tenant_id = \(select auth\.uid\(\)\) and \(not write or l\.status = 'active'\)\)/);
  assert.match(sql, /tenant_id is null and status = 'invited' and tenant_email = lower\(coalesce\(\(select auth\.jwt\(\)\) ->> 'email', ''\)\)/);
  assert.match(sql, /with check \(user_id = \(select auth\.uid\(\)\) and public\.v19_can_edit\(user_id, home_id\) and tenant_id is null and status = 'invited'\)/);
  assert.doesNotMatch(sql.match(/grant update \(property_label[^)]*\) on public\.home_leases/)[0], /tenant_id|user_id|home_id/);
  assert.match(sql, /grant update \(report_date, rooms, readings, notes\) on public\.home_lease_reports to authenticated;/, 'le firme passano solo da v49_sign_report');
  assert.match(sql, /new\.landlord_signed_at := null; new\.tenant_signed_at := null;/);
  assert.match(sql, /raise exception 'Verbale firmato da entrambi: non si modifica'/);
  assert.match(sql, /values \('lease-files', 'lease-files', false, 10485760/);
  assert.match(sql, /bucket_id = 'lease-files' and public\.v49_lease_can\(public\.v49_lease_from_path\(name\), false\)/);
  assert.match(read('README.md'), /migrate_v49_affitti\.sql/);
});

test('Interfaccia: invito accettato dall’inquilino, firma dal database, niente dati dell’altro spazio', () => {
  const ui = read('app/Rental.jsx');
  assert.match(ui, /client\.rpc\('v49_accept_lease', \{ target: invite\.id \}\)/);
  assert.match(ui, /client\.rpc\('v49_sign_report', \{ target: report\.id \}\)/);
  // L'inquilino non legge immobili: solo nome e indirizzo copiati nel contratto.
  assert.doesNotMatch(ui.slice(ui.indexOf('function reportBlock')), /home_properties/);
  assert.match(read('app/page.jsx'), /\{id:'rental',icon:KeyRound\}/);
  for (const key of [...LEASE_STATUSES.map(s => 'rental.status.' + s), ...REPORT_KINDS.map(k => 'rental.report.' + k), ...ROOM_STATES.map(s => 'rental.state.' + s),
    'nav.rental', 'rental.privacy', 'rental.inviteHelp', 'rental.signConfirm', 'rental.compareHint', 'rental.migration'])
    assert.ok(MESSAGE_KEYS.includes(key), key);
});
