import test from 'node:test';
import assert from 'node:assert/strict';
import { extractPaymentEvidence, matchOutstandingBill, gmailMessageText, supplierMatches, senderAddress } from '../lib/payment-recognition.mjs';
import { processPaymentMessage } from '../lib/payment-sync.mjs';
const receipt={
  subject:'Ricevuta di pagamento bolletta Enel Energia',
  sender:'"Amministrazione Enel" <ricevute@enel.it>',
  text:'Gentile cliente, abbiamo ricevuto il pagamento della tua bolletta Enel Energia. Importo pagato: € 87,50.',
  receivedAt:'2026-11-02T10:00:00.000Z'
};
const bill={id:'bill1',user_id:'user1',supplier:'Enel Energia',amount:87.50,due_date:'2026-11-17',paid_at:null};
test('Reads explicit confirmation of an exact euro amount and sender',()=>{
  const x=extractPaymentEvidence(receipt);
  assert.equal(x.amount,87.5);
  assert.equal(x.sender,'ricevute@enel.it');
  assert.equal(x.billContext,true);
  assert.equal(matchOutstandingBill(x,[bill]),bill);
});
test('Does not read a reminder, failed payment, pending or unsolicited request as paid',()=>{
  for(const text of [
    'La bolletta Enel Energia è da pagare: € 87,50. Questo è un avviso di pagamento.',
    'Conferma: il pagamento non riuscito, importo € 87,50.',
    'Ricevuta di pagamento: pagamento in attesa, € 87,50.',
    'Pagamento fallito. € 87,50.',
    'Non abbiamo ricevuto il pagamento della bolletta Enel Energia. Importo € 87,50.',
    'Pagamento è stato effettuato? La bolletta Enel Energia è di € 87,50',
    'Il pagamento non è stato effettuato. € 87,50',
    'Il pagamento era stato effettuato ma è stato stornato. € 87,50'
  ])assert.equal(extractPaymentEvidence({...receipt,subject:'Bolletta Enel Energia',text}),null);
});
test('Rejects emails with several different amounts, absent amounts or sender',()=>{
  assert.equal(extractPaymentEvidence({...receipt,text:'Pagamento ricevuto, Enel Energia. Importo € 70,20 e commissione € 1,50'}),null);
  assert.equal(extractPaymentEvidence({...receipt,text:'Pagamento ricevuto, Enel Energia.'}),null);
  assert.equal(extractPaymentEvidence({...receipt,sender:''}),null);
});
test('Does not match different amount, wrong supplier or ambiguous matching bills',()=>{
  const x=extractPaymentEvidence(receipt);
  assert.equal(matchOutstandingBill(x,[{...bill,amount:87.51}]),null);
  assert.equal(matchOutstandingBill(x,[{...bill,supplier:'Iren Mercato'}]),null);
  assert.equal(matchOutstandingBill(x,[bill,{...bill,id:'bill2'}]),null);
  assert.equal(matchOutstandingBill(x,[{...bill,due_date:'2025-02-02'}]),null);
});
test('Decodes Gmail plain text with nested MIME and ignores the HTML fallback',()=>{
  const b=s=>Buffer.from(s).toString('base64url');
  const payload={parts:[{mimeType:'text/html',body:{data:b('<p>Testo HTML</p>')}},{mimeType:'multipart/mixed',parts:[{mimeType:'text/plain',body:{data:b(receipt.text)}}]}]};
  assert.match(gmailMessageText(payload),/abbiamo ricevuto/);
});
test('Rejects untrusted personal sender and lacks supplier matching for generic names',()=>{
  assert.equal(senderAddress('fake sender'),null);
  assert.equal(supplierMatches('Acqua',receipt),false);
  assert.equal(supplierMatches('Enel Energia',receipt),true);
});

test('Service creates review candidate but NEVER automatically marks an invoice without user opt-in',async()=>{
  const operations={updates:[],inserted:[]};
  const mock={from(table){
    const q={
      eq(){return this;},is(){return this;},gte(){return this;},lte(){return this;},
      select(){return this;},
      limit:async()=>({data:table==='bills'?[bill]:[],error:null}),
      maybeSingle:async()=>({data:table==='mail_payment_evidence'?(q.inserted?{id:'evidence1'}:null):table==='profiles'?{auto_confirm_payments:false}:null,error:null}),
      upsert(input){this.inserted=true;operations.inserted.push({table,input});return this;},
      update(input){operations.updates.push({table,input});return this;},
      then(resolve){return Promise.resolve({error:null}).then(resolve);}
    };
    return q;
  }};
  const result=await processPaymentMessage(mock,{id:'connection1',user_id:'user1'},{...receipt,messageId:'gmail-123'});
  assert.equal(result,'pending');
  assert.equal(operations.inserted.length,1);
  assert.equal(operations.inserted[0].table,'mail_payment_evidence');
  assert.equal(operations.inserted[0].input.bill_id,'bill1');
  assert.equal(operations.updates.length,0);
});

test('Auto-confirmation requires BOTH opt-in AND trust for the exact sender and supplier',async()=>{
  async function run(optIn,hasTrust){
    const events={updates:[],receipts:[]};
    const admin={from(table){
      const q={inserted:false,ops:[],select(){return this;},eq(field,value){this.ops.push(['eq',field,value]);return this;},is(){return this;},gte(){return this;},lte(){return this;},
        limit:async()=>({data:table==='bills'?[bill]:[],error:null}),
        maybeSingle:async()=>({data:table==='profiles'?{auto_confirm_payments:optIn}:table==='mail_payment_trusted_senders'?(hasTrust?{id:'trust1'}:null):table==='mail_payment_evidence'?(q.inserted?{id:'evidence1'}:null):table==='bills'?{id:'bill1'}:null,error:null}),
        upsert(row){this.inserted=true;events.receipts.push(row);return this;},
        update(patch){events.updates.push({table,patch});return this;},
        then(done){return Promise.resolve({error:null}).then(done);}
      };return q;
    }};
    const outcome=await processPaymentMessage(admin,{id:'connection1',user_id:'user1'},{...receipt,messageId:'different-message'});
    return {outcome,events};
  }
  const withoutOptIn=await run(false,true);
  assert.equal(withoutOptIn.outcome,'pending');assert.equal(withoutOptIn.events.updates.length,0);
  const withoutTrust=await run(true,false);
  assert.equal(withoutTrust.outcome,'pending');assert.equal(withoutTrust.events.updates.length,0);
  const approved=await run(true,true);
  assert.equal(approved.outcome,'auto_confirmed');
  assert.deepEqual(approved.events.updates.map(x=>x.table),['bills','mail_payment_evidence']);
});

test('a subject claiming payment does not turn a request-to-pay into evidence',()=>{
  const text='Per completare il pagamento della bolletta Enel Energia, clicca qui. Importo € 87,50';
  assert.equal(extractPaymentEvidence({...receipt,text}),null);
});
test('a subject-only receipt is not eligible for auto-payment without body confirmation',()=>{
  const x=extractPaymentEvidence({...receipt,text:'La tua bolletta Enel Energia è disponibile. Importo € 87,50.'});
  assert.ok(x);assert.equal(x.autoEligible,false);
});
test('an explicit confirmation in the body can qualify for opt-in automatic reconciliation',()=>{
  const x=extractPaymentEvidence(receipt);
  assert.equal(x.autoEligible,true);
});
