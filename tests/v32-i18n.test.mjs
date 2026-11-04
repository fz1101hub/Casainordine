import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {LANGUAGES,DEFAULT_LANGUAGE,MESSAGE_KEYS,TRANSLATIONS,browserLanguage,normalizeLanguage,translate,localeFor,formatDate,formatMoney,languageStorageKey} from '../lib/i18n.mjs';
test('six selectable languages and Italian default',()=>{
 assert.deepEqual(LANGUAGES.map(x=>x.code),['it','en','es','fr','de','pt']);
 assert.equal(DEFAULT_LANGUAGE,'it');
});
test('accepts regional browser locales and safe fallback',()=>{
 assert.equal(browserLanguage('pt-BR'),'pt');
 assert.equal(browserLanguage('en-US'),'en');
 assert.equal(browserLanguage('fr-CH'),'fr');
 assert.equal(browserLanguage('ar'),'it');
 assert.equal(normalizeLanguage('ES_es'),'es');
});
test('all translations cover the same keys with nonempty text',()=>{
 for(const lang of LANGUAGES){
  assert.deepEqual(Object.keys(TRANSLATIONS[lang.code]).sort(),[...MESSAGE_KEYS].sort());
  for(const key of MESSAGE_KEYS)assert.ok(TRANSLATIONS[lang.code][key]?.trim(),lang.code+':'+key);
 }
});
test('replaces named placeholders without executing user content',()=>{
 assert.equal(translate('en','home.widget.tasks.count',{count:3}),'3 open tasks');
 assert.equal(translate('it','home.widget.tasks.count',{count:5}),'5 attività aperte');
 assert.equal(translate('en','home.greeting',{who:', Alice'}),'Hello, Alice!');
});
test('currency remains EUR; number formatting adapts to locale',()=>{
 assert.match(formatMoney(12345.5,'it'),/12.345,50/);
 assert.match(formatMoney(12345.5,'en'),/12,345.50/);
 assert.match(formatMoney(12345.5,'de'),/12.345,50/);
 assert.equal(localeFor('es'),'es-ES');
});
test('date formatting adapts; invalid inputs do not crash',()=>{
 assert.match(formatDate('2026-11-04','en'),/Nov/);
 assert.equal(formatDate('invalid','fr'),'—');
});

test('account language preferences are scoped independently; guest setting is separate',()=>{
 assert.equal(languageStorageKey(),'casainordine-language-v32');
 assert.equal(languageStorageKey('user-a'),'casainordine-language-v32:user:user-a');
 assert.notEqual(languageStorageKey('user-a'),languageStorageKey('user-b'));
 assert.notEqual(languageStorageKey('user-a'),languageStorageKey());
});

test('all translated UI modules reference existing messages',()=>{
 const components=['page.jsx','PersonalizedHome.jsx','TestDrive.jsx','MailImporter.jsx','CalendarFeed.jsx','PushSettings.jsx','SampleAccountSetup.jsx','HouseholdHub.jsx'];
 for(const component of components){
  const filename=fileURLToPath(new URL('../app/'+component,import.meta.url));
  const code=readFileSync(filename,'utf8');
  for(const match of code.matchAll(/\b(?:t|tr)\(\s*'([^']+)'\s*(?=[,)])/g)){
   const key=match[1];
   assert.ok(TRANSLATIONS.it[key],component+' references unknown translation: '+key);
  }
 }
});
test('translation placeholders match across all six languages',()=>{
 const placeholders=s=>[...s.matchAll(/\{([A-Za-z][A-Za-z0-9]*)\}/g)].map(m=>m[1]).sort();
 for(const key of MESSAGE_KEYS){
  const italian=placeholders(TRANSLATIONS.it[key]);
  for(const lang of LANGUAGES)assert.deepEqual(placeholders(TRANSLATIONS[lang.code][key]),italian,lang.code+':'+key);
 }
});

test('every household category and vehicle type has a translation in every language',()=>{
 const categories=['groceries','home','transport','condominium','taxes','insurance','health','leisure','other'];
 const types=['tax','insurance','inspection','service','other'];
 for(const lang of LANGUAGES){
  for(const key of categories)assert.ok(translate(lang.code,'family.cat.'+key).length>1);
  for(const key of types)assert.ok(translate(lang.code,'family.vehicle.'+key).length>1);
 }
});
