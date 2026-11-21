import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../app/V20Hub.jsx',import.meta.url),'utf8');
test('V20 invalidates pending reads when language, account or home changes and on unmount',()=>{
 assert.match(source,/const loadSeq=useRef\(0\)/);
 assert.match(source,/const seq=\+\+loadSeq\.current/);
 assert.match(source,/seq!==loadSeq\.current\|\|activeAccount\.current!==accountId\|\|activeHome\.current!==homeId/);
 assert.match(source,/useEffect\(\(\)=>\{load\(\);return \(\)=>\{loadSeq\.current\+=1;draftSeq\.current\+=1;\}\},\[load\]\)/);
 assert.match(source,/\[client,homeId,user\?\.id,language\]/);
});
