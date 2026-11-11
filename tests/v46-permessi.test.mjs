// Secondo audit, D1: permessi del database ridotti a quelli usati dall'app. Il comportamento è
// provato sul database locale (batteria di isolamento invariata, anon senza permessi).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const sql = readFileSync(new URL('../supabase/migrate_v42_permessi.sql', import.meta.url), 'utf8');

test('v4.2: anon senza permessi, authenticated senza TRUNCATE, REFERENCES e TRIGGER', () => {
  assert.match(sql, /^begin;$/m); assert.match(sql, /^commit;$/m);
  assert.match(sql, /revoke all on all tables in schema public from anon;/);
  assert.match(sql, /revoke all on all sequences in schema public from anon;/);
  assert.match(sql, /revoke execute on function %s from public, anon/);
  assert.match(sql, /if f\.for_users then execute format\('grant execute on function %s to authenticated'/, 'chi aveva il permesso lo conserva');
  assert.match(sql, /revoke truncate, references, trigger on all tables in schema public from authenticated;/);
  assert.match(sql, /server_version_num'\)::int >= 170000/);
  for (const line of [
    'alter default privileges for role postgres in schema public revoke all on tables from anon;',
    'alter default privileges for role postgres in schema public revoke execute on functions from public;',
    'alter default privileges for role postgres in schema public revoke truncate, references, trigger on tables from authenticated;',
  ]) assert.ok(sql.includes(line), line);
  // Lettura e scrittura per chi ha fatto l'accesso non si toccano.
  assert.doesNotMatch(sql, /revoke (all|select|insert|update|delete)[^;]*from authenticated/i);
});
