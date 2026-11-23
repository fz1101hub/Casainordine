import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const lum = hex => { const v = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(c => c <= .03928 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4); return .2126 * v[0] + .7152 * v[1] + .0722 * v[2]; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + .05) / (y + .05); };

test('bordo dei campi e interruttori ben visibili (WCAG 1.4.11)', () => {
  const css = read('app/globals.css');
  const color = css.match(/--field-border:(#[0-9a-f]{6})/i)[1];
  for (const bg of ['#ffffff', '#f6f9f6', '#fbfcfa']) assert.ok(ratio(color, bg) >= 3, `${color} su ${bg}`);
  assert.match(css, /select,textarea,\.searchbox\{border-color:var\(--field-border\)!important\}/);
  assert.match(css, /\.toggle\{box-shadow:inset 0 0 0 1px var\(--field-border\)\}/);
  assert.match(read('public/offline.html'), /border:1px solid #7a9088/);
});

test('a 320 px la barra in alto non fa scorrere la pagina (WCAG 1.4.10)', () => {
  const css = read('app/globals.css');
  assert.match(css, /@media\(max-width:420px\)\{[^}]*\.crumb\{min-width:0;overflow:hidden\}/);
});

test('la CI controlla l’accessibilità e la pagina offline aggiornata arriva ai telefoni', () => {
  const workflow = readdirSync(new URL('../.github/workflows/', import.meta.url)).map(f => read(`.github/workflows/${f}`)).join('\n');
  assert.match(workflow, /node scripts\/check-accessibility\.mjs http:\/\/localhost:3000/);
  const script = read('scripts/check-accessibility.mjs');
  for (const name of ['Automazioni', 'Professionisti', 'Programma stagionale', 'Scorte', 'Progetti e lavori', 'Fondo sostituzioni', 'Affitti', 'Casa Control'])
    assert.ok(script.includes(`'${name}'`), name);
  assert.match(script, /'wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'/);
  assert.match(script, /width: 320/);
  // Pagina offline e testi cambiati: nuova versione della cache, altrimenti i telefoni tengono la vecchia.
  assert.match(read('public/sw.js'), /const CACHE='casa-shell-v43';/);
});
