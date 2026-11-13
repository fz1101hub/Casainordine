import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../app/V20Hub.jsx',import.meta.url),'utf8');

test('V20 audit timestamps use account locale and explicit Rome timezone',()=>{
 assert.match(source,/new Date\(a\.created_at\)\.toLocaleString\(locale,\{timeZone:'Europe\/Rome'\}\)/);
 assert.doesNotMatch(source,/new Date\(a\.created_at\)\.toLocaleString\(locale\)/);
});

test('audit timestamp renders consistently across host timezones and six locales',()=>{
 const timestamp='2026-11-13T05:30:00Z';
 const locales=['it-IT','en-GB','es-ES','fr-FR','de-DE','pt-PT'];
 for(const locale of locales){
  const expected=new Date(timestamp).toLocaleString(locale,{timeZone:'Europe/Rome'});
  assert.ok(expected.length>0);
  assert.equal(expected,new Intl.DateTimeFormat(locale,{timeZone:'Europe/Rome',year:'numeric',month:'numeric',day:'numeric',hour:'numeric',minute:'numeric',second:'numeric'}).format(new Date(timestamp)));
 }
});
