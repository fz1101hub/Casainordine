import test from 'node:test';
import assert from 'node:assert/strict';
import { mailStartMessage } from '../lib/mail-api-i18n.mjs';

const cases=[
 ['it-IT','Accedi per collegare una casella.'],
 ['en-GB','Sign in to connect a mailbox.'],
 ['es-ES','Inicia sesión para conectar un buzón.'],
 ['fr-FR','Connectez-vous pour associer une boîte mail.'],
 ['de-DE','Melden Sie sich an, um ein Postfach zu verbinden.'],
 ['pt-PT','Inicie sessão para ligar uma caixa de correio.']
];
test('OAuth start messages use six request locales',()=>{
 for(const [header,expected] of cases){
  assert.equal(mailStartMessage('login',header),expected);
  for(const key of ['provider','rate','failure']){
   const message=mailStartMessage(key,header);
   assert.ok(typeof message==='string'&&message.length>15);
  }
 }
});
test('OAuth errors respect weighted Accept-Language and default to Italian',()=>{
 assert.equal(mailStartMessage('login','fr-FR;q=0.4,en-GB;q=0.9'),cases[1][1]);
 assert.equal(mailStartMessage('login','xx-XX'),cases[0][1]);
 assert.equal(mailStartMessage('login','en;q=0'),cases[0][1]);
 assert.equal(mailStartMessage('unknown','en'),mailStartMessage('failure','en'));
});

const syncKeys=['syncLogin','syncId','syncMissing','syncReconnect','syncRate'];
test('mailbox sync API has localized messages for six languages',()=>{
 for(const [header] of cases){
  for(const key of syncKeys){
   const value=mailStartMessage(key,header);
   assert.ok(value.length>5, `${header}: ${key}`);
   assert.notEqual(value,mailStartMessage('failure',header));
  }
 }
 assert.equal(mailStartMessage('syncId','en-GB'),'Invalid ID');
 assert.equal(mailStartMessage('syncId','xx-XX'),'ID non valido');
 assert.equal(mailStartMessage('syncId','fr-FR;q=0.3,de-DE;q=0.9'),'Ungültige ID');
});
