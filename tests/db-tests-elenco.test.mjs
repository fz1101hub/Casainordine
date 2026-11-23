// Le prove del database (scripts/db-tests.sh) devono installare ogni migrazione nuova:
// una migrazione dimenticata nell'elenco non verrebbe mai provata.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const script = readFileSync(new URL('../scripts/db-tests.sh', import.meta.url), 'utf8');
const list = script.match(/MIGRATIONS=\(([\s\S]*?)\)/)[1].split(/\s+/).filter(Boolean);
const files = readdirSync(new URL('../supabase/', import.meta.url));

test('ogni migrazione dalla v19 in poi è nelle prove del database (tranne la v35, che richiede pg_cron)', () => {
  const versioned = files.filter(f => /^migrate_v(\d+)/.test(f) && Number(f.match(/^migrate_v(\d+)/)[1]) >= 19 && !f.startsWith('migrate_v35_'));
  for (const f of versioned) assert.ok(list.includes(f), `${f} manca in scripts/db-tests.sh`);
  for (const f of list) assert.ok(files.includes(f), `${f} non esiste in supabase/`);
});

test('le migrazioni sono in ordine di versione, dopo schema e correzione dei trigger', () => {
  assert.equal(list[0], 'schema.sql');
  assert.ok(list.indexOf('harden_trigger_permissions.sql') < list.indexOf('migrate_v33_audit.sql'));
  const versions = list.map(f => f.match(/^migrate_v(\d+)/)?.[1]).filter(Boolean).map(Number);
  assert.deepEqual(versions, [...versions].sort((a, b) => a - b));
});

test('ci sono le prove di sicurezza delle funzioni e la CI le esegue', () => {
  const tests = readdirSync(new URL('../supabase/tests/', import.meta.url));
  assert.ok(tests.includes('sicurezza_funzioni_test.sql'));
  const ci = readFileSync(new URL('../.github/workflows/tests.yml', import.meta.url), 'utf8');
  assert.match(ci, /image: postgres:17/);
  assert.match(ci, /bash scripts\/db-tests\.sh/);
});

test('v51: le funzioni di controllo escono dall\'API e gli affitti vogliono l\'email verificata', () => {
  const sql = readFileSync(new URL('../supabase/migrate_v51_sicurezza_funzioni.sql', import.meta.url), 'utf8');
  for (const f of ['can_edit_home', 'is_home_member', 'is_home_owner', 'v19_can_edit', 'v19_can_read', 'v21_decision_open',
    'v44_can_see_professional', 'v47_project_access', 'v48_asset_access', 'v49_is_landlord', 'v49_lease_can'])
    assert.match(sql, new RegExp(`'${f}\\(`), f);
  assert.match(sql, /set schema private/);
  assert.match(sql, /email_confirmed_at is not null/);
  assert.doesNotMatch(sql.replace(/^--.*$/gm, ''), /auth\.jwt\(\)/);
});

test('la CI prova anche l\'app con accesso, contro il Supabase finto', () => {
  const ci = readFileSync(new URL('../.github/workflows/tests.yml', import.meta.url), 'utf8');
  assert.match(ci, /^  accesso:/m);
  assert.match(ci, /NEXT_PUBLIC_SUPABASE_URL: http:\/\/127\.0\.0\.1:54321/);
  assert.match(ci, /node scripts\/prove-con-accesso\.mjs http:\/\/localhost:3000/);
  const script = readFileSync(new URL('../scripts/prove-con-accesso.mjs', import.meta.url), 'utf8');
  assert.match(script, /startFakeSupabase\(\{ port: PORT/);
  assert.match(script, /process\.exit\(1\)/, 'una prova non superata ferma la CI');
});

test('Dependabot: npm e GitHub Actions ogni settimana, minori raggruppati', () => {
  const yml = readFileSync(new URL('../.github/dependabot.yml', import.meta.url), 'utf8');
  assert.match(yml, /^version: 2$/m);
  for (const eco of ['npm', 'github-actions']) assert.match(yml, new RegExp(`package-ecosystem: ${eco}\\n    directory: /\\n    schedule:\\n      interval: weekly`), eco);
  assert.match(yml, /update-types: \[minor, patch\]/);
  assert.doesNotMatch(yml, /\t/, 'niente tabulazioni nello YAML');
});
