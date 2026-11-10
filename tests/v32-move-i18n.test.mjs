import test from 'node:test';
import assert from 'node:assert/strict';
import {moveChecklist} from '../lib/v20-core.mjs';
import {localizedMoveChecklist} from '../lib/v20-move-i18n.mjs';

test('moving checklist preserves seven dates and localizes titles for six languages',()=>{
 const original=moveChecklist('2026-12-15');
 assert.equal(original.length,7);
 for(const lang of ['it','en','es','fr','de','pt']){
  const localized=localizedMoveChecklist(original,lang);
  assert.equal(localized.length,7);
  assert.deepEqual(localized.map(x=>x.due_on),original.map(x=>x.due_on));
  assert.ok(localized.every(x=>typeof x.title==='string'&&x.title.trim().length>10));
  assert.deepEqual(localized.map(x=>x.done),original.map(x=>x.done));
  if(lang!=='it')assert.notEqual(localized[0].title,original[0].title);
 }
 assert.deepEqual(original,moveChecklist('2026-12-15'));
});
test('regional locales and unsupported languages use safe fallback',()=>{
 const original=moveChecklist('2026-12-15');
 assert.deepEqual(localizedMoveChecklist(original,'en-US'),localizedMoveChecklist(original,'en'));
 assert.deepEqual(localizedMoveChecklist(original,'pt-BR'),localizedMoveChecklist(original,'pt'));
 assert.deepEqual(localizedMoveChecklist(original,'unknown'),localizedMoveChecklist(original,'it'));
 assert.deepEqual(localizedMoveChecklist(original,null),localizedMoveChecklist(original,'it'));
});

test('moving checklist accepts padded regional language preferences without mutating inputs',()=>{
 const original=moveChecklist('2026-12-15');
 const snapshot=structuredClone(original);
 for(const lang of [' EN-gb ',' es-ES ',' FR_fr ',' de-DE ',' pt-PT ',' it-IT ']){
  const normalized=lang.trim().slice(0,2).toLowerCase();
  assert.deepEqual(localizedMoveChecklist(original,lang),localizedMoveChecklist(original,normalized));
 }
 assert.deepEqual(original,snapshot);
});
