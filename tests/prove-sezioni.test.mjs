import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('la CI usa davvero le sezioni della Fase 2 nella demo', () => {
  const workflow = readdirSync(new URL('../.github/workflows/', import.meta.url)).map(f => read(`.github/workflows/${f}`)).join('\n');
  assert.match(workflow, /node scripts\/prove-sezioni\.mjs http:\/\/localhost:3000/);
  const script = read('scripts/prove-sezioni.mjs');
  for (const section of ['Automazioni', 'Professionisti', 'Programma stagionale', 'Scorte', 'Progetti e lavori', 'Fondo sostituzioni', 'Affitti', 'Casa Control'])
    assert.match(script, new RegExp(`section\\('${section}'`), section);
  // Si crea e si elimina davvero qualcosa, con la conferma dell'app.
  assert.ok((script.match(/await confirm\(\)/g) || []).length >= 5);
  assert.match(script, /nessun errore JavaScript/);
  assert.match(script, /process\.exit\(1\)/);
});
