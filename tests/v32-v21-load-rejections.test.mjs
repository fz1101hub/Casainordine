import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../app/V21Hub.jsx',import.meta.url),'utf8');

test('V21 catches rejected primary and related data reads without leaking provider messages',()=>{
 const load=source.slice(source.indexOf('const load=useCallback('),source.indexOf('useEffect(()=>{load()}'));
 assert.match(load,/Promise\.all\(keys\.map\(k=>Promise\.resolve\(/);
 assert.match(load,/home_decision_votes[\s\S]*?\.catch\(\(\)=>\(\{data:\[\],error:true\}\)\)/);
 assert.match(load,/home_vacation_shares[\s\S]*?\.catch\(\(\)=>\(\{data:\[\],error:true\}\)\)/);
 assert.match(load,/if\(errors\.length\)onNotify\(errors\.every\(r=>r\.error\?\.code==='42P01'\)\?briefingCopy\.migrationRequired:briefingCopy\.operationFailed\)/);
 assert.doesNotMatch(load,/onNotify\([^)]*\.message/);
});
