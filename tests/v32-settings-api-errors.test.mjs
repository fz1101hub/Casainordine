import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {localizeSettingsApiError} from '../lib/settings-api-errors.mjs';

test('calendar and push known API errors translate into all six languages',()=>{
 const cases=['Non autorizzato','Sottoscrizione push non valida','Questo dispositivo risulta già associato a un altro account','Endpoint richiesto'];
 for(const message of cases){
  const translations=['it','en','es','fr','de','pt'].map(language=>localizeSettingsApiError(message,language));
  assert.equal(translations.length,6);
  assert.equal(translations[0],message);
  assert.equal(new Set(translations).size,6,message);
  assert.equal(localizeSettingsApiError(message,'unknown'),message);
 }
 assert.equal(localizeSettingsApiError('Diagnostic code 123','fr'),'Diagnostic code 123');
});
test('settings components pass selected language to known API error translator',()=>{
 for(const path of ['CalendarFeed.jsx','PushSettings.jsx']){
  const source=readFileSync(new URL('../app/'+path,import.meta.url),'utf8');
  assert.match(source,/const \{t,language\}=useLanguage\(\)/);
  assert.match(source,/localizeSettingsApiError\((?:body|p)\.error,language\)/);
 }
});
