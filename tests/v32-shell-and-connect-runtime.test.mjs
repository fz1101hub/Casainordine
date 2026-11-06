import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {TRANSLATIONS, LANGUAGES} from '../lib/i18n.mjs';
const page=readFileSync(new URL('../app/page.jsx',import.meta.url),'utf8');
const keys=['loading','reminderTitle','reminderHelp','readOnly'];
test('shell statuses and read-only notice are translated in six languages',()=>{
 for(const {code} of LANGUAGES){
  for(const key of keys){
   const full='v32.shell.'+key;
   assert.equal(typeof TRANSLATIONS[code][full],'string',code+': '+full);
   assert.ok(TRANSLATIONS[code][full].trim());
   assert.ok(page.includes("tr('"+full+"')"));
  }
 }
});
test('import integration ternaries evaluate translations rather than string literals',()=>{
 for(const key of ['analyzing','selectImage','keyActive','optional','keyRegenerate','keyGenerate']){
  assert.ok(page.includes("tr('connect."+key+"')"));
  assert.ok(!page.includes("'{tr('connect."+key+"')}'"));
 }
});

test('copy-key notification is a valid evaluated translation expression',()=>{
 assert.ok(page.includes("notify(tr('connect.keyCopied'))"));
 assert.ok(!page.includes("notify('{tr('"));
 assert.ok(!page.includes("'{tr('"));
});
