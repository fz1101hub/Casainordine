import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../app/V20Hub.jsx',import.meta.url),'utf8');

test('V20 delete confirmation checks account and home before issuing deletion',()=>{
 const start=source.indexOf('async function erase(table,id)');
 const end=source.indexOf('const missing=useMemo',start);
 assert.ok(start>=0&&end>start,'erase handler exists');
 const handler=source.slice(start,end);
 assert.match(handler,/const accountId=user\.id, deletionHomeId=homeId/);
 assert.match(handler,/await askConfirm\(ui\.confirmDelete,\{danger:true\}\)/);
 assert.match(handler,/!sameContext\(\)\)return/);
 assert.ok(handler.indexOf('!sameContext())return')<handler.indexOf('client.from(table).delete()'),'check precedes deletion');
 assert.match(handler,/deletionHomeId\?query\.eq\('home_id',deletionHomeId\):query\.eq\('user_id',accountId\)\.is\('home_id',null\)/);
 assert.match(handler,/if\(!sameContext\(\)\)return;\s*if\(error\)throw error/);
});
