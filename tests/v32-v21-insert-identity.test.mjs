import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('V21 insert identity cannot be overridden by form data',()=>{
 const source=readFileSync(new URL('../app/V21Hub.jsx',import.meta.url),'utf8');
 assert.match(source,/const common=\{user_id:user\?\.id,home_id:homeId\|\|null\}/);
 assert.match(source,/client\.from\(table\)\.insert\(\{\.\.\.item,\.\.\.common\}\)/);
 assert.doesNotMatch(source,/client\.from\(table\)\.insert\(\{\.\.\.common,\.\.\.item\}\)/);
});
