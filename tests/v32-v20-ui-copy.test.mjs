import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {v20UiCopy} from '../lib/v20-ui-copy.mjs';

const source=readFileSync(new URL('../app/V20Hub.jsx',import.meta.url),'utf8');
test('V20 monitoring and fraud screen copy exists in all six languages',()=>{
 const langs=['it','en','es','fr','de','pt'];
 const copies=langs.map(v20UiCopy);
 const keys=Object.keys(copies[0]);
 assert.equal(keys.length,54);
 for(const copy of copies){assert.deepEqual(Object.keys(copy),keys);for(const value of Object.values(copy))assert.ok(value.length>4);}
 for(const key of keys)assert.ok(new Set(copies.map(copy=>copy[key])).size>=5,`Missing language variation for ${key}`);
 assert.deepEqual(v20UiCopy('unknown'),v20UiCopy('it'));
});
test('V20 renders localized headings rather than fixed Italian strings',()=>{
 assert.match(source,/v20UiCopy\(language\)/);
 for(const key of Object.keys(v20UiCopy('it')))assert.ok(source.includes('ui.'+key));
});

test('V20 destructive actions use localized confirmation and feedback',()=>{
 assert.match(source,/window\.confirm\(ui\.confirmDelete\)/);
 assert.match(source,/window\.confirm\(ui\.confirmRestore\)/);
 assert.match(source,/onNotify\(ui\.deleted\)/);
 assert.match(source,/onNotify\(ui\.restored\)/);
});

test('pagoPA validation and payment warning follow the account language',()=>{
 for(const key of ['noticeCodeInvalid','noticeReminderRequiresDetails','confirmNoticeOriginal','noticeAndReminderSaved','noticeSaved']){
  assert.ok(source.includes('ui.'+key));
 }
 assert.match(source,/window\.confirm\(ui\.confirmNoticeOriginal\)/);
});

test('pagoPA local scan feedback is localized',()=>{
 for(const key of ['multipleNoticeCodes','suggestedNoticeCode','unrecognizedNoticeCode','noticeFileTypes','noticeReadingLocal','noticeScanFailed']){
  assert.ok(source.includes('ui.'+key));
 }
});

test('offline import and moving-plan feedback are localized',()=>{
 for(const key of ['signInToImport','selectWritableHome','confirmAddShopping','shoppingAdded','taskSynced','syncFailed','movePlanCreated','moveStepsPartial','movePlanAndStepsCreated']){
  assert.ok(source.includes('ui.'+key));
 }
 assert.match(source,/window\.confirm\(ui\.confirmAddShopping\)/);
});
