// Controlli unici sul sistema delle lingue (riordino del 22 novembre 2026): un solo dizionario
// (lib/i18n.mjs), nessun testo italiano scritto nel codice, il browser scarica una lingua alla volta.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TRANSLATIONS, MESSAGE_KEYS, translate } from '../lib/i18n.mjs';
import { dictionaries, groupOf, SECTIONS, offlineCopy } from '../scripts/build-i18n.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const LANGS = ['it', 'en', 'es', 'fr', 'de', 'pt'];
const KEYS = new Set(MESSAGE_KEYS);
const read = file => readFileSync(path.join(ROOT, file), 'utf8');
function files(dir, pattern = /\.(jsx|js|mjs)$/) {
  const out = [];
  for (const name of readdirSync(path.join(ROOT, dir))) {
    const rel = path.join(dir, name);
    if (['node_modules', 'i18n-dicts', '.next'].includes(name)) continue;
    if (statSync(path.join(ROOT, rel)).isDirectory()) out.push(...files(rel, pattern));
    else if (pattern.test(name)) out.push(rel);
  }
  return out;
}
const CODE = [...files('app'), ...files('lib')];
const placeholders = text => [...String(text).matchAll(/\{([a-z][a-zA-Z0-9]*)\}/g)].map(m => m[1]).sort().join(',');

test('Ogni testo del dizionario c’è in tutte e 6 le lingue, con gli stessi segnaposto', () => {
  assert.ok(KEYS.size > 1500, `${KEYS.size} testi`);
  const problems = [];
  for (const key of KEYS) {
    const italian = TRANSLATIONS.it[key];
    for (const lang of LANGS) {
      const text = TRANSLATIONS[lang][key];
      if (typeof text !== 'string' || !text.trim()) problems.push(`${key} ${lang}: vuoto`);
      else if (placeholders(text) !== placeholders(italian)) problems.push(`${key} ${lang}: segnaposto ${placeholders(text)} ≠ ${placeholders(italian)}`);
    }
  }
  assert.deepEqual(problems, []);
});

test('Le chiavi scritte nel codice esistono nel dizionario', () => {
  const missing = new Set();
  // Solo chiavi intere: 'prefisso.'+variabile (chiave composta) si controlla a parte.
  const literal = /\b(?:t|tr|translate\([^,()]+,|appError\()\s*\(?\s*'([a-zA-Z][\w-]*(?:\.[\w-]+)+)'(?!\s*\+)/g;
  for (const file of CODE) {
    const source = read(file);
    for (const m of source.matchAll(literal)) if (!KEYS.has(m[1])) missing.add(`${file}: ${m[1]}`);
    // Gruppi letti come oggetto (textGroup): ui.x → v20.ui.x, briefingCopy.x / copy.x → briefing.x
    if (/textGroup\(t,'v20\.ui\.'\)/.test(source)) for (const m of source.matchAll(/\bui\.([a-zA-Z]\w*)/g)) if (!KEYS.has('v20.ui.' + m[1])) missing.add(`${file}: v20.ui.${m[1]}`);
    if (/textGroup\(tr,'briefing\.'\)/.test(source)) for (const m of source.matchAll(/\bbriefingCopy\.([a-zA-Z]\w*)/g)) if (!KEYS.has('briefing.' + m[1])) missing.add(`${file}: briefing.${m[1]}`);
    if (/textGroup\(tr,'demo\.copy\.'\)/.test(source)) for (const m of source.matchAll(/\bcopy\.([a-zA-Z]\w*)/g)) if (!KEYS.has('demo.copy.' + m[1])) missing.add(`${file}: demo.copy.${m[1]}`);
  }
  for (const m of read('lib/v21-core.mjs').matchAll(/\bcopy\.([a-zA-Z]\w*)/g)) if (!KEYS.has('briefing.' + m[1])) missing.add(`v21-core: briefing.${m[1]}`);
  for (const m of read('lib/document-import.mjs').matchAll(/'(import\.warn\.\w+)'/g)) if (!KEYS.has(m[1])) missing.add(m[1]);
  for (const step of read('lib/v20-core.mjs').matchAll(/\['(step\d+)',/g)) if (!KEYS.has('v20.move.' + step[1])) missing.add('v20.move.' + step[1]);
  for (const id of ['high_amount', 'failed_auth', 'new_sender', 'iban_change']) if (!KEYS.has('fraud.' + id)) missing.add('fraud.' + id);
  assert.deepEqual([...missing], []);
});

test('Ogni codice d’errore delle API ha il suo testo («api.<codice>»)', () => {
  const codes = new Set();
  const patterns = [/\berror: ?'([a-zA-Z]+)'/g, /\bfailure\([a-zA-Z.]+, ?'([a-zA-Z]+)'/g, /\bapiError\('([a-zA-Z]+)'/g,
    /\bpublicError\('([a-zA-Z]+)'\)/g, /\b(?:notice|warning): ?'([a-zA-Z]+)'/g, /\b(?:learningWarning|warning)=\s*'([a-zA-Z]+)'/g];
  for (const file of [...files('app/api'), 'lib/mail-imap.mjs', 'lib/mail-providers.mjs'])
    for (const pattern of patterns) for (const m of read(file).matchAll(pattern)) codes.add(m[1]);
  assert.ok(codes.size > 60, `${codes.size} codici`);
  assert.deepEqual([...codes].filter(code => !KEYS.has('api.' + code)), []);
  // Le API non scrivono più testi: niente messaggi in italiano nelle risposte.
  for (const file of files('app/api')) assert.doesNotMatch(read(file), /\b(?:error|notice|warning): ?'[^']*\s[^']*'/, file);
});

test('Il browser non scarica il dizionario intero: nessun componente lo importa', () => {
  const clientRoots = files('app', /\.jsx$/).filter(file => /^['"]use client['"]/.test(read(file)));
  assert.ok(clientRoots.length > 10);
  const seen = new Set(), stack = [...clientRoots], offenders = [];
  while (stack.length) {
    const file = stack.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    for (const m of read(file).matchAll(/(?:from|import\()\s*['"](\.[^'"]+)['"]/g)) {
      let target = path.normalize(path.join(path.dirname(file), m[1]));
      if (!existsSync(path.join(ROOT, target))) for (const ext of ['.jsx', '.js', '.mjs']) if (existsSync(path.join(ROOT, target + ext))) { target += ext; break; }
      if (!existsSync(path.join(ROOT, target)) || target.endsWith('.json') || target.endsWith('.css')) continue;
      if (target === path.normalize('lib/i18n.mjs')) offenders.push(file);
      else stack.push(target);
    }
  }
  assert.deepEqual(offenders, []);
});

test('Dizionari per il browser: una lingua alla volta, sezione V20 a parte, niente testi del server', () => {
  const all = dictionaries();
  assert.deepEqual(Object.keys(all), LANGS);
  assert.deepEqual(SECTIONS, ['v20', 'automation', 'professional', 'seasonal', 'stock', 'project', 'replacement', 'rental', 'control', 'garden', 'pets', 'taxes', 'health', 'iddocs', 'inst']);
  for (const lang of LANGS) {
    const { app, v20, automation, offline, server } = all[lang];
    assert.ok(Object.keys(app).length > 1000);
    assert.ok(Object.keys(v20).length > 150);
    assert.ok(Object.keys(server).length > 20);
    assert.ok(Object.keys(app).every(key => groupOf(key) === 'app'));
    assert.ok(Object.keys(v20).every(key => key.startsWith('v20.')));
    assert.ok(Object.keys(automation).length > 50 && Object.keys(automation).every(key => key.startsWith('automation.')));
    assert.equal(app['general.loading'], TRANSLATIONS[lang]['general.loading']);
    assert.equal(Object.keys(offline).length, Object.keys(offlineCopy()[lang]).length);
  }
  assert.equal(offlineCopy().de.title, translate('de', 'offline.title'));
  const provider = read('app/LanguageProvider.jsx');
  assert.match(provider, /import italian from '\.\.\/lib\/i18n-dicts\/it\.json'/);
  assert.match(provider, /import\(`\.\.\/lib\/i18n-dicts\/\$\{lang\}\.json`\)/);
  assert.match(provider, /import\(`\.\.\/lib\/i18n-dicts\/\$\{lang\}\.\$\{section\}\.json`\)/);
  assert.match(read('app/V20Hub.jsx'), /const ready=useSection\('v20'\)/);
  assert.match(read('.gitignore'), /^lib\/i18n-dicts\/$/m);
  assert.match(read('.gitignore'), /^public\/offline-copy\.js$/m);
  assert.match(read('public/sw.js'), /'\/offline-copy\.js'/);
});

test('Niente testi italiani scritti direttamente nei componenti', () => {
  // Parole che in un testo per chi usa l'app indicano l'italiano (non nomi di marca né dati di esempio).
  const ITALIAN = /\b(?:il|lo|gli|della|delle|degli|dello|per|con|una|non|sono|alla|nella|bolletta|bollette|casella|scadenza|promemoria|attività|nessun[oa]?|aggiungi|salva|elimina|impossibile|riprova|errore|caricamento|annulla|conferma)\b/i;
  const problems = [];
  for (const file of files('app', /\.jsx$/)) {
    const source = read(file);
    for (const m of source.matchAll(/>([^<>{}\n]*[A-Za-zÀ-ÿ]{3,}[^<>{}\n]*)</g)) if (ITALIAN.test(m[1])) problems.push(`${file}: ${m[1].trim()}`);
    for (const m of source.matchAll(/\b(?:title|placeholder|aria-label|alt|label|button)="([^"]+)"/g)) if (ITALIAN.test(m[1])) problems.push(`${file}: ${m[1]}`);
  }
  assert.deepEqual(problems, []);
});

test('Le librerie usate dal browser non hanno tabelle di traduzione proprie', () => {
  const gone = ['v20-ui-copy', 'v21-briefing-copy', 'v32-demo-copy', 'v20-move-i18n', 'v20-ocr-i18n', 'v20-fraud-i18n', 'v20-safe-error', 'settings-api-errors', 'mail-api-errors', 'mail-api-i18n'];
  for (const name of gone) assert.equal(existsSync(path.join(ROOT, 'lib', name + '.mjs')), false, name);
  for (const file of CODE) assert.doesNotMatch(read(file), /^\s*(?:it|en|es|fr|de|pt):\s*\[\s*'/m, file);
});

test('I dizionari generati contengono esattamente il catalogo, diviso per gruppi', () => {
  for (const [code, groups] of Object.entries(dictionaries())) {
    const merged = Object.assign({}, ...Object.values(groups));
    assert.deepEqual(merged, { ...TRANSLATIONS[code] }, code);
  }
});

test('I dizionari si generano da soli prima di build e dev e dopo l’installazione', () => {
  const pkg = JSON.parse(read('package.json'));
  for (const script of ['prebuild', 'predev']) assert.equal(pkg.scripts[script], 'node scripts/build-i18n.mjs', script);
  assert.match(pkg.scripts.postinstall, /node scripts\/build-i18n\.mjs/);
  // Finché la lingua scelta non è arrivata si usa l'italiano (incluso nell'app).
  assert.match(read('app/LanguageProvider.jsx'), /\(dictionaries\[lang\]\|\|italian\)\[key\]\?\?italian\[key\]/);
  assert.doesNotMatch(read('app/LanguageProvider.jsx'), /from '\.\.\/lib\/i18n\.mjs'/);
});

test('Niente testo scritto direttamente negli attributi visibili dei componenti', () => {
  // label, placeholder, title, aria-label e alt mostrano testo: vanno presi dal dizionario.
  // Unica eccezione: LocalizedTitle riceve la chiave («meta.*»), non il testo.
  const offenders = [];
  for (const file of readdirSync(new URL('../app/', import.meta.url)).filter(name => name.endsWith('.jsx'))) {
    const source = read('app/' + file);
    for (const match of source.matchAll(/\b(label|placeholder|title|aria-label|alt|description)="([^"]*\p{L}[^"]*)"/gu)) {
      if (/^meta\.[\w.]+$/.test(match[2])) continue;
      offenders.push(`${file}: ${match[0]}`);
    }
  }
  assert.deepEqual(offenders, []);
});
