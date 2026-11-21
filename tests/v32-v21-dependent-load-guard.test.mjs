import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// Regression contract: changing home/account while votes load must not start a shares read.
test('V21 rejects stale vote responses before requesting vacation shares',()=>{
 const source=readFileSync(new URL('../app/V21Hub.jsx',import.meta.url),'utf8');
 const votes=source.indexOf("client.from('home_decision_votes')");
 const guard=source.indexOf('if(seq!==loadSeq.current)return;',votes);
 const shares=source.indexOf("client.from('home_vacation_shares')",votes);
 assert.ok(votes>=0&&guard>votes&&shares>guard,'stale guard must separate vote and shares queries');
});
