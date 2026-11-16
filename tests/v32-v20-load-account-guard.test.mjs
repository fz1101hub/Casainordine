import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../app/V20Hub.jsx',import.meta.url),'utf8');

test('V20 load captures account identity before async requests',()=>{
 assert.match(source,/const accountId=user\?\.id;/);
 assert.match(source,/if\(!client\|\|!accountId\)/);
});

test('V20 ignores async results from previous account before applying rows or notifications',()=>{
 const guard=source.indexOf('if(seq!==loadSeq.current||activeAccount.current!==accountId)return;');
 const notify=source.indexOf('const error=res.find(r=>r.error);',guard);
 const apply=source.indexOf('setRows(next);',guard);
 assert.ok(guard>0&&notify>guard&&apply>guard);
});
