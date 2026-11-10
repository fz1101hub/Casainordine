import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {v20UiCopy} from '../lib/v20-ui-copy.mjs';

const source=readFileSync(new URL('../app/V20Hub.jsx',import.meta.url),'utf8');

test('saved fraud review status uses translated labels, not raw database codes',()=>{
  assert.match(source,/r\.review_status==='reviewed'\?ui\.reviewedLabel/);
  assert.match(source,/r\.review_status==='suspicious'\?ui\.suspiciousLabel/);
  assert.match(source,/r\.review_status==='pending'\?ui\.reviewRequired/);
  assert.doesNotMatch(source,/\{r\.review_status\}<\/small>/);
  for(const lang of ['it','en','es','fr','de','pt']){
    const ui=v20UiCopy(lang);
    for(const key of ['reviewedLabel','suspiciousLabel','reviewRequired'])
      assert.ok(typeof ui[key]==='string'&&ui[key].trim(),lang+': '+key);
  }
});
