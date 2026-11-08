import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../app/V21Hub.jsx',import.meta.url),'utf8');

test('V21 distinguishes missing-table migration errors from other load failures using localized copy',()=>{
  assert.match(source,/if\(errors\.length\)onNotify\(errors\.every\(r=>r\.error\?\.code==='42P01'\)\?briefingCopy\.migrationRequired:briefingCopy\.operationFailed\)/);
  assert.doesNotMatch(source,/briefingCopy\.migrationRequired\s*\+\s*errors\[0\]\.error\.message/);
  assert.doesNotMatch(source,/onNotify\(errors\[0\]\.error\.message\)/);
});
