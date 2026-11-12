import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {LANGUAGES,DEFAULT_LANGUAGE,MESSAGE_KEYS,TRANSLATIONS,browserLanguage,acceptedLanguage,normalizeLanguage,translate,localeFor,formatDate,formatMoney,languageStorageKey} from '../lib/i18n.mjs';
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
test('Accept-Language respects regional preferences and rejects invalid quality weights',()=>{
 assert.equal(acceptedLanguage('fr-CA, en-US;q=0.8'),'fr');
 assert.equal(acceptedLanguage('de-DE;q=0, es-MX;q=0.6'),'es');
 assert.equal(acceptedLanguage('pt-BR;q=1.5, en-US;q=0.7'),'en');
 assert.equal(acceptedLanguage('fr-FR;q=-0.5, de-DE;q=0.4'),'de');
 assert.equal(acceptedLanguage('es-ES;q=NaN, pt-PT;q=0.3'),'pt');
 assert.equal(acceptedLanguage('ja-JP, it-IT;q=0.5'),'it');
 assert.equal(acceptedLanguage('en-US;q=0, fr-FR;q=0'),'it');
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
 for(const lang of LANGUAGES.map(x=>x.code)){
  for(const missing of [null,undefined,'','  ','not-a-number',Infinity,NaN])assert.equal(formatMoney(missing,lang),'—',lang+': '+String(missing));
  assert.notEqual(formatMoney(0,lang),'—',lang+' zero is a real value');
  assert.notEqual(formatMoney('0',lang),'—',lang+' numeric string zero');
  assert.notEqual(formatMoney('12.50',lang),'—',lang+' numeric amount');
 }
});
test('date formatting adapts; invalid inputs do not crash',()=>{
 assert.match(formatDate('2026-11-04','en'),/Nov/);
 assert.equal(formatDate('invalid','fr'),'—');
 assert.equal(formatDate('2026-02-30','en'),'—');
 assert.equal(formatDate('2025-02-29','it'),'—');
 assert.notEqual(formatDate('2024-02-29','de'),'—');
 assert.equal(formatDate('2026-13-01','pt'),'—');
});

test('account language preferences are scoped independently; guest setting is separate',()=>{
 assert.equal(languageStorageKey(),'casainordine-language-v32');
 assert.equal(languageStorageKey('user-a'),'casainordine-language-v32:user:user-a');
 assert.notEqual(languageStorageKey('user-a'),languageStorageKey('user-b'));
 assert.notEqual(languageStorageKey('user-a'),languageStorageKey());
});

test('all translated UI modules reference existing messages',()=>{
 const components=['page.jsx','PersonalizedHome.jsx','TestDrive.jsx','MailImporter.jsx','CalendarFeed.jsx','PushSettings.jsx','SampleAccountSetup.jsx','HouseholdHub.jsx','HomeExtra.jsx'];
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

test('all advanced home section, property and document keys resolve in six languages',()=>{
 const tabs=['insights','archive','properties','maintenance','contracts','payments','alerts'];
 const propertyTypes=['main','second','rental','other'];
 const documentTypes=['bill','contract','receipt','warranty','manual','condominium','other'];
 const assetTypes=['plant','appliance','safety','furniture','other'];
 const paymentMethods=['transfer','card','cash','debit','other'];
 const notificationTypes=['bills','contracts','maintenance','digest'];
 const keys=[
  ...tabs.map(v=>'extra.tab.'+v),
  ...propertyTypes.map(v=>'extra.propertyType.'+v),
  ...documentTypes.map(v=>'extra.documentType.'+v),
  ...assetTypes.map(v=>'extra.maint.category.'+v),
  ...paymentMethods.map(v=>'extra.payments.method.'+v),
  ...notificationTypes.map(v=>'extra.alerts.'+v)
 ];
 for(const lang of LANGUAGES){
  for(const key of keys){
   const translated=translate(lang.code,key);
   assert.ok(translated&&translated!==key,lang.code+': '+key);
  }
 }
});


test('push settings reject missing authentication and do not hide subscription lookup failures',()=>{
 const source=readFileSync(fileURLToPath(new URL('../app/PushSettings.jsx',import.meta.url)),'utf8');
 assert.match(source,/if\(!session\?\.access_token\)throw new Error\(t\('push\.configError'\)\)/);
 assert.match(source,/const \{subscriptions=\[\]\}=await api\('GET'\);/);
 assert.doesNotMatch(source,/api\('GET'\)\.catch\(/);
});


test('push toggle validates session before touching browser subscription',()=>{
 const source=readFileSync(fileURLToPath(new URL('../app/PushSettings.jsx',import.meta.url)),'utf8');
 const toggle=source.slice(source.indexOf('async function toggle()'));
 const sessionGuard=toggle.indexOf("if(!session?.access_token)throw new Error(t('push.configError'))");
 const browserMutation=toggle.indexOf('getSubscription()');
 assert.ok(sessionGuard>=0&&browserMutation>sessionGuard,'authentication must precede browser subscription mutation');
});


test('push toggle refuses a foreign browser subscription before any unsubscribe or API delete',()=>{
 const source=readFileSync(fileURLToPath(new URL('../app/PushSettings.jsx',import.meta.url)),'utf8');
 const toggle=source.slice(source.indexOf('async function toggle()'));
 const guard=toggle.indexOf("if(existing&&!(await ownedSubscription(existing)))throw new Error(t('push.otherAccount'))");
 assert.ok(guard>toggle.indexOf('getSubscription()'),'ownership checked after reading subscription');
 assert.ok(guard<toggle.indexOf("api('DELETE'"),'ownership checked before server deletion');
 assert.ok(guard<toggle.indexOf('existing.unsubscribe()'),'ownership checked before browser unsubscribe');
});


test('push toggle preserves an owned subscription when UI state is temporarily stale',()=>{
 const source=readFileSync(fileURLToPath(new URL('../app/PushSettings.jsx',import.meta.url)),'utf8');
 const toggle=source.slice(source.indexOf('async function toggle()'));
 const ownership=toggle.indexOf("if(existing&&!(await ownedSubscription(existing)))");
 const recovery=toggle.indexOf('if(existing&&!enabled){setEnabled(true);');
 const unsubscribe=toggle.indexOf('existing.unsubscribe()');
 assert.ok(ownership>=0&&recovery>ownership&&unsubscribe>recovery,'owned subscription must be recovered without unsubscribing');
 assert.match(toggle,/if\(existing&&!enabled\)\{setEnabled\(true\);onNotify\(t\('push\.enabled'\)\);return;\}/);
});
