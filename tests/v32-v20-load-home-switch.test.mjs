import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../app/V20Hub.jsx',import.meta.url),'utf8');

test('V20 async load discards responses from a previous account or home',()=>{
 const load=source.slice(source.indexOf('const load=useCallback('),source.indexOf('useEffect(()=>{load();}'));
 assert.match(load,/const accountId=user\?\.id/);
 assert.match(load,/if\(seq!==loadSeq\.current\|\|activeAccount\.current!==accountId\|\|activeHome\.current!==homeId\)return;/);
 assert.ok(load.indexOf('activeHome.current!==homeId')<load.indexOf('setRows(next)'), 'guard must precede applying fetched rows');
});
