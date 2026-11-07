import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {LANGUAGES,TRANSLATIONS} from '../lib/i18n.mjs';
const page=readFileSync(new URL('../app/page.jsx',import.meta.url),'utf8');
test('utility frequency, supplier category and shared home heading use localized labels',()=>{
 assert.ok(page.includes("tr('billFrequency.'+u.frequency)"));
 assert.ok(page.includes("tr('billCategory.'+sp.category)"));
 assert.ok(page.includes("<h1>{tr('nav.'+tab)}</h1>"));
 assert.ok(!page.includes("frequencies.find(x=>x.value===u.frequency)?.label"));
 for(const {code} of LANGUAGES){
  for(const key of ['billFrequency.none','billFrequency.monthly','billFrequency.bimonthly','billFrequency.quarterly','billFrequency.yearly','billFrequency.biennial','nav.household','nav.budget','nav.shopping','nav.vehicles','billCategory.Luce','billCategory.Gas']){
   assert.equal(typeof TRANSLATIONS[code][key],'string',code+': '+key);
   assert.ok(TRANSLATIONS[code][key].trim(),code+': '+key);
  }
 }
});
