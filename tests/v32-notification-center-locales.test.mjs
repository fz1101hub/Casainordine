import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {LANGUAGES,TRANSLATIONS} from '../lib/i18n.mjs';
const page=readFileSync(new URL('../app/page.jsx',import.meta.url),'utf8');
const keys=['authEyebrow','reminderHeading','reminderQuestion','billFallback','dueOn','markPaid','noReminders'];
test('authentication heading and reminder center are localized in all six languages',()=>{
 for(const {code} of LANGUAGES){
  for(const key of keys){
   const full='v32.notifications.'+key;
   assert.ok(typeof TRANSLATIONS[code][full]==='string'&&TRANSLATIONS[code][full].trim(),code+' '+full);
   assert.ok(page.includes("'"+full+"'"),full);
  }
 }
 assert.ok(page.includes("r.bills?.title||tr('v32.notifications.billFallback')"));
 assert.ok(!page.includes('<strong>Hai già effettuato il pagamento?</strong>'));
});
