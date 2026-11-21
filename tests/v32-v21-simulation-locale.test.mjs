import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../app/V21Hub.jsx',import.meta.url),'utf8');

test('V21 simulation month count uses the active locale formatter',()=>{
 assert.match(source,/\{formatCount\(result\.months\)\}\s*\{briefingCopy\.monthsSuffix\}/);
 assert.doesNotMatch(source,/\{result\.months\}\s*\{briefingCopy\.monthsSuffix\}/);
});
