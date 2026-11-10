import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as vault from '../lib/sos-vault.mjs';
import { LANGUAGES, translate } from '../lib/i18n.mjs';
const source = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const sql = source('supabase/migrate_v40_sos_cifrate.sql').replace(/--[^\n]*/g, '');
function memoryStorage() {
  const m = new Map();
  return { get length() { return m.size; }, key: i => [...m.keys()][i] ?? null, getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) };
}
const HOME = '11111111-1111-4111-8111-111111111111', USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

test('la pagina offline usa lo stesso codice di cifratura dell app', () => {
  assert.equal(source('public/sos-vault.js'), source('lib/sos-vault.mjs'));
  assert.match(source('public/sw.js'), /'\/sos-vault\.js'/);
  assert.match(source('public/offline.html'), /import\{listOfflineCopies,openOfflineCopy\}from'\/sos-vault\.js'/);
});

test('frase giusta, frase sbagliata, scheda spostata in un altra casa', async () => {
  const scope = vault.scopeOf(HOME, USER), salt = vault.newSalt();
  assert.equal(scope, `casa:${HOME}`); assert.equal(vault.scopeOf(null, USER), `personale:${USER}`);
  const key = await vault.deriveKey('rubinetto in cantina', salt);
  const verifier = await vault.makeVerifier(key, scope);
  const card = { title: 'Acqua', location_hint: 'Cantina', instructions: 'Valvola rossa', contact_label: 'Idraulico', contact_phone: '+39 333', extra: 'non salvato' };
  const sealed = await vault.sealCard(card, key, scope);
  assert.deepEqual(await vault.openCard(sealed, key, scope), { title: 'Acqua', location_hint: 'Cantina', instructions: 'Valvola rossa', contact_label: 'Idraulico', contact_phone: '+39 333' });
  assert.equal(await vault.phraseMatches(verifier, key, scope), true);
  assert.equal(await vault.phraseMatches(verifier, await vault.deriveKey('frase sbagliata!', salt), scope), false);
  assert.equal(await vault.phraseMatches(verifier, key, vault.scopeOf('22222222-2222-4222-8222-222222222222', USER)), false);
  await assert.rejects(vault.openCard(sealed, key, `casa:altra`));
  assert.doesNotMatch(JSON.stringify(sealed), /Acqua|Cantina|Idraulico/);
  // Formati controllati dal database (v40_sos_sealed e home_sos_keys).
  assert.match(salt, /^[A-Za-z0-9+/]{22}==$/);
  assert.match(sealed.iv, /^[A-Za-z0-9+/]{16}$/); assert.match(sealed.data, /^[A-Za-z0-9+/=]+$/); assert.equal(sealed.v, 1);
  assert.ok(verifier.data.length >= 20 && verifier.data.length <= 200);
  const long = await vault.sealCard({ title: 'x'.repeat(500), location_hint: 'è'.repeat(600), instructions: 'ü'.repeat(3000), contact_label: 'c'.repeat(200), contact_phone: '9'.repeat(200) }, key, scope);
  assert.ok(long.data.length <= 12000, `scheda più lunga del massimo: ${long.data.length}`);
});

test('la frase va confermata e ha almeno 10 caratteri', () => {
  assert.equal(vault.phraseProblem('corta', 'corta'), 'short');
  assert.equal(vault.phraseProblem('abbastanza lunga', 'abbastanza lungA'), 'mismatch');
  assert.equal(vault.phraseProblem('abbastanza lunga', 'abbastanza lunga'), null);
  assert.equal(vault.phraseProblem('abbastanza lunga'), null);
});

test('una copia offline per casa e per account', async () => {
  const storage = memoryStorage(), salt = vault.newSalt();
  for (const [home, label] of [[HOME, 'Casa al mare'], [null, 'Spazio personale']]) {
    const scope = vault.scopeOf(home, USER), key = await vault.deriveKey('frase della casa', salt);
    const copy = vault.buildOfflineCopy({ label, scope, salt, verifier: await vault.makeVerifier(key, scope), cards: [await vault.sealCard({ title: label }, key, scope)] });
    vault.saveOfflineCopy(storage, USER, copy);
  }
  storage.setItem(vault.offlineKey('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'casa:x'), JSON.stringify({ v: 2, label: 'Altro account', cards: [] }));
  assert.equal(vault.listOfflineCopies(storage, USER).length, 2, 'solo le copie di questo account');
  assert.equal(vault.listOfflineCopies(storage, null).length, 3, 'senza accesso tutte quelle del telefono');
  assert.ok(vault.hasOfflineCopy(storage, USER, vault.scopeOf(HOME, USER)));
  const copy = vault.listOfflineCopies(storage, USER).find(c => c.label === 'Casa al mare');
  assert.deepEqual((await vault.openOfflineCopy(copy, 'frase della casa')).map(c => c.title), ['Casa al mare']);
  assert.equal(await vault.openOfflineCopy(copy, 'frase sbagliata'), null);
  vault.removeOfflineCopy(storage, USER, vault.scopeOf(HOME, USER));
  assert.equal(vault.hasOfflineCopy(storage, USER, vault.scopeOf(HOME, USER)), false);
});

test('v40: frase della casa, schede cifrate e regole di accesso', () => {
  assert.match(sql, /^begin;/m); assert.match(sql, /^commit;/m);
  assert.match(sql, /create table if not exists public\.home_sos_keys/);
  assert.match(sql, /alter table public\.home_sos_keys enable row level security;/);
  assert.match(sql, /grant insert \(home_id, user_id, salt, verifier\) on public\.home_sos_keys to authenticated;/);
  assert.match(sql, /grant update \(salt, verifier\) on public\.home_sos_keys to authenticated;/);
  assert.doesNotMatch(sql, /grant usage on schema private/);
  // Le scritture del browser passano dalle regole di chi chiama.
  for (const fn of ['v40_set_sos_key', 'v40_reset_sos']) {
    const body = sql.split(`create or replace function public.${fn}`)[1].split('$$;')[0];
    assert.match(body, /security invoker/); assert.match(body, /can_edit_home\(scope_home\)/);
  }
  // Stessa chiave di blocco nel controllo e nelle funzioni, senza schema private.
  const locks = sql.match(/pg_advisory_xact_lock\(hashtextextended\('casa-sos:'\|\|coalesce\([a-z_.]+::text,'personale:'\|\|[a-z_.]+::text\),0\)\)/g) || [];
  assert.equal(locks.length, 3);
  assert.match(sql, /create trigger v40_sos_sealed_guard before insert or update on public\.home_emergency_cards/);
  assert.match(sql, /function private\.v40_sos_sealed_guard\(\)/);
  assert.match(sql, /title='' and location_hint='' and instructions='' and contact_label='' and contact_phone=''/);
  // PostgreSQL non accetta ripetizioni oltre 255 nelle espressioni regolari.
  for (const [, n] of sql.matchAll(/\{\d+,(\d+)\}/g)) assert.ok(Number(n) <= 255, `ripetizione ${n}`);
});

test('la sezione SOS cifra prima di salvare e tiene una copia offline per casa', () => {
  const hub = source('app/V21Hub.jsx');
  assert.match(hub, /payload=await vault\.payloadFor\(sos\)/);
  assert.match(hub, /edit\('home_emergency_cards',sosEditing,payload,/);
  assert.match(hub, /add\('home_emergency_cards',payload,/);
  assert.doesNotMatch(hub, /sealSos\(/);
  assert.doesNotMatch(hub, /onClick=\{\(\)=>offlineSos\(x\)\}/, 'non più una copia per scheda');
  assert.match(hub, /passphraseConfirm/);
  assert.match(hub, /disabled=\{readonly\|\|\(vault\.isProtected&&!vault\.isOpen\)\}/);
  assert.match(hub, /\{!sosLocked&&<form className="extra-form" onSubmit=\{saveSos\}>/, 'modulo nascosto con le schede bloccate');
  assert.match(hub, /if\(sosLocked\)\{setSos\(/, 'modulo svuotato al blocco');
  const component = source('app/SosProtection.jsx');
  assert.match(component, /client\.rpc\('v40_set_sos_key'/);
  assert.match(component, /client\.rpc\('v40_reset_sos'/);
  assert.doesNotMatch(component, /localStorage|sessionStorage/, 'la chiave resta solo in memoria');
  assert.match(component, /const current = await loadKey\(\);\n    if \(!current \|\| current\.salt !== key\.salt\) \{ lock\(\); throw new Error\('sos-locked'\); \}/, 'frase cambiata da un altro membro: niente salvataggi con la chiave vecchia');
});

test('testi della protezione SOS in 6 lingue', () => {
  const keys = ['sos.protectTitle', 'sos.protectHelp', 'sos.viewerNoPhrase', 'sos.phrase', 'sos.confirmPhrase', 'sos.phraseShort', 'sos.phraseMismatch', 'sos.protectButton', 'sos.protected', 'sos.lockedTitle', 'sos.lockedHelp', 'sos.unlock', 'sos.wrongPhrase', 'sos.lock', 'sos.unreadable', 'sos.changeTitle', 'sos.newPhrase', 'sos.changeButton', 'sos.changed', 'sos.forgotTitle', 'sos.forgotHelp', 'sos.resetButton', 'sos.resetConfirm', 'sos.resetDone', 'sos.changedMeanwhile', 'sos.offlineHomePhrase', 'sos.personalSpace'];
  const used = source('app/SosProtection.jsx') + source('app/V21Hub.jsx');
  for (const key of keys) {
    assert.ok(used.includes(`'${key}'`), `${key} non usata`);
    const values = LANGUAGES.map(({ code }) => translate(code, key));
    for (const v of values) assert.ok(v && v !== key, key);
    assert.equal(new Set(values).size > 1, true, `${key} uguale in tutte le lingue`);
  }
});
