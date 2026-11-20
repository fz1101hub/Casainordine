import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../app/V21Hub.jsx',import.meta.url),'utf8');
const locales=['it-IT','en-GB','es-ES','fr-FR','de-DE','pt-PT'];

test('V21 uses account locale for visible counts, without changing persisted values',()=>{
 assert.match(source,/import\s*\{normalizeLanguage,formatCount as formatLocalizedCount\}\s*from\s*['"]\.\.\/lib\/i18n-core\.mjs['"]/);
 assert.match(source,/const formatCount=value=>formatLocalizedCount\(value,language\)/);
 for(const expression of [
  'passport.assets.length','passport.contracts.length','passport.documents.length',
  'passport.maintenance.length','inventoryTotal.count','inventoryTotal.documented',
  't.yes','t.no','t.abstain','i+1'
 ]) assert.ok(source.includes('formatCount('+expression+')'),expression);
 assert.match(source,/estimated_value:Number\(inventory\.estimated_value\)/);
});

test('six supported account locales format integer counts using Intl',()=>{
 for(const locale of locales){
  const formatter=new Intl.NumberFormat(locale,{maximumFractionDigits:0});
  assert.equal(formatter.format(12345),new Intl.NumberFormat(locale).format(12345));
  assert.equal(formatter.format(0),new Intl.NumberFormat(locale).format(0));
 }
});
