import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {v20SafeError} from '../lib/v20-safe-error.mjs';

test('V20 mail connection failures preserve numeric HTTP status without server text',()=>{
 const source=readFileSync(new URL('../app/V20Hub.jsx',import.meta.url),'utf8');
 assert.match(source,/error:\{status:r\.status\}/);
 assert.doesNotMatch(source,/error:\{message:body\.error/);
 for(const language of ['it','en','es','fr','de','pt']){
  const message=v20SafeError(language,{status:401,message:'PRIVATE_SERVER_SECRET'});
  assert.ok(message.length>0);
  assert.ok(!message.includes('PRIVATE_SERVER_SECRET'));
 }
});
