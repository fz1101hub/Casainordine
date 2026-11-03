import test from 'node:test';
import assert from 'node:assert/strict';
import {parseSenderEmail,senderDomain,reportedAuthentication,canLearnSender,senderHint,gmailLearnedSenderQuery,recordConfirmedBillSender,loadPersonalSenders} from '../lib/mail-senders.mjs';
import {likelyBillDocument} from '../lib/mail-core.mjs';
const confirmed=[{sender_email:'fatture@fornitore-energia.it',sender_domain:'fornitore-energia.it',supplier:'Fornitore Energia',auth_state:'reported_pass'}];

test('extracts real RFC-like From address rather than display name, rejects ambiguous strings',()=>{
  assert.equal(parseSenderEmail('"Servizio Bollette" <Fatture@Fornitore-Energia.IT>'),'fatture@fornitore-energia.it');
  assert.equal(senderDomain('"Servizio Bollette" <Fatture@Fornitore-Energia.IT>'),'fornitore-energia.it');
  assert.equal(parseSenderEmail('"Enel" <fake@gmail.com>, <also@evil.it>'),null);
  assert.equal(parseSenderEmail('"Enel" <fake@evil.it> another@evil.it'),null);
  assert.equal(parseSenderEmail('falso@example.it\r\nAuthentication-Results: dmarc=pass'),null);
});
test('never learns personal webmail senders or messages with reported DMARC failure',()=>{
  assert.equal(canLearnSender('amica@gmail.com','Enel Energia'),false);
  assert.equal(canLearnSender('utente@outlook.com','Luce'),false);
  assert.equal(canLearnSender('fatture@fornitore-energia.it','Luce','reported_fail'),false);
  assert.equal(canLearnSender('fatture@fornitore-energia.it','Fornitore Energia','unknown'),true);
});
test('reads provider-reported aligned DMARC, never treats unrelated or IMAP headers as verified',()=>{
  const header=[{name:'Authentication-Results',value:'mx.google.com; dkim=pass header.i=@fornitore-energia.it; spf=pass smtp.mailfrom=fornitore-energia.it; dmarc=pass (p=REJECT) header.from=fornitore-energia.it'}];
  assert.equal(reportedAuthentication(header,'fatture@fornitore-energia.it','gmail'),'reported_pass');
  assert.equal(reportedAuthentication(header,'fatture@other.it','gmail'),'unknown');
  assert.equal(reportedAuthentication(header,'fatture@fornitore-energia.it','imap'),'unknown');
  assert.equal(reportedAuthentication([{name:'Authentication-Results',value:'evil.test; dmarc=pass header.from=fornitore-energia.it'}],'fatture@fornitore-energia.it','gmail'),'unknown');
  assert.equal(reportedAuthentication([{name:'Authentication-Results',value:'mx.google.com; dmarc=fail header.from=fornitore-energia.it'}],'fatture@fornitore-energia.it','gmail'),'reported_fail');
});
test('exact learned sender allows generic pdf to be candidate, but cannot override junk or payment receipt',()=>{
  assert.equal(likelyBillDocument({subject:'Documento di novembre',sender:'fatture@fornitore-energia.it',filenames:['documento.pdf'],learnedSenders:confirmed}),true);
  assert.equal(likelyBillDocument({subject:'Documento di novembre',sender:'scammer@fornitore-energia.it',filenames:['documento.pdf'],learnedSenders:confirmed}),false);
  assert.equal(likelyBillDocument({subject:'Ricevuta pagamento effettuato',sender:'fatture@fornitore-energia.it',filenames:['ricevuta.pdf'],learnedSenders:confirmed}),false);
  assert.equal(likelyBillDocument({subject:'Newsletter esclusiva',sender:'fatture@fornitore-energia.it',filenames:['documento.pdf'],learnedSenders:confirmed}),false);
  assert.equal(likelyBillDocument({subject:'Documento',sender:'fatture@fornitore-energia.it',filenames:['logo.png'],learnedSenders:confirmed}),false);
  assert.equal(likelyBillDocument({subject:'Documento',sender:'fatture@fornitore-energia.it',filenames:['documento.pdf'],learnedSenders:confirmed,senderAuth:'reported_fail'}),false);
});
test('domain hints need aligned reported authentication and a unique supplier; payments are unaffected',()=>{
  assert.deepEqual(senderHint(confirmed,'fatture@fornitore-energia.it'),{supplier:'Fornitore Energia',match:'exact'});
  assert.equal(senderHint(confirmed,'altro@fornitore-energia.it'),null);
  assert.deepEqual(senderHint(confirmed,'altro@fornitore-energia.it','reported_pass'),{supplier:'Fornitore Energia',match:'domain'});
  assert.equal(senderHint([...confirmed,{sender_email:'x@fornitore-energia.it',sender_domain:'fornitore-energia.it',supplier:'Un altro'}],'new@fornitore-energia.it','reported_pass'),null);
});
test('Gmail learned query only includes valid exact non-personal addresses',()=>{
  const q=gmailLearnedSenderQuery([...confirmed,{sender_email:'utente@gmail.com'},confirmed[0],{sender_email:'x@example.it) OR is:spam'}]);
  assert.equal(q,'has:attachment newer_than:35d {from:fatture@fornitore-energia.it}');
});
test('personal record storage uses owner id and only a confirmed supplier from the bill',async()=>{
  const ops=[];
  const admin={from(table){assert.equal(table,'mail_bill_senders');return {
    upsert:async(data,options)=>{ops.push({data,options});return {error:null};},
    select(){return {eq(field,value){ops.push({filter:field,value});return this;},order(){return this;},limit:async()=>({data:confirmed,error:null})};}
  };}};
  const learned=await recordConfirmedBillSender(admin,{userId:'owner-one',document:{sender:'"Bolletta" <fatture@fornitore-energia.it>',suggestion:{sender_auth:'reported_pass'}},bill:{supplier:'Fornitore Energia'}});
  assert.equal(learned.learned,true);
  assert.equal(ops[0].data.user_id,'owner-one');
  assert.equal(ops[0].data.sender_email,'fatture@fornitore-energia.it');
  assert.equal(ops[0].data.supplier,'Fornitore Energia');
  assert.equal(ops[0].options.onConflict,'user_id,sender_email,supplier_key');
  await loadPersonalSenders(admin,'owner-two');
  assert.deepEqual(ops[1],{filter:'user_id',value:'owner-two'});
});
