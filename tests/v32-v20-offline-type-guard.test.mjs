import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../app/V20Hub.jsx',import.meta.url),'utf8');

test('V20 offline import rejects unsupported draft types before selecting an RPC',()=>{
 const start=source.indexOf('async function importDraft(d)');
 const end=source.indexOf('function downloadDraft(d)',start);
 assert.ok(start>=0&&end>start,'importDraft function must exist');
 const body=source.slice(start,end);
 const guard=body.indexOf("if(!['task','shopping'].includes(d.type))return onNotify(ui.syncFailed);");
 const rpc=body.indexOf("client.rpc('v20_apply_offline_shopping'");
 assert.ok(guard>=0,'only task and shopping may be imported');
 assert.ok(rpc>guard,'type validation must precede both RPC branches');
 assert.match(body,/if\(d\.type==='shopping'&&\(!homeId\|\|!canWrite\)\)/);
 assert.match(body,/if\(activeAccount\.current!==accountId\)return;/);
});
