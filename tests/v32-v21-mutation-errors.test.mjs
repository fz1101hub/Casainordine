import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../app/V21Hub.jsx',import.meta.url),'utf8');

test('V21 database mutation errors do not expose untranslated provider messages',()=>{
 assert.match(source,/catch\(e\)\{onNotify\(briefingCopy\.operationFailed\);return null;\}/);
 assert.doesNotMatch(source,/catch\(e\)\{onNotify\(e\.message\|\|briefingCopy\.operationFailed\)/);
});
