import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

test('Cambio casa: ogni caricamento scarta le risposte superate',()=>{
  for(const [path,setter] of [['app/HomeExtra.jsx','const errors=responses'],['app/V20Hub.jsx','const error=res.find'],['app/V21Hub.jsx','setRows(newRows)'],['app/HouseholdHub.jsx','const err=[m,e,s,b,sh,v,d]']]){
    const s=source(path);
    assert.match(s,/const loadSeq=useRef\(0\);/,path);
    assert.match(s,/const seq=\+\+loadSeq\.current;/,path);
    const guard=s.indexOf('if(seq!==loadSeq.current)return;');
    assert.ok(guard>0&&guard<s.indexOf(setter),path+': controllo prima di usare la risposta');
  }
  const page=source('app/page.jsx');
  assert.match(page,/if \(seq!==dataSeq\.current\) return;/);
  assert.match(page,/if\(seq!==homesSeq\.current\)return;/);
});
test('Cambio casa: la sottoscrizione all’autenticazione non si rifà a ogni cambio e i dati non si caricano due volte',()=>{
  const page=source('app/page.jsx');
  assert.match(page,/return \(\)=>subscription\.unsubscribe\(\);\n  \},\[demo,client\]\);/);
  assert.match(page,/if\(event!=='TOKEN_REFRESHED'\)setTimeout/);
  assert.ok(page.indexOf('const reloadRef=useRef(reload)')<page.indexOf('client.auth.onAuthStateChange'));
});
test('Cambio casa: con un errore restano i dati della stessa casa, mai quelli di un’altra',()=>{
  const page=source('app/page.jsx');
  assert.match(page,/if \(dataHome\.current===\(activeHomeId\|\|null\)\) return;/);
  assert.match(page,/dataHome\.current=err\?undefined:\(activeHomeId\|\|null\);/);
});
test('Spese condivise: solo le quote delle spese della casa aperta',()=>{
  const s=source('app/HouseholdHub.jsx');
  assert.match(s,/from\('home_expense_shares'\)\.select\('expense_id,user_id,amount'\)\.in\('expense_id',expenseIds\)/);
  assert.doesNotMatch(s,/from\('home_expense_shares'\)\.select\('expense_id,user_id,amount'\)\.limit\(1000\)/);
});
