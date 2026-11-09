import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const page=source('app/page.jsx'),v21=source('app/V21Hub.jsx'),v20=source('app/V20Hub.jsx'),push=source('app/PushSettings.jsx'),css=source('app/globals.css');

test('Uscita: dopo SIGNED_OUT la pagina si ricarica e non resta nulla dell’account precedente',()=>{
  assert.match(page,/if\(event==='SIGNED_OUT'\)\{window\.location\.replace\('\/'\);return;\}/);
  assert.doesNotMatch(page,/onClick=\{\(\)=>client\.auth\.signOut\(\)\}/);
  assert.equal((page.match(/onClick=\{signOut\}/g)||[]).length,2);
});
test('Uscita: solo questo dispositivo, anche senza rete, e niente più notifiche dell’account uscito',()=>{
  const fn=page.match(/async function signOut\(\)\{([\s\S]*?)\n  \}/)?.[1];
  assert.ok(fn,'signOut esiste');
  assert.match(fn,/signOut\(\{scope:'local'\}\)/);
  assert.match(fn,/localStorage\.removeItem/);
  assert.match(fn,/method:'DELETE'[\s\S]*\/api\/push\/subscribe|\/api\/push\/subscribe[\s\S]*method:'DELETE'/);
  assert.match(fn,/subscription\.unsubscribe\(\)/);
  assert.ok(fn.indexOf('unsubscribe')<fn.indexOf("signOut({scope:'local'})"),'prima le notifiche, poi l’uscita (serve ancora il token)');
});
test('Notifiche: risultano attive solo se l’iscrizione del browser è dell’account corrente',()=>{
  assert.match(push,/subscriptions\.some\(x=>x\.endpoint===subscription\.endpoint\)/);
  assert.match(push,/if\(existing&&enabled\)/);
});
test('QR: il salto alla scheda dell’oggetto avviene una sola volta',()=>{
  assert.match(page,/const assetHandled=useRef\(false\)/);
  assert.match(page,/if\(!client\|\|!user\|\|assetHandled\.current\)return;/);
  assert.match(page,/assetHandled\.current=true;/);
});
test('Voti: nessun upsert (servirebbe il permesso di modificare decision_id e user_id)',()=>{
  const fn=v21.match(/async function vote\(decisionId,choice\)\{([\s\S]*?)briefingCopy\.voteSaved\);\}/)?.[1];
  assert.ok(fn);
  assert.doesNotMatch(fn,/\.upsert\(/);
  assert.match(fn,/first\.error\?\.code!=='23505'/);
  assert.match(fn,/\.update\(\{choice\}\)\.eq\('decision_id',decisionId\)\.eq\('user_id',user\.id\)/);
});
test('Moduli V21: si svuotano solo dopo un salvataggio riuscito; l’inventario dimentica foto e oggetto',()=>{
  assert.match(v21,/const saved=await add\('home_inventory_items'[\s\S]*?if\(saved\)setInventory\(s=>\(\{\.\.\.s,name:'',serial_number:'',estimated_value:'0',notes:'',document_id:'',asset_id:''\}\)\)/);
  assert.match(v21,/const saved=await add\('home_decisions'[\s\S]*?if\(saved\)setDecision\(/);
});
test('V20: lo stato delle caselle arriva dall’API, non dalla tabella con le credenziali',()=>{
  assert.doesNotMatch(v20,/from\('mail_connections'\)/);
  assert.match(v20,/fetch\('\/api\/mail\/connections'/);
});
test('Stampa: la regola di HomeExtra non nasconde più le etichette QR di V21',()=>{
  assert.match(css,/\.extra-main:has\(>\.extra-print-only\)>div:not\(\.extra-print-only\)\{display:none!important\}/);
  assert.doesNotMatch(css,/@media print\{\.extra-main>div:not\(\.extra-print-only\)/);
});
