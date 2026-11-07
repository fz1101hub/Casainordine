import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../app/V21Hub.jsx',import.meta.url),'utf8');

test('V21 data reload uses current language for database error messages',()=>{
 assert.match(source,/const \{money,date:formatDate,locale,language\}=useLanguage\(\)/);
 assert.match(source,/if\(errors\.length\)onNotify\(briefingCopy\.migrationRequired\)/);
 assert.doesNotMatch(source,/onNotify\(briefingCopy\.migrationRequired\+errors\[0\]\.error\.message\)/);
 assert.match(source,/\},\[client,homeId,user\?\.id,language\]\)/);
});
