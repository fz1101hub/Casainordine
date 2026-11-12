import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {v20UiCopy} from '../lib/v20-ui-copy.mjs';

const source=readFileSync(fileURLToPath(new URL('../app/V20Hub.jsx',import.meta.url)),'utf8');
test('V20 offline document download fallback uses translated label',()=>{
 assert.match(source,/a\.download=d\.title\|\|ui\.documentLabel/);
 assert.doesNotMatch(source,/a\.download=d\.title\|\|'documento'/);
 for(const language of ['it','en','es','fr','de','pt']){
  assert.ok(v20UiCopy(language).documentLabel.trim());
 }
 assert.notEqual(v20UiCopy('it').documentLabel,v20UiCopy('en').documentLabel);
});
