import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../app/V21Hub.jsx',import.meta.url),'utf8');

test('V21 vacation form keeps entered details when save fails',()=>{
 const fn=source.match(/async function createVacation\(e\)\{([^\n]*)\}/)?.[1];
 assert.ok(fn,'createVacation function found');
 assert.match(fn,/const saved=await add\('home_vacation_plans'/);
 assert.match(fn,/if\(saved\)setVacation\(/);
 assert.doesNotMatch(fn,/;setVacation\(/);
});
