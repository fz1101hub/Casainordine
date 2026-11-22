import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {formatV20Timestamp} from '../lib/v20-timestamp.mjs';

const source=readFileSync(new URL('../app/V21Hub.jsx',import.meta.url),'utf8');
test('V21 share expiry uses the user locale and an explicit Rome timezone',()=>{
 assert.match(source,/formatV20Timestamp\(s\.expires_at,locale\)/);
 assert.doesNotMatch(source,/new Date\(s\.expires_at\)\.toLocaleString\(locale\)/);
});
test('share expiry winter and summer instants retain the Rome civil hour for all locales',()=>{
 for(const locale of ['it-IT','en-GB','es-ES','fr-FR','de-DE','pt-PT']){
  const formatter=new Intl.DateTimeFormat(locale,{hour:'2-digit',hourCycle:'h23',timeZone:'Europe/Rome'});
  const hour=instant=>Number(formatter.formatToParts(new Date(instant)).find(part=>part.type==='hour')?.value);
  assert.equal(hour('2026-01-15T11:00:00Z'),12);
  assert.equal(hour('2026-07-15T11:00:00Z'),13);
  assert.notEqual(formatV20Timestamp('2026-01-15T11:00:00Z',locale),'—');
  assert.notEqual(formatV20Timestamp('2026-07-15T11:00:00Z',locale),'—');
 }
});
