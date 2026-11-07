import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../app/V21Hub.jsx',import.meta.url),'utf8');

test('V21 load failures use localized UI copy instead of raw database error text',()=>{
  assert.match(source,/if\(errors\.length\)onNotify\(briefingCopy\.migrationRequired\)/);
  assert.doesNotMatch(source,/briefingCopy\.migrationRequired\s*\+\s*errors\[0\]\.error\.message/);
});
