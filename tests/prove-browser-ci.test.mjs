// Le prove nel browser con accesso (scripts/prove-*.mjs che usano il Supabase finto)
// devono girare tutte nel lavoro «accesso» della CI e avere uno script npm: una prova scritta
// ma mai eseguita non protegge niente.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const workflow = readFileSync(new URL('../.github/workflows/tests.yml', import.meta.url), 'utf8');
const accessJob = workflow.slice(workflow.indexOf('\n  accesso:'), workflow.indexOf('\n  database:'));
const scripts = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).scripts;
const browserTests = readdirSync(new URL('../scripts/', import.meta.url))
  .filter(name => /^prove-.*\.mjs$/.test(name))
  .filter(name => /from '(?:\.\/accesso-comune|\.\.\/tests\/helpers\/fake-supabase)\.mjs'/.test(readFileSync(new URL(`../scripts/${name}`, import.meta.url), 'utf8')));

test('ci sono le prove con accesso attese', () => {
  for (const name of ['prove-con-accesso.mjs', 'prove-ruoli.mjs', 'prove-lingue-accesso.mjs', 'prove-offline-accesso.mjs', 'prove-schermi-accesso.mjs', 'prove-tastiera-accesso.mjs', 'prove-eliminazione-account.mjs'])
    assert.ok(browserTests.includes(name), `manca scripts/${name}`);
});

test('ogni prova con accesso gira nel lavoro «accesso» della CI', () => {
  assert.ok(accessJob.length > 100, 'lavoro «accesso» non trovato');
  for (const name of browserTests) assert.match(accessJob, new RegExp(`node scripts/${name.replace('.', '\\.')} http://localhost:3000`), `${name} non gira nella CI`);
});

test('ogni prova con accesso ha uno script npm', () => {
  const commands = Object.values(scripts);
  for (const name of browserTests) assert.ok(commands.includes(`node scripts/${name}`), `${name} senza script npm`);
});

test('i ruoli si mostrano con il loro nome, non con il codice', () => {
  const hub = readFileSync(new URL('../app/HouseholdHub.jsx', import.meta.url), 'utf8');
  assert.match(hub, /const roleName=/);
  // Come testo (dopo un tag o un «·»); value={m.role} nel selettore va bene.
  assert.doesNotMatch(hub, /[>·]\s*\{(?:h|m|i)\.role\}/, 'un ruolo è ancora mostrato come codice (owner, editor, viewer)');
});
