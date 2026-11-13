import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../app/V21Hub.jsx',import.meta.url),'utf8');
test('V21 share expiry uses the user locale and an explicit Rome timezone',()=>{
 assert.match(source,/new Intl\.DateTimeFormat\(locale,\{dateStyle:'short',timeStyle:'short',timeZone:'Europe\/Rome'\}\)\.format\(new Date\(s\.expires_at\)\)/);
 assert.doesNotMatch(source,/new Date\(s\.expires_at\)\.toLocaleString\(locale\)/);
});
test('share expiry winter and summer instants retain the Rome civil hour for all locales',()=>{
 for(const locale of ['it-IT','en-GB','es-ES','fr-FR','de-DE','pt-PT']){
  const formatter=new Intl.DateTimeFormat(locale,{hour:'2-digit',hourCycle:'h23',timeZone:'Europe/Rome'});
  assert.equal(formatter.format(new Date('2026-01-15T11:00:00Z')),'12');
  assert.equal(formatter.format(new Date('2026-07-15T11:00:00Z')),'13');
 }
});
