import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mailStartMessage } from '../lib/mail-api-i18n.mjs';

const locales=['it','en','es','fr','de','pt'];
test('sender errors have distinct translations for all supported languages',()=>{
  for(const key of ['sendersLoad','sendersId','sendersRemove']){
    const messages=locales.map(locale=>mailStartMessage(key,locale));
    assert.equal(new Set(messages).size,6,key);
    for(const message of messages)assert.ok(message.length>8);
    assert.equal(mailStartMessage(key,'xx'),messages[0]);
    assert.equal(mailStartMessage(key,'de;q=0.9,en;q=0.4'),messages[4]);
  }
});
test('sender endpoints use localized errors and preserve user scoping',()=>{
  const src=readFileSync(new URL('../app/api/mail/senders/route.js',import.meta.url),'utf8');
  for(const key of ['sendersLoad','sendersId','sendersRemove','connectionsLogin'])
    assert.ok(src.includes("mailStartMessage('"+key+"'"),key);
  assert.ok((src.match(/\.eq\('user_id',user\.id\)/g)||[]).length>=2);
  assert.ok(src.includes(".eq('id',id)"));
});
