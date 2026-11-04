import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

for(const file of ['v20-alerts.mjs','extra-alerts.mjs']){
 test(file+' skips push when preference lookup fails',()=>{
  const source=readFileSync(new URL('../lib/'+file,import.meta.url),'utf8');
  assert.match(source,/error:prefError/);
  assert.match(source,/if\(prefError\)\{counts\.errors\.push\(/);
  assert.match(source,/prefError\.message\);continue;/);
 });
}
