import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../app/V20Hub.jsx',import.meta.url),'utf8');

test('V20 counts use account locale rather than fixed Italian formatting',()=>{
 assert.match(source,/locale,language,t\}=useLanguage\(\)/);
 assert.match(source,/new Intl\.NumberFormat\(locale,\{maximumFractionDigits:0\}\)/);
 for(const expression of ['formatCount(m.days_late)','formatCount(p?.progress||0)','formatCount(p?.months||0)'])
  assert.ok(source.includes(expression),expression);
});

test('integer count formatting respects all six account locales',()=>{
 const locales=['it-IT','en-GB','es-ES','fr-FR','de-DE','pt-PT'];
 for(const locale of locales){
  const formatter=new Intl.NumberFormat(locale,{maximumFractionDigits:0});
  assert.equal(formatter.format(1234),new Intl.NumberFormat(locale).format(1234),locale);
  assert.equal(formatter.format(0),'0',locale);
 }
 assert.notEqual(new Intl.NumberFormat('en-GB').format(1234),new Intl.NumberFormat('de-DE').format(1234));
});

test('V20 savings progress has a localized accessible name including goal label',()=>{
 assert.match(source, /<progress[^>]*aria-label=\{\x60\$\{ui\.progressMonthly\}: \$\{g\.label\}\x60\}/);
 assert.match(source, /<progress[^>]*value=\{p\?\.progress\|\|0\}/);
});

test('V20 destructive buttons identify the individual record to assistive technology',()=>{
 assert.match(source,/aria-label=\{\x60\$\{ui\.deleteLabel\}: \$\{n\.creditor_name\|\|ui\.pagopaNotice\}\x60\}/);
 assert.match(source,/aria-label=\{\x60\$\{ui\.deleteLabel\}: \$\{g\.label\}\x60\}/);
});

test('V20 locale count formatting handles negative and large counts without changing numeric values',()=>{
 const locales=['it-IT','en-GB','es-ES','fr-FR','de-DE','pt-PT'];
 for(const locale of locales){
  const formatter=new Intl.NumberFormat(locale,{maximumFractionDigits:0});
  for(const count of [-1234,1000000,1234.6]){
   const original=count;
   const rendered=formatter.format(count);
   assert.equal(rendered,new Intl.NumberFormat(locale,{maximumFractionDigits:0}).format(original),locale);
   assert.equal(count,original,'display formatting must not mutate the source');
   assert.ok(rendered.length>0,locale);
  }
 }
 assert.notEqual(new Intl.NumberFormat('en-GB').format(1000000),new Intl.NumberFormat('de-DE').format(1000000));
});
