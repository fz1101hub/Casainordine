import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TRANSLATIONS, translate, pluralKey } from '../lib/i18n.mjs';
import { PLURAL_PARAMS } from '../lib/i18n-core.mjs';
import { offlineText } from '../public/offline-i18n.js';

const LANGS = ['it', 'en', 'es', 'fr', 'de', 'pt'];
const placeholders = text => [...String(text).matchAll(/\{([a-zA-Z0-9]+)\}/g)].map(m => m[1]).sort();

test('pluralKey segue le regole di ogni lingua', () => {
  const has = () => true;
  const pick = (lang, n) => pluralKey(lang, 'k', { count: n }, has);
  for (const lang of LANGS) { assert.equal(pick(lang, 1), 'k.one', lang); assert.equal(pick(lang, 2), 'k', lang); assert.equal(pick(lang, 5), 'k', lang); }
  assert.equal(pick('it', 0), 'k');
  assert.equal(pick('fr', 0), 'k.one', 'in francese «0 facture»');
  assert.equal(pick('it', '1'), 'k.one', 'numero già scritto come testo');
  assert.equal(pick('it', '1,5'), 'k', 'non intero: si lascia il plurale');
  assert.equal(pluralKey('it', 'k', { days: 1 }, has), 'k.one');
  assert.equal(pluralKey('it', 'k', { number: 1 }, has), 'k', '«Rata 1» non è un conteggio');
  assert.equal(pluralKey('it', 'k', { count: 1 }, () => false), 'k', 'senza variante resta la chiave');
  assert.equal(pluralKey('it', 'k', null, has), 'k');
  assert.deepEqual(PLURAL_PARAMS, ['count', 'days', 'months', 'years', 'n']);
});

test('i testi dell’app: «1 bolletta», «3 bollette», «0 facture»', () => {
  assert.equal(translate('it', 'v32.import.csvConfirm', { count: 1, excluded: '' }), 'Importare 1 bolletta?');
  assert.equal(translate('it', 'v32.import.csvConfirm', { count: 3, excluded: '' }), 'Importare 3 bollette?');
  assert.equal(translate('it', 'v32.import.csvSaved', { count: 1, ignored: translate('it', 'v32.import.csvIgnored', { count: 1 }) }), 'Importata 1 bolletta. 1 riga ignorata.');
  assert.equal(translate('en', 'home.widget.tasks.count', { count: 1 }), '1 open task');
  assert.equal(translate('de', 'extra.insights.months', { count: 1 }), '1 Monat');
  assert.equal(translate('fr', 'overview.openCount', { count: 0 }), '0 facture en attente');
  assert.equal(translate('it', 'extra.insights.everyMonths', { count: 1 }), 'ogni mese');
  assert.equal(translate('pt', 'replacement.years', { years: 1 }), 'cerca de 1 ano');
  assert.equal(translate('es', 'automation.summary.ahead', { days: 1 }), 'aviso 1 día antes');
});

test('ogni variante singolare ha la sua chiave, tutte le lingue e gli stessi segnaposto', () => {
  const ones = Object.keys(TRANSLATIONS.it).filter(k => k.endsWith('.one'));
  assert.ok(ones.length >= 30);
  for (const key of ones) {
    const base = key.slice(0, -'.one'.length);
    for (const lang of LANGS) {
      assert.ok(TRANSLATIONS[lang][base], `${base} in ${lang}`);
      assert.ok(TRANSLATIONS[lang][key], `${key} in ${lang}`);
      // Il singolare può non scrivere il numero («ogni mese»), ma non può avere segnaposto nuovi.
      const extra = placeholders(TRANSLATIONS[lang][key]).filter(p => !placeholders(TRANSLATIONS[lang][base]).includes(p));
      assert.deepEqual(extra, [], `${key} in ${lang}`);
      const lost = placeholders(TRANSLATIONS[lang][base]).filter(p => !placeholders(TRANSLATIONS[lang][key]).includes(p) && !PLURAL_PARAMS.includes(p));
      assert.deepEqual(lost, [], `${key} in ${lang}: segnaposto mancanti`);
    }
  }
});

// Un testo nuovo con un numero deve avere il singolare, oppure stare qui con il motivo.
const NO_SINGULAR = {
  'v32.overview.overdueSingle': 'già divisi in due chiavi (Single/Plural)',
  'v32.overview.overduePlural': 'già divisi in due chiavi (Single/Plural)',
  'server.push.dueIn': 'usato solo da 2 giorni in su (0 e 1 hanno testi propri)',
  'server.push.summaryBody': 'il singolare è server.push.summaryOne',
  'server.push.summaryOne': 'è il singolare di summaryBody',
  'professional.stats': 'il singolare è professional.statsOne',
  'seasonal.window': '{months} è un elenco di mesi, non un numero',
  'stock.addAll': 'il numero è tra parentesi: «tutte (1)» va bene',
  'extra.backup.zipDone': 'il numero è dopo i due punti: «File inclusi: 1» va bene',
  'extra.backup.zipMissing': 'il numero è dopo i due punti: «non inclusi: 1» va bene',
  'v32.import.bankAlreadyCount': 'il numero è dopo i due punti: «saltati: 1» va bene',
  'garden.tasksAdded': 'il numero è dopo i due punti: «aggiunti al piano: 1» va bene',
};
test('nessun testo con un numero senza singolare', () => {
  const it = TRANSLATIONS.it;
  const missing = Object.entries(it).filter(([k, v]) => !k.endsWith('.one') && /\{(count|days|months|years|n)\}/.test(v) && !it[k + '.one'] && !NO_SINGULAR[k]).map(([k]) => k);
  assert.deepEqual(missing, []);
  for (const k of Object.keys(NO_SINGULAR)) assert.ok(it[k], `${k} esiste ancora`);
});

test('pagina offline e app usano la stessa scelta', () => {
  assert.equal(offlineText('it', 'cards', { n: 1 }), '1 scheda');
  assert.equal(offlineText('it', 'cards', { n: 4 }), '4 schede');
  assert.equal(offlineText('fr', 'cards', { n: 0 }), '0 fiche');
  const provider = readFileSync(new URL('../app/LanguageProvider.jsx', import.meta.url), 'utf8');
  assert.match(provider, /lookup\(lang,pluralKey\(lang,key,params,k=>lookup\(lang,k\)!==undefined\)\)/);
});
