// Secondo audit, A3: le conferme e le richieste di testo usano la finestra dell'app, non quelle
// del browser (window.confirm e window.prompt).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { LANGUAGES, translate } from '../lib/i18n.mjs';
const app = new URL('../app/', import.meta.url);
const files = readdirSync(app).filter(name => name.endsWith('.jsx'));

test('Nessuna finestra nativa del browser nei componenti', () => {
  const found = [];
  for (const name of files.filter(n => n !== 'ConfirmDialog.jsx')) {
    const text = readFileSync(new URL(name, app), 'utf8');
    if (/window\.(confirm|prompt)\(|[^.\w]confirm\(|[^.\w]prompt\(/.test(text.replace(/askConfirm\(|askText\(/g, ''))) found.push(name);
  }
  assert.deepEqual(found, []);
});

test('Finestra dell’app: modale, Esc annulla, pulsanti tradotti, montata una volta sola', () => {
  const dialog = readFileSync(new URL('ConfirmDialog.jsx', app), 'utf8'), layout = readFileSync(new URL('layout.jsx', app), 'utf8');
  assert.match(dialog, /node\.showModal\(\)/);
  assert.match(dialog, /onCancel=\{event => \{ event\.preventDefault\(\); cancel\(\); \}\}/);
  assert.match(dialog, /t\('general\.cancel'\)/); assert.match(dialog, /t\('general\.confirm'\)/);
  assert.match(dialog, /aria-labelledby="app-dialog-message"/);
  assert.match(dialog, /node\.querySelector\('\[data-cancel\]'\)\?\.focus\(\)/, 'nelle conferme il focus va su «Annulla»');
  assert.match(layout, /<LanguageProvider>\{children\}<ConfirmHost\/><\/LanguageProvider>/);
  for (const { code } of LANGUAGES) assert.notEqual(translate(code, 'general.confirm'), 'general.confirm', code);
});

test('Le conferme di cancellazione usano il pulsante rosso', () => {
  for (const [name, key] of [['HouseholdHub.jsx', 'family.deleteExpenseConfirm'], ['HomeExtra.jsx', 'extra.archive.deleteConfirm'], ['SosProtection.jsx', 'sos.resetConfirm']]) {
    const text = readFileSync(new URL(name, app), 'utf8');
    assert.ok(text.includes(`askConfirm(${name === 'SosProtection.jsx' ? 't' : 'tr'}('${key}'),{danger:true})`), `${name} ${key}`);
  }
});
