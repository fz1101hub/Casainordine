import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {LANGUAGES,TRANSLATIONS,translate} from '../lib/i18n.mjs';
const page=readFileSync(new URL('../app/page.jsx',import.meta.url),'utf8');
const keys=['homesError','loadError','deleteConfirm','receiptLabel','reminderLabel','documentConfirm','utilityPartial','noRates','revokeConfirm'];
test('nine import and access feedback strings exist in all six languages',()=>{
 for(const {code} of LANGUAGES)for(const key of keys){
  const full='v32.flow.'+key;
  assert.equal(typeof TRANSLATIONS[code][full],'string',code+': '+key);
  assert.ok(translate(code,full).trim());
  assert.ok(page.includes("tr('"+full+"'"),key);
 }
});
test('dynamic error details and document kind are interpolated',()=>{
 for(const {code} of LANGUAGES){
  assert.ok(translate(code,'v32.flow.loadError',{error:'SAMPLE'}).includes('SAMPLE'));
  assert.ok(translate(code,'v32.flow.documentConfirm',{kind:'SAMPLE'}).includes('SAMPLE'));
  assert.ok(translate(code,'v32.flow.utilityPartial',{error:'SAMPLE'}).includes('SAMPLE'));
 }
});
