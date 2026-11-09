import test from 'node:test';
import assert from 'node:assert/strict';
import {v20OcrProgress,v20OcrError} from '../lib/v20-ocr-i18n.mjs';
const languages=['it','en','es','fr','de','pt'];
test('OCR V20 progress is localized across all supported languages',()=>{
 for(const lang of languages){
  for(const msg of ['Preparazione riconoscimento testo italiano…','Lettura del PDF…','Lettura testo PDF, pagina 2 di 8…','Scansione PDF, pagina 1…','Analisi della foto o dello screenshot…','Seconda lettura con contrasto migliorato…','Riconoscimento in corso (45%)…']){
   const result=v20OcrProgress(msg,lang);
   assert.ok(result.length>4);
   if(lang!=='it')assert.notEqual(result,msg,lang+': '+msg);
  }
 }
});
test('OCR progress never echoes unknown provider messages',()=>{
 for(const lang of languages){
  assert.ok(!v20OcrProgress('private document text',lang).includes('private'));
  assert.ok(!v20OcrError(lang).includes('private'));
 }
 assert.equal(v20OcrProgress('Lettura del PDF…','xx'),v20OcrProgress('Lettura del PDF…','it'));
});
