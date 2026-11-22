// Fase 2 · 3.3 — professionisti di fiducia: contatti, mestiere, note condivise e private, interventi e costi.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TRADES, normalizeProfessional, telHref, mailHref, professionalStats } from '../lib/professionals.mjs';
import { SEARCH_SOURCES } from '../lib/search.mjs';
import { MESSAGE_KEYS } from '../lib/i18n.mjs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('Controllo del professionista: nome, mestiere noto o scritto a mano, contatti validi', () => {
  assert.deepEqual(normalizeProfessional({ name: '  Mario  Rossi ', trade: 'plumber', phone: '+39 333 123 4567', email: ' Mario@Esempio.IT ', notes: ' Ha la chiave della cantina ' }).value,
    { name: 'Mario Rossi', trade: 'plumber', phone: '+39 333 123 4567', email: 'mario@esempio.it', notes: 'Ha la chiave della cantina' });
  assert.equal(normalizeProfessional({ name: 'Luca', trade: 'other', customTrade: 'Spazzacamino' }).value.trade, 'Spazzacamino');
  assert.equal(normalizeProfessional({ name: 'Luca', trade: 'Vetraio' }).value.trade, 'Vetraio');
  for (const [input, error] of [
    [{ name: 'L', trade: 'plumber' }, 'professional.error.name'],
    [{ name: 'Luca', trade: 'x' }, 'professional.error.trade'],
    [{ name: 'Luca', trade: 'plumber', phone: '12' }, 'professional.error.phone'],
    [{ name: 'Luca', trade: 'plumber', phone: 'chiamare' }, 'professional.error.phone'],
    [{ name: 'Luca', trade: 'plumber', email: 'luca@' }, 'professional.error.email'],
    [{ name: 'Luca', trade: 'plumber', email: 'luca <x@y.it>' }, 'professional.error.email'],
  ]) assert.equal(normalizeProfessional(input).error, error, JSON.stringify(input));
  assert.equal(normalizeProfessional({ name: 'Luca', trade: 'plumber', notes: 'x'.repeat(2000) }).value.notes.length, 1500);
});

test('Chiamare e scrivere: collegamenti solo con contatti validi', () => {
  assert.equal(telHref('+39 (06) 123-4567'), 'tel:+39061234567');
  assert.equal(telHref('123'), '');
  assert.equal(mailHref('idraulico@esempio.it'), 'mailto:idraulico@esempio.it');
  assert.equal(mailHref('javascript:alert(1)'), '');
  assert.equal(mailHref('a@b.it?subject=x'), '', 'nessun parametro aggiunto al collegamento');
});

test('Interventi e spesa di un professionista', () => {
  const events = [
    { id: 'e1', professional_id: 'p1', done_on: '2026-03-10', cost: 120 },
    { id: 'e2', professional_id: 'p1', done_on: '2026-10-02', cost: '80.5' },
    { id: 'e3', professional_id: 'p2', done_on: '2026-11-01', cost: 999 },
    { id: 'e4', professional_id: null, done_on: '2026-11-02', cost: 10 },
  ];
  const stats = professionalStats(events, 'p1');
  assert.equal(stats.count, 2); assert.equal(stats.total, 200.5); assert.equal(stats.last, '2026-10-02');
  assert.deepEqual(stats.events.map(e => e.id), ['e2', 'e1']);
  assert.deepEqual(professionalStats(events, 'nessuno'), { count: 0, total: 0, last: '', events: [] });
});

test('Migrazione v44: accesso per casa, nota privata solo di chi la scrive, interventi dello stesso spazio', () => {
  const sql = read('supabase/migrate_v44_professionisti.sql');
  assert.match(sql, /create policy v44_professionals_read on public\.home_professionals for select to authenticated\n using \(public\.v19_can_read\(user_id, home_id\)\);/);
  assert.match(sql, /with check \(user_id = \(select auth\.uid\(\)\) and public\.v19_can_edit\(user_id, home_id\)\)/);
  assert.match(sql, /grant update \(name, trade, phone, email, notes\) on public\.home_professionals to authenticated;/);
  assert.match(sql, /using \(user_id = \(select auth\.uid\(\)\) and public\.v44_can_see_professional\(professional_id\)\)/);
  assert.match(sql, /references public\.home_professionals\(id\) on delete set null/);
  assert.match(sql, /before insert or update of professional_id on public\.maintenance_events/);
  assert.match(sql, /raise exception 'Professionista non appartenente allo spazio'/);
  assert.match(sql, /^begin;$/m); assert.match(sql, /^commit;$/m);
  assert.match(read('README.md'), /migrate_v44_professionisti\.sql/);
});

test('Collegamenti: menu, sezione, registro delle manutenzioni senza la colonna se non serve, ricerca', () => {
  const page = read('app/page.jsx');
  assert.match(page, /\{id:'professionals',icon:HardHat\}/);
  assert.match(page, /const Professionals=lazy\(\(\)=>import\('\.\/Professionals'\)\);/);
  const extra = read('app/HomeExtra.jsx');
  // Senza un professionista scelto la colonna non si invia: il registro funziona anche senza la migrazione v44.
  assert.match(extra, /\.\.\.\(professional_id\?\{professional_id\}:\{\}\)/);
  assert.match(extra, /setProfessionals\(error\?\[\]:data\|\|\[\]\)/);
  assert.ok(SEARCH_SOURCES.some(source => source.table === 'home_professionals' && source.tab === 'professionals'));
  const ui = read('app/Professionals.jsx');
  assert.match(ui, /upsert\(\{ professional_id: person\.id, note: text \}, \{ onConflict: 'professional_id,user_id' \}\)/);
  assert.match(ui, /useSection\('professional'\)/);
});

test('Testi dei professionisti nelle 6 lingue', () => {
  for (const trade of [...TRADES, 'other']) assert.ok(MESSAGE_KEYS.includes('professional.trade.' + trade), trade);
  for (const key of ['nav.professionals', 'professional.help', 'professional.stats', 'professional.statsOne', 'professional.privateNote', 'professional.migration',
    'professional.error.phone', 'extra.maint.professional', 'extra.maint.noProfessional', 'extra.maint.by'])
    assert.ok(MESSAGE_KEYS.includes(key), key);
});
