import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {LANGUAGES,TRANSLATIONS,translate} from '../lib/i18n.mjs';
const page=readFileSync(new URL('../app/page.jsx',import.meta.url),'utf8');
const keys=['overdueSingle','overduePlural','summaryDue','add','open','demoMode','localData','privateSpace','personalSpace','sharedHome','familyRoleOwner','familyRoleEditor','familyRoleViewer','familyRoleMember'];
test('overview and account strings are present in all six locales',()=>{
 for(const {code} of LANGUAGES){
  for(const key of keys){
   const full='v32.overview.'+key;
   assert.ok(TRANSLATIONS[code][full]?.trim(),code+': '+full);
  }
  assert.ok(translate(code,'v32.overview.overdueSingle',{count:1}).includes('1'));
  assert.ok(translate(code,'v32.overview.overduePlural',{count:3}).includes('3'));
  const summary=translate(code,'v32.overview.summaryDue',{count:2,amount:'€ 45'});
  assert.ok(summary.includes('2')&&summary.includes('€ 45'));
 }
});
test('dynamic overdue, summary and account labels use localized messages',()=>{
 for(const key of ['overdueSingle','overduePlural','summaryDue','demoMode','localData','privateSpace','personalSpace','sharedHome']){
  assert.ok(page.includes("v32.overview."+key),key);
 }
 assert.ok(!page.includes("'bolletta scaduta':'bollette scadute'"));
 assert.ok(!page.includes(' ancora da pagare al momento del controllo.'));
});
