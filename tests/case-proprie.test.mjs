// Le case dell'utente si leggono solo dalle sue appartenenze (correzione del 23 novembre 2026).
// Le regole di accesso mostrano a ogni membro anche gli altri membri delle sue case: senza il
// filtro su user_id, chi legge o modifica risultava con il ruolo del proprietario, la cui riga
// viene prima, e vedeva la stessa casa più volte. La prova con accesso nel browser
// (scripts/prove-con-accesso.mjs) lo controlla con un invito vero; qui si controlla la richiesta.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('elenco delle case: solo le righe dell\'utente', () => {
  const page = readFileSync(new URL('../app/page.jsx', import.meta.url), 'utf8');
  const query = page.match(/from\('home_members'\)\.select\('home_id,role,homes\(id,name,owner_id\)'\)[^;]*;/)?.[0] || '';
  assert.match(query, /\.eq\('user_id',uid\)/);
  assert.match(page, /const uid=session\?\.user\?\.id;if\(!uid\)return;/);
});

test('la prova nel browser copre l\'invito in sola lettura', () => {
  const script = readFileSync(new URL('../scripts/prove-con-accesso.mjs', import.meta.url), 'utf8');
  for (const step of ["selectOption('viewer')", "'Accetta invito'", 'sola lettura a questa casa', 'chi legge non può aggiungere bollette'])
    assert.ok(script.includes(step), step);
});
