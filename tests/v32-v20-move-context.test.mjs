import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../app/V20Hub.jsx',import.meta.url),'utf8');
const move=source.match(/async function createMove\(e\)\{[\s\S]*?\n async function parseNoticeText/)?.[0]||'';

test('V20 move checklist guards the second write after a context change',()=>{
 assert.ok(move,'createMove handler must exist');
 assert.match(move,/const accountId=user\?\.id,moveHomeId=homeId/);
 assert.match(move,/if\(!plan\|\|!sameContext\(\)\)return/);
 assert.match(move,/if\(!sameContext\(\)\)return;\s*if\(error\)/);
 assert.match(move,/user_id:accountId,home_id:moveHomeId\|\|null,plan_id:plan\.id/);
 assert.match(move,/if\(sameContext\(\)\)setMove/);
});
