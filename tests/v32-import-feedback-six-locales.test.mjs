import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {LANGUAGES,TRANSLATIONS,translate} from '../lib/i18n.mjs';
const page=readFileSync(new URL('../app/page.jsx',import.meta.url),'utf8');
const keys=['rateProposed','rateReadError','rateSaved','rateSaveError','csvError','documentReadError','emailReadError','csvConfirm','csvExcluded','csvSaved','csvIgnored'];
test('import errors, confirmation and dynamic counts have all six translations',()=>{
 for(const {code} of LANGUAGES){
  for(const key of keys){
   const full='v32.import.'+key;
   assert.ok(TRANSLATIONS[code][full]?.trim(),code+': '+full);
   assert.notEqual(translate(code,full,{count:3,detail:'DETAIL',excluded:'EXCLUDED',ignored:'IGNORED'}),full);
   assert.ok(!translate(code,full,{count:3,detail:'DETAIL',excluded:'EXCLUDED',ignored:'IGNORED'}).includes('{'),code+': '+full);
   assert.ok(page.includes("tr('"+full+"'"),full);
  }
 }
});
test('import feedback no longer contains untranslated literal templates',()=>{
 for(const text of ['rate proposte: controlla','Piano rate non leggibile:','Importazione rate non riuscita:','Documento email non leggibile:']){
  assert.ok(!page.includes(text),text);
 }
});
