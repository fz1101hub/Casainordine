import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('V20 reload callback tracks the selected language for translated load errors',()=>{
 const source=readFileSync(new URL('../app/V20Hub.jsx',import.meta.url),'utf8');
 assert.match(source,/const ui=v20UiCopy\(language\)/);
 assert.match(source,/const errorKind=v21LoadErrorKind\(res\)/);
 assert.match(source,/if\(errorKind\)onNotify\(\(errorKind==='migrationRequired'\?ui\.migrationRequired:ui\.operationFailed/);
 assert.match(source,/\},\[client,homeId,user\?\.id,language\]\);/);
 assert.match(source,/useEffect\(\(\)=>\{load\(\)/);
});
