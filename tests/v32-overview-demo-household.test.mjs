import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {LANGUAGES,TRANSLATIONS,translate} from '../lib/i18n.mjs';
const page=readFileSync(new URL('../app/page.jsx',import.meta.url),'utf8');
const keys=['demoTitle','demoHelp','demoReset','demoResetDone','viewBills','viewAll','noBillsHelp','addBill','homeSpending','lastSummary','addRecurring','recurringHelp','tasksTitle','tasksHelp','familyEyebrow','familyHelp'];
test('overview, demo and household text is present in every locale and wired in UI',()=>{
 for(const {code} of LANGUAGES){
  for(const key of keys){
   const full='v32.batch.'+key;
   assert.equal(typeof TRANSLATIONS[code][full],'string',code+': '+full);
   assert.ok(TRANSLATIONS[code][full].trim(),code+': '+full);
   assert.notEqual(translate(code,full),full);
  }
 }
 for(const key of keys)assert.ok(page.includes("tr('v32.batch."+key+"')"),key);
});
