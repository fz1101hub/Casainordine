import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../app/V21Hub.jsx',import.meta.url),'utf8');

test('V21 invalidates pending loads on effect cleanup',()=>{
 assert.match(source,/const loadSeq=useRef\(0\)/);
 assert.match(source,/useEffect\(\(\)=>\{load\(\);return \(\)=>\{loadSeq\.current\+=1;\}\},\[load\]\)/);
 assert.match(source,/if\(seq!==loadSeq\.current\)return;\s*setRows\(newRows\)/);
});
