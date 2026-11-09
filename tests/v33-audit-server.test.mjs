import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { OAUTH_COOKIE, oauthStateCookie, clearOauthStateCookie, readCookie, sameSecret, browserBinding, mailboxMatchesAccount } from '../lib/oauth-binding.mjs';

const source=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

test('OAuth: il cookie di collegamento è HttpOnly, SameSite=Lax, limitato al callback e di 10 minuti',()=>{
  const prev=process.env.APP_URL;
  try{
    process.env.APP_URL='https://casa.example';
    const c=oauthStateCookie('abc');
    assert.match(c,new RegExp(`^${OAUTH_COOKIE}=abc;`));
    for(const part of ['Path=/api/mail/callback','Max-Age=600','HttpOnly','SameSite=Lax','Secure'])assert.ok(c.includes(part),part);
    assert.match(clearOauthStateCookie(),/Max-Age=0/);
  }finally{if(prev===undefined)delete process.env.APP_URL;else process.env.APP_URL=prev;}
});

test('OAuth: il ritorno è accettato solo dal browser che ha avviato il collegamento',()=>{
  const state='s'.repeat(43);
  assert.equal(browserBinding(`a=1; ${OAUTH_COOKIE}=${state}`,state),'bound');
  assert.equal(browserBinding(`${OAUTH_COOKIE}=${'x'.repeat(43)}`,state),'mismatch');
  assert.equal(browserBinding(`${OAUTH_COOKIE}=short`,state),'mismatch');
  assert.equal(browserBinding('a=1',state),'missing');
  assert.equal(browserBinding(null,state),'missing');
  assert.equal(readCookie(' x = 1 ; y=2','y'),'2');
  assert.equal(sameSecret('',''),false);
});

test('OAuth senza cookie: solo la casella con lo stesso indirizzo verificato dell’account',()=>{
  const user={email:'Anna@Gmail.com',email_confirmed_at:'2026-11-01T10:00:00Z'};
  assert.equal(mailboxMatchesAccount(user,'anna@gmail.com'),true);
  assert.equal(mailboxMatchesAccount(user,'vittima@gmail.com'),false);
  assert.equal(mailboxMatchesAccount({...user,email_confirmed_at:null},'anna@gmail.com'),false);
  assert.equal(mailboxMatchesAccount(null,'anna@gmail.com'),false);
});

test('OAuth: start imposta il cookie e il callback lo verifica e lo cancella',()=>{
  const start=source('app/api/mail/start/route.js'),callback=source('app/api/mail/callback/route.js');
  assert.match(start,/'Set-Cookie':oauthStateCookie\(state\)/);
  assert.match(callback,/browserBinding\(request\.headers\.get\('cookie'\),state\)/);
  assert.match(callback,/binding==='mismatch'\)return redirect\('other_browser'\)/);
  assert.match(callback,/mailboxMatchesAccount\(account\?\.user,email\)/);
  assert.match(callback,/'Set-Cookie':clearOauthStateCookie\(\)/);
  // Il cookie va verificato prima di salvare la casella.
  assert.ok(callback.indexOf("binding==='missing'")<callback.indexOf("from('mail_connections').upsert"));
});

// --- Conferma automatica dei pagamenti da email ---
import { processPaymentMessage } from '../lib/payment-sync.mjs';
import { canEditBill } from '../lib/home-access.mjs';

const receipt={subject:'Ricevuta di pagamento bolletta Enel Energia',sender:'"Enel" <ricevute@enel.it>',
  text:'Gentile cliente, abbiamo ricevuto il pagamento della tua bolletta Enel Energia. Importo pagato: € 87,50.',receivedAt:'2026-11-02T10:00:00.000Z'};
function mockAdmin({bills,role=null}){
  const events={updates:[],queries:[]};
  const admin={from(table){
    const q={inserted:false,select(){return this;},eq(f,v){events.queries.push([table,f,v]);return this;},is(){return this;},gte(){return this;},lte(){return this;},
      limit:async()=>({data:table==='bills'?bills:[],error:null}),
      maybeSingle:async()=>({data:table==='profiles'?{auto_confirm_payments:true}:table==='mail_payment_trusted_senders'?{id:'t1'}:
        table==='mail_payment_evidence'?(q.inserted?{id:'e1'}:null):table==='home_members'?(role?{role}:null):table==='bills'?{id:bills[0].id}:null,error:null}),
      upsert(){this.inserted=true;return this;},update(patch){events.updates.push({table,patch});return this;},
      then(done){return Promise.resolve({error:null}).then(done);}};
    return q;}};
  return {admin,events};
}
const ownBill={id:'b1',user_id:'u1',home_id:null,supplier:'Enel Energia',amount:87.5,due_date:'2026-11-17',paid_at:null};

test('Pagamenti: senza DMARC verificato da Gmail/Outlook nessuna conferma automatica',async()=>{
  for(const senderAuth of [undefined,'unknown','reported_fail',async()=>'unknown',async()=>{throw new Error('headers');}]){
    const {admin,events}=mockAdmin({bills:[ownBill]});
    assert.equal(await processPaymentMessage(admin,{id:'c1',user_id:'u1'},{...receipt,messageId:'m1',senderAuth}),'pending');
    assert.equal(events.updates.length,0);
  }
  const {admin,events}=mockAdmin({bills:[ownBill]});
  assert.equal(await processPaymentMessage(admin,{id:'c1',user_id:'u1'},{...receipt,messageId:'m1',senderAuth:async()=>'reported_pass'}),'auto_confirmed');
  assert.deepEqual(events.updates.map(x=>x.table),['bills','mail_payment_evidence']);
});

test('Pagamenti: in una casa condivisa la conferma automatica richiede ancora il ruolo di editor',async()=>{
  const homeBill={...ownBill,home_id:'h1'};
  for(const [role,expected] of [[null,'pending'],['viewer','pending'],['editor','auto_confirmed'],['owner','auto_confirmed']]){
    const {admin}=mockAdmin({bills:[homeBill],role});
    assert.equal(await processPaymentMessage(admin,{id:'c1',user_id:'u1'},{...receipt,messageId:'m1',senderAuth:'reported_pass'}),expected,String(role));
  }
});

test('Pagamenti: canEditBill e la route di conferma manuale controllano casa e ruolo',async()=>{
  const {admin}=mockAdmin({bills:[ownBill],role:'viewer'});
  assert.equal(await canEditBill(admin,ownBill,'u1'),true);
  assert.equal(await canEditBill(admin,{...ownBill,user_id:'altro'},'u1'),false);
  assert.equal(await canEditBill(admin,{...ownBill,home_id:'h1'},'u1'),false);
  const route=source('app/api/mail/payments/route.js');
  assert.match(route,/canEditBill\(admin,bill,user\.id\)/);
  assert.ok(route.indexOf('canEditBill(admin,bill')<route.indexOf(".update({paid_at:receipt.received_at})"));
  const sync=source('lib/payment-sync.mjs');
  assert.doesNotMatch(sync,/is\('paid_at',null\)\.gte/,'le bollette pagate servono per riconoscere le ricevute vecchie');
  assert.match(source('lib/mail-google.mjs'),/senderAuth:reportedAuthentication\(headers,head\('from'\),'gmail'\)/);
  assert.match(source('lib/mail-microsoft.mjs'),/senderAuth:paymentSenderAuth/);
});

// --- Cron ---
import { cronAuthorized } from '../lib/server.mjs';
test('Cron: segreto confrontato a tempo costante su entrambe le route',()=>{
  const req=h=>({headers:{get:()=>h}});
  assert.equal(cronAuthorized(req('Bearer segreto'),'segreto'),true);
  assert.equal(cronAuthorized(req('Bearer segretO'),'segreto'),false);
  assert.equal(cronAuthorized(req('Bearer segreto2'),'segreto'),false);
  assert.equal(cronAuthorized(req(null),'segreto'),false);
  assert.equal(cronAuthorized(req('Bearer '),''),false);
  for(const path of ['app/api/cron/route.js','app/api/mail/cron/route.js']){
    const s=source(path);
    assert.match(s,/cronAuthorized\(request/,path);
    assert.doesNotMatch(s,/authorization'\)\s*!==/,path);
  }
});
test('Cron promemoria: l’email va solo a chi è ancora membro della casa',()=>{
  const s=source('app/api/cron/route.js');
  assert.match(s,/isHomeMember\(admin,bill\.home_id,bill\.user_id\)/);
  assert.ok(s.indexOf('isHomeMember(admin,bill.home_id')<s.indexOf("admin.from('reminders').upsert"));
});
test('Cron email: rotazione sull’ultimo tentativo, anche fallito, con limite di tempo',()=>{
  const s=source('app/api/mail/cron/route.js');
  assert.match(s,/order\('last_attempt_at',\{ascending:true,nullsFirst:true\}\)/);
  assert.match(s,/update\(\{last_attempt_at:new Date\(\)\.toISOString\(\)\}\)/);
  assert.ok(s.indexOf('last_attempt_at:new Date')<s.indexOf('await syncConnection('),'il tentativo si registra prima di sincronizzare');
  assert.match(s,/Date\.now\(\)-started>40_000/);
  // Se la migrazione v3.3 non è ancora stata eseguita resta il comportamento precedente.
  assert.match(s,/order\('last_sync_at',\{ascending:true,nullsFirst:true\}\)\.limit\(8\)/);
  assert.match(source('app/api/mail/sync/route.js'),/data\.last_attempt_at/);
  assert.match(source('supabase/migrate_v33_audit.sql'),/add column if not exists last_attempt_at timestamptz/);
});
