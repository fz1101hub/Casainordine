import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const source = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const { OFFLINE_COPY, offlineLanguage, offlineText, offlineError } = await import(pathToFileURL(new URL('../public/offline-i18n.js', import.meta.url).pathname).href);
const { localizeMainDemo, localizeDemoFixtures } = await import('../lib/v32-demo-fixture-labels.mjs');
const { createDemoFixtures } = await import('../lib/test-fixtures.mjs');
const { translate } = await import('../lib/i18n.mjs');
const LANGS = ['it', 'en', 'es', 'fr', 'de', 'pt'];
const memory = entries => ({ getItem: k => entries[k] ?? null });

test('pagina offline: stessi testi in tutte e 6 le lingue', () => {
  const keys = Object.keys(OFFLINE_COPY.it);
  for (const lang of LANGS) {
    assert.deepEqual(Object.keys(OFFLINE_COPY[lang]).sort(), [...keys].sort(), lang);
    for (const key of keys) {
      const value = OFFLINE_COPY[lang][key];
      assert.ok(value && value.trim(), `${lang}.${key}`);
      assert.deepEqual(value.match(/\{\w+\}/g) || [], OFFLINE_COPY.it[key].match(/\{\w+\}/g) || [], `${lang}.${key} segnaposto`);
    }
    if (lang !== 'it') {
      const different = keys.filter(k => OFFLINE_COPY[lang][k] !== OFFLINE_COPY.it[k]).length;
      assert.ok(different / keys.length > 0.85, `${lang}: troppi testi uguali all italiano`);
    }
  }
  // Tedesco con il tu, come il resto dell'app.
  for (const value of Object.values(OFFLINE_COPY.de)) assert.doesNotMatch(value, /\b(Ihr|Ihre|Ihren|Ihnen)\b|\b[A-ZÄÖÜ][a-zäöüß]+en Sie\b/, value);
  assert.equal(offlineText('de', 'cards', { n: 3 }), '3 Einträge');
});

test('pagina offline: lingua dell account, poi quella generale, poi il browser', () => {
  const nav = { languages: ['fr-FR'] };
  assert.equal(offlineLanguage(memory({ 'casainordine-language-v32:user:u1': 'de', 'casainordine-language-v32': 'es' }), nav, 'u1'), 'de');
  assert.equal(offlineLanguage(memory({ 'casainordine-language-v32': 'es' }), nav, 'u1'), 'es');
  assert.equal(offlineLanguage(memory({}), nav, null), 'fr');
  assert.equal(offlineLanguage(memory({}), { language: 'ja-JP' }, null), 'it');
  assert.equal(offlineLanguage({ getItem() { throw new Error('bloccato'); } }, { language: 'pt-BR' }, 'u1'), 'pt');
});

test('pagina offline: errori in italiano mostrati nella lingua scelta', () => {
  assert.equal(offlineError('en', new Error('Titolo troppo corto')), OFFLINE_COPY.en.errTitle);
  assert.equal(offlineError('de', new Error('File non valido (PDF o foto, max 10 MB)')), OFFLINE_COPY.de.errFile);
  assert.equal(offlineError('es', new Error('Memoria offline non disponibile')), OFFLINE_COPY.es.errStorage);
  assert.equal(offlineError('fr', new Error('qualcos altro')), OFFLINE_COPY.fr.errGeneric);
});

test('pagina offline: ogni testo della pagina ha la sua traduzione e niente italiano negli script', () => {
  const html = source('public/offline.html');
  const keys = [...html.matchAll(/data-t(?:-placeholder)?="(\w+)"/g)].map(m => m[1]);
  assert.ok(keys.length >= 18, `solo ${keys.length} testi collegati`);
  for (const key of keys) assert.ok(OFFLINE_COPY.it[key], key);
  const scripts = [...html.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');
  assert.doesNotMatch(scripts, /Bozza attività|Articolo salvato|Documento conservato|Frase non corretta|Nessuna copia|Copia cancellata|Dove intervenire/);
  assert.match(scripts, /applyOfflineCopy\(document,lang\)/);
  assert.match(source('public/sw.js'), /'\/offline-i18n\.js'/);
});

test('modalità prova senza account: dati di esempio nella lingua scelta', () => {
  const tEn = (key, params) => translate('en', key, params);
  const demo = {
    bills: [
      { id: 'demo-1', title: 'Bolletta luce', supplier: 'Energia Esempio' },
      { id: 'demo-2', title: 'Fibra casa modificata', supplier: 'Rete Demo' },
      { id: 'mia', title: 'Bolletta mia', supplier: 'Fornitore mio' }
    ],
    tasks: [{ id: 'demo-t1', title: 'Pulire il filtro del climatizzatore' }],
    reminders: [{ id: 'demo-rem1', bills: { id: 'demo-1', title: 'Bolletta luce' } }]
  };
  const en = localizeMainDemo(demo, tEn);
  assert.equal(en.bills[0].title, 'Electricity bill');
  assert.equal(en.bills[0].supplier, 'Energia Esempio', 'i fornitori di esempio sono nomi di fantasia');
  assert.equal(en.bills[1].title, 'Fibra casa modificata', 'un titolo cambiato nella prova resta quello');
  assert.equal(en.bills[2].title, 'Bolletta mia');
  assert.equal(en.tasks[0].title, 'Clean the air conditioner filter');
  assert.equal(en.reminders[0].bills.title, 'Electricity bill');
  // La pagina di prova (/prova) usa gli stessi testi: dati di lib/test-fixtures.mjs.
  const fixtures = localizeDemoFixtures(createDemoFixtures('2026-11-01'), (key, params) => translate('de', key, params));
  assert.equal(fixtures.shopping[0].title, translate('de', 'demo.fixture.shop-milk'));
  assert.equal(fixtures.shopping[0].quantity, translate('de', 'demo.fixture.qty.shop-milk'));
  assert.equal(fixtures.assets[0].name, translate('de', 'demo.fixture.asset-boiler'));
});
