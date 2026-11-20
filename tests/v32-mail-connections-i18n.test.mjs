import test from 'node:test';
import assert from 'node:assert/strict';
import {mailStartMessage} from '../lib/mail-api-i18n.mjs';

const languages=['it','en','es','fr','de','pt'];
const keys=['connectionsLogin','connectionsLoad','connectionsProvider','connectionsDatabase','connectionsRate','connectionsLimit','connectionsLog','connectionsSave','connectionsConnect','connectionsDisconnect','connectionsGoogle','connectionsMicrosoft','connectionsImap'];
test('mailbox connection API messages are present for all six languages',()=>{
  for(const key of keys){
    const values=languages.map(lang=>mailStartMessage(key,lang));
    for(const value of values)assert.ok(typeof value==='string'&&value.trim().length>0,key);
    assert.equal(new Set(values).size,6,key);
    assert.equal(mailStartMessage(key,'xx'),values[0]);
  }
});
test('mailbox connection messages honor Accept-Language preferences',()=>{
  assert.equal(mailStartMessage('connectionsLogin','fr-FR, en;q=0.5'),mailStartMessage('connectionsLogin','fr'));
  assert.equal(mailStartMessage('connectionsLogin','de;q=0.2, pt-PT;q=0.9'),mailStartMessage('connectionsLogin','pt'));
});
