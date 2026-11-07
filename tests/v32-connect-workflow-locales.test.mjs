import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {translate,LANGUAGES} from '../lib/i18n.mjs';

const page=readFileSync(new URL('../app/page.jsx',import.meta.url),'utf8');
const start=page.indexOf("{tab==='connect'&&");
const end=page.indexOf("{['household','budget'",start);
const section=page.slice(start,end);
const keys=[...section.matchAll(/tr\('connect\.([a-zA-Z]+)'\)/g)].map(match=>match[1]);

test('import/connect flow uses all 35 translated keys',()=>{
 assert.ok(start>=0&&end>start);
 assert.equal(keys.length,35);
 assert.equal(new Set(keys).size,35);
});

test('import/connect copy exists in every supported language',()=>{
 for(const key of keys){
  const italian=translate('it','connect.'+key);
  assert.notEqual(italian,'connect.'+key);
  for(const {code} of LANGUAGES){
   const value=translate(code,'connect.'+key);
   assert.ok(value.trim(),code+' '+key);
   assert.notEqual(value,'connect.'+key,code+' '+key);
   if(code!=='it')assert.notEqual(value,italian,code+' '+key);
  }
 }
});

test('privacy and confirmation statements remain explicit in each language',()=>{
 for(const {code} of LANGUAGES){
  assert.ok(translate(code,'connect.privacy').length>50);
  assert.ok(translate(code,'connect.gmailNotice').length>80);
  assert.ok(translate(code,'connect.keyWarning').length>50);
 }
});
