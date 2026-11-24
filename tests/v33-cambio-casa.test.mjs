import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

test('Cambio casa: ogni caricamento scarta le risposte superate',()=>{
  for(const [path,setter] of [['app/HomeExtra.jsx','const errors=responses'],['app/V20Hub.jsx','const errorKind=v21LoadErrorKind(res)'],['app/V21Hub.jsx','setRows(newRows)'],['app/HouseholdHub.jsx','const err=[m,e,s,b,sh,v,d]']]){
    const s=source(path);
    assert.match(s,/const loadSeq=useRef\(0\);/,path);
    assert.match(s,/const seq=\+\+loadSeq\.current;/,path);
    const guard=path==='app/V20Hub.jsx'
      ? s.indexOf('if(seq!==loadSeq.current||activeAccount.current!==accountId||activeHome.current!==homeId)return;')
      : s.indexOf('if(seq!==loadSeq.current)return;');
    assert.ok(guard>0&&guard<s.indexOf(setter),path+': controllo prima di usare la risposta');
  }
  const page=source('app/page.jsx');
  assert.match(page,/if \(seq!==dataSeq\.current\) return;/);
  assert.match(page,/if\(seq!==homesSeq\.current\)return;/);
});
test('Cambio casa: la sottoscrizione all’autenticazione non si rifà a ogni cambio e i dati non si caricano due volte',()=>{
  const page=source('app/page.jsx');
  assert.match(page,/return \(\)=>subscription\.unsubscribe\(\);\n  \},\[demo,client\]\);/);
  // Né il rinnovo del token né INITIAL_SESSION (getSession() ha già caricato i dati all'apertura).
  assert.match(page,/if\(event!=='TOKEN_REFRESHED'&&event!=='INITIAL_SESSION'\)setTimeout/);
  assert.ok(page.indexOf('const reloadRef=useRef(reload)')<page.indexOf('client.auth.onAuthStateChange'));
});
test('Cambio casa: con un errore restano i dati della stessa casa, mai quelli di un’altra',()=>{
  const page=source('app/page.jsx');
  assert.match(page,/if \(dataHome\.current===\(activeHomeId\|\|null\)\) return;/);
  assert.match(page,/dataHome\.current=err\?undefined:\(activeHomeId\|\|null\);/);
});
test('Spese condivise: solo le quote delle spese della casa aperta',()=>{
  const s=source('app/HouseholdHub.jsx');
  // Solo le spese di questa casa, a gruppi di 100 id (selectIn: indirizzo sotto il limite di Supabase).
  assert.match(s,/selectIn\(\(part,count\)=>client\.from\('home_expense_shares'\)\.select\('expense_id,user_id,amount'[^)]*\)\.in\('expense_id',part\)[^;]*,expenseIds\)/);
  assert.doesNotMatch(s,/from\('home_expense_shares'\)\.select\('expense_id,user_id,amount'\)\.limit\(1000\)/);
});

test('V20: assenza account svuota i dati in memoria prima di terminare il caricamento',()=>{
  const s=source('app/V20Hub.jsx');
  const start=s.indexOf('if(!client||!accountId){');
  const end=s.indexOf('setLoading(true);',start);
  assert.ok(start>=0&&end>start,'ramo senza sessione presente');
  const branch=s.slice(start,end);
  assert.match(branch,/setRows\(\{goals:\[\],moves:\[\],steps:\[\],notices:\[\],risk:\[\],audit:\[\],recycle:\[\],alerts:\[\],connections:\[\],preferences:null,people:\[\],former:\[\]\}\)/);
  assert.ok(branch.indexOf('setRows(')<branch.indexOf('setLoading(false)'));
});

test('V20: le connessioni email non partono con token assente, account diverso o caricamento superato',()=>{
  const s=source('app/V20Hub.jsx');
  const start=s.indexOf('client.auth.getSession().then(');
  const end=s.indexOf('client.from(\'user_alert_preferences\')',start);
  assert.ok(start>=0&&end>start,'richiesta connessioni presente');
  const request=s.slice(start,end);
  assert.match(request,/seq===loadSeq\.current/);
  assert.match(request,/activeAccount\.current===accountId/);
  assert.match(request,/session\?\.user\?\.id===accountId/);
  assert.match(request,/session\?\.access_token\?fetch\('\/api\/mail\/connections'/);
  assert.match(request,/\{ok:false,status:401,json:async\(\)=>\(\{\}\)\}/);
});
