import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../app/V21Hub.jsx',import.meta.url),'utf8');

test('V21 discards obsolete responses before showing data or localized errors',()=>{
  assert.match(source,/const seq=\+\+loadSeq\.current/);
  assert.match(source,/if\(seq!==loadSeq\.current\)return;\s*const newRows/);
  assert.match(source,/if\(seq!==loadSeq\.current\)return;\s*if\(planIds\.length\)/);
  assert.match(source,/if\(seq!==loadSeq\.current\)return;\s*setRows\(newRows\);setLoading\(false\)/);
  assert.match(source,/useEffect\(\(\)=>\{load\(\);return \(\)=>\{loadSeq\.current\+=1;\}\},\[load\]\)/);
  assert.match(source,/\},\[client,homeId,user\?\.id,language\]\)/);
});
