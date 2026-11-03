import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {missingBillCandidates,billFraudSignals,parsePagoPA,moveChecklist,savingsProjection,mailHealth,addMonthsClamped} from '../lib/v20-core.mjs';
const utility={id:'u1',user_id:'alice',home_id:null,supplier:' Acqua di Roma ',category:'Acqua',active:true,frequency:'bimonthly'};
const bills=[
 {id:'a',user_id:'alice',home_id:null,utility_id:'u1',supplier:'Acqua di Roma',category:'Acqua',source:'manual',is_estimate:false,due_date:'2026-03-10',amount:45},
 {id:'b',user_id:'alice',home_id:null,utility_id:'u1',supplier:'Acqua di Roma',category:'Acqua',source:'document',is_estimate:false,due_date:'2026-05-10',amount:47},
 {id:'c',user_id:'alice',home_id:null,utility_id:'u1',supplier:'Acqua di Roma',category:'Acqua',source:'document',is_estimate:false,due_date:'2026-07-10',amount:49},
];
test('bolletta mancata dopo la tolleranza, non prima',()=>{
 assert.equal(missingBillCandidates([utility],bills,'2026-09-16').length,0);
 const alerts=missingBillCandidates([utility],bills,'2026-09-18');assert.equal(alerts.length,1);
 assert.equal(alerts[0].expected_on,'2026-09-10');assert.equal(alerts[0].days_late,8);
});
test('solo una fattura reale non basta per apprendere periodicità',()=>assert.deepEqual(missingBillCandidates([utility],bills.slice(0,1),'2026-12-01'),[]));
test('fatture stimate non simulano ricezione e non annullano gli avvisi',()=>{
 const estimate={id:'d',user_id:'alice',home_id:null,utility_id:'u1',supplier:'Acqua di Roma',category:'Acqua',due_date:'2026-09-10',source:'recurring',is_estimate:true};
 assert.equal(missingBillCandidates([utility],[...bills,estimate],'2026-09-20').length,1);
});
test('una vera bolletta aggiornata annulla la segnalazione',()=>{
 const next={id:'d',user_id:'alice',home_id:null,utility_id:'u1',supplier:'Acqua di Roma',category:'Acqua',due_date:'2026-09-10',source:'document',is_estimate:false};
 assert.equal(missingBillCandidates([utility],[...bills,next],'2026-09-20').length,0);
});
test('nessuna segnalazione per utenza disattivata o non periodica',()=>{
 assert.equal(missingBillCandidates([{...utility,active:false}],bills,'2026-11-20').length,0);
 assert.equal(missingBillCandidates([{...utility,frequency:'none'}],bills,'2026-11-20').length,0);
});
test('isolamento per account o immobile nel confronto delle utenze',()=>{
 const other={...utility,id:'u2',user_id:'bob',supplier:'Altro'};
 assert.deepEqual(missingBillCandidates([other],bills,'2026-12-01'),[]);
});
test('identici fornitori di utenti diversi non si contaminano',()=>{
 const otherBills=bills.map((b,i)=>({...b,id:'another-'+i,user_id:'bob',home_id:null,utility_id:null,supplier:'Acqua di Roma'}));
 const myUtility={...utility,id:'u99',user_id:'alice'};
 assert.deepEqual(missingBillCandidates([myUtility],otherBills,'2026-11-20'),[]);
});
test('mesi clamped: 31 gennaio + 1 mese',()=>assert.equal(addMonthsClamped('2027-01-31',1),'2027-02-28'));
test('antifrode: tre importi storici e forte anomalia',()=>{
 const historic=[10,12,10].map((amount,i)=>({id:String(i),supplier:'X',category:'Luce',amount,is_estimate:false}));
 const result=billFraudSignals({id:'new',supplier:'X',category:'Luce',amount:85},historic);
 assert.deepEqual(result.flags.map(x=>x.id),['high_amount']);
});
test('antifrode: mittente nuovo, fallimento autenticazione e IBAN differente',()=>{
 const result=billFraudSignals({id:'1',supplier:'X',category:'Gas',amount:30},[],{sender:'no-reply@example.it',senderAuth:'fail',trustedSenders:['ufficiale@example.it'],ibanFingerprint:'new',historicalIbanFingerprints:['old']});
 assert.deepEqual(result.flags.map(x=>x.id),['failed_auth','new_sender','iban_change']);
});
test('antifrode: nessuna conferma automatica, zero risparmi con cronologia insufficiente',()=>{
 const result=billFraudSignals({id:'1',supplier:'X',category:'Gas',amount:500},[{id:'2',supplier:'X',category:'Gas',amount:30}],{});
 assert.equal(result.requiresReview,false);
});
test('lettura pagoPA codice 18 cifre con spazi e CF ente',()=>{
 const x=parsePagoPA('Codice avviso: 3020 1234 5678 9012 34\nCodice fiscale ente creditore: 12345678901');
 assert.equal(x.noticeCode,'302012345678901234');assert.equal(x.creditorCode,'12345678901');
});
test('lettura pagoPA codice 15 cifre',()=>assert.equal(parsePagoPA('IUV: 123456789012345').noticeCode,'123456789012345'));
test('lettura pagoPA ambigua non sceglie un codice a caso',()=>{
 const x=parsePagoPA('Codice avviso 302012345678901234\nCodice avviso 302012345678901235');
 assert.equal(x.noticeCode,null);assert.equal(x.ambiguous,true);
});
test('spostamento: 7 checklist e date intorno al trasloco',()=>{
 const steps=moveChecklist('2026-11-30');assert.equal(steps.length,7);assert.equal(steps[0].due_on,'2026-11-23');assert.equal(steps[4].due_on,'2026-12-07');
});
test('risparmio: quote arrotondate per eccesso e saldo',()=>{
 const p=savingsProjection({targetAmount:125,currentAmount:25,deadline:'2027-02-01',today:'2026-11-01'});
 assert.equal(p.monthly,25);assert.equal(p.progress,20);assert.equal(p.months,4);
});
test('risparmio: accantonato supera il target senza negativi',()=>assert.equal(savingsProjection({targetAmount:10,currentAmount:25,deadline:'2027-02-01',today:'2026-11-01'}).remaining,0));
test('casella mail mai controllata e da ricollegare',()=>{
 assert.equal(mailHealth({status:'reconnect'}).level,'error');
 assert.equal(mailHealth({status:'active'}).level,'warning');
 assert.equal(mailHealth({status:'active',last_sync_at:'2026-11-01T12:00:00Z'},new Date('2026-11-02T12:00:00Z')).level,'ok');
 assert.equal(mailHealth({status:'active',last_sync_at:'2026-10-28T12:00:00Z'},new Date('2026-11-02T12:00:00Z')).level,'warning');
});
test('migrazione isola dati familiari, recupero e notifiche',()=>{
 const migration=readFileSync(new URL('../supabase/migrate_v20.sql',import.meta.url),'utf8');
 assert.match(migration,/enable row level security/);
 assert.match(migration,/public\.v19_can_read\(user_id,home_id\)/);
 assert.match(migration,/public\.v20_restore_deleted/);
 assert.match(migration,/public\.v20_apply_offline_task/);
 assert.match(migration,/public\.v20_register_pagopa/);
 assert.match(migration,/revoke all on public\.home_recycle_bin/);
});
test('IBAN valido da OCR locale, non accetta stringhe non valide',async()=>{
 const {extractItalianIbans}=await import('../lib/v20-core.mjs');
 assert.deepEqual(extractItalianIbans('IBAN: IT60 X05428 11101 00000 0123456'),['IT60X0542811101000000123456']);
 assert.deepEqual(extractItalianIbans('IBAN: IT00 X05428 11101 00000 0123456'),[]);
});
test('preferenze push controllano l’avviso monitoraggio',async()=>{
 const {pushAllowed}=await import('../lib/extra-alerts.mjs');
 const now=new Date('2026-11-02T12:00:00Z');
 assert.equal(pushAllowed({push_monitor:false},'fraud',now),false);
 assert.equal(pushAllowed({push_monitor:true},'missing_bill',now),true);
 assert.equal(pushAllowed({push_monitor:false},'bill',now),true);
});
test('mappa del servizio offline non memorizza credenziali o richieste API',()=>{
 const sw=readFileSync(new URL('../public/sw.js',import.meta.url),'utf8');
 assert.match(sw,/r\.mode==='navigate'/);assert.match(sw,/offline\.html/);
 assert.doesNotMatch(sw,/caches\.put/);
});
test('documento OCR non trasmette IBAN o testo grezzo a servizi esterni',async()=>{
 const {extractBillFields}=await import('../lib/document-import.mjs');
 const x=extractBillFields('ENEL\nTotale da pagare: 99,20 EUR\nScadenza: 21/11/2026\nIBAN: IT60 X05428 11101 00000 0123456');
 assert.equal(x.ibanCandidate,'IT60X0542811101000000123456');
 assert.ok(x.warnings.some(x=>x.includes('IBAN')));
});
