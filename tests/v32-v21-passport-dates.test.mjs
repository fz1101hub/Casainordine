import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../app/V21Hub.jsx',import.meta.url),'utf8');

test('V21 passport date-only fields use the selected locale formatter',()=>{
 for(const field of ['a.warranty_until','a.next_service_on','c.renewal_on','e.done_on']){
  assert.ok(source.includes(`${field}?formatDate(${field}):'—'`),`missing localized ${field}`);
 }
 assert.ok(source.includes('formatDate(passport.generated_at.slice(0,10))'));
 assert.match(source,/date:formatDate,locale,language\}=useLanguage\(\)/);
});
