// Seguito di A1: il browser scarica solo la lingua scelta, non il dizionario delle 6 lingue.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { TRANSLATIONS, translate, LANGUAGES } from '../lib/i18n.mjs';
import * as core from '../lib/i18n-core.mjs';
import { dictionaries } from '../scripts/build-i18n.mjs';
import { ITALIAN_GENERIC } from '../lib/friendly-error.mjs';
const source = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('I dizionari per lingua sono identici al catalogo lib/i18n.mjs', () => {
  const dicts = dictionaries();
  assert.deepEqual(Object.keys(dicts), LANGUAGES.map(l => l.code));
  for (const [code, entries] of Object.entries(dicts)) assert.deepEqual(entries, { ...TRANSLATIONS[code] }, code);
});

test('Il provider delle lingue usa la parte leggera e scarica le altre lingue a richiesta', () => {
  const provider = source('app/LanguageProvider.jsx');
  assert.doesNotMatch(provider, /from '\.\.\/lib\/i18n\.mjs'/);
  assert.match(provider, /from '\.\.\/lib\/i18n-core\.mjs'/);
  assert.match(provider, /^import italian from '\.\.\/lib\/i18n-dicts\/it\.json';$/m);
  assert.match(provider, /import\(`\.\.\/lib\/i18n-dicts\/\$\{lang\}\.json`\)/);
  assert.match(provider, /\(dictionaries\[lang\]\|\|italian\)\[key\]\?\?italian\[key\]\?\?key/, 'finché la lingua non arriva si usa l’italiano');
});

test('Nessun componente del browser importa il catalogo completo', () => {
  const clientFiles = readdirSync(new URL('../app/', import.meta.url)).filter(n => n.endsWith('.jsx')).map(n => `app/${n}`)
    .concat(['lib/friendly-error.mjs', 'lib/v20-alert-copy.mjs', 'lib/extra-alert-copy.mjs', 'lib/member-names.mjs']);
  const offenders = clientFiles.filter(f => /from '(\.\.\/lib|\.)\/i18n\.mjs'/.test(source(f)));
  assert.deepEqual(offenders, []);
  assert.equal(ITALIAN_GENERIC, translate('it', 'errors.generic'));
});

test('Le funzioni leggere sono le stesse del catalogo', () => {
  for (const name of ['normalizeLanguage', 'browserLanguage', 'acceptedLanguage', 'localeFor', 'formatMoney', 'formatDate', 'interpolate', 'languageStorageKey'])
    assert.equal(typeof core[name], 'function', name);
  assert.equal(core.interpolate('Ciao {name} {x}', { name: 'Anna' }), 'Ciao Anna {x}');
  assert.equal(translate('fr', 'general.cancel'), 'Annuler');
});

test('I dizionari si generano da soli prima di build e dev e dopo l’installazione', () => {
  const pkg = JSON.parse(source('package.json'));
  for (const script of ['prebuild', 'predev']) assert.equal(pkg.scripts[script], 'node scripts/build-i18n.mjs', script);
  assert.match(pkg.scripts.postinstall, /node scripts\/build-i18n\.mjs/);
  assert.match(source('.gitignore'), /^lib\/i18n-dicts\/$/m);
});
