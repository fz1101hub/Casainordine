import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../app/V20Hub.jsx',import.meta.url),'utf8');

test('V20 savings delete action uses translated accessible label',()=>{
  const savings=source.match(/erase\('home_savings_goals',g\.id\)[\s\S]{0,110}/);
  assert.ok(savings,'savings deletion action must exist');
  assert.match(savings[0],/aria-label=\{ui\.deleteLabel\}/);
  assert.doesNotMatch(source,/aria-label="Elimina"/);
});
