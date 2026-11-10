import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {LANGUAGES,TRANSLATIONS,translate} from '../lib/i18n.mjs';
const page=readFileSync(new URL('../app/page.jsx',import.meta.url),'utf8');
test('thirty validation and import feedback messages exist in every locale',()=>{
 for(let i=1;i<=30;i++){
  const key='v32.feedback.'+i;
  assert.ok(page.includes("notify(tr('"+key+"'))"),'missing UI feedback '+key);
  for(const {code} of LANGUAGES){
   assert.equal(typeof TRANSLATIONS[code][key],'string',code+': '+key);
   assert.ok(translate(code,key).trim(),code+': '+key);
  }
 }
});
test('critical user feedback no longer emits hardcoded Italian notifications',()=>{
 for(const message of ['Questa casa è in sola lettura.','Chiave revocata.','Il documento deve essere più piccolo di 15 MB.','Testo già importato.','Questa bolletta è già stata importata.']){
  assert.ok(!page.includes("notify('"+message+"')"),message);
 }
});
