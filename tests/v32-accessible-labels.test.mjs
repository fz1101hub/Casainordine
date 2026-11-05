import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {translate,LANGUAGES} from '../lib/i18n.mjs';

const page=readFileSync(new URL('../app/page.jsx',import.meta.url),'utf8');
const extra=readFileSync(new URL('../app/HomeExtra.jsx',import.meta.url),'utf8');
const keys=['close','closeMenu','signOut','openMenu','selectSpace','reminders','markPaid','noBillsDue','delete','deleteSupplier','deleteUtility','addFirstUtility'];

test('action and accessibility labels exist in all six languages',()=>{
 for(const key of keys){
  const values=LANGUAGES.map(({code})=>translate(code,'ui.'+key));
  assert.ok(values.some(value=>value!==values[0]),'all translations identical for '+key);
  for(const value of values)assert.ok(value.trim()&&value!=='ui.'+key);
 }
});

test('main page and HomeExtra use translated accessible labels',()=>{
 for(const label of ['Chiudi','Chiudi menu','Esci','Apri menu','Seleziona spazio','Promemoria','Segna come pagata','Nessuna bolletta da pagare','Elimina','Elimina fornitore','Elimina utenza','Aggiungi la prima utenza']){
  assert.doesNotMatch(page,new RegExp('(?:aria-label|title)="'+label+'"'));
 }
 assert.doesNotMatch(extra,/title="Elimina"/);
 assert.match(page,/function Toast\(\{message,onClose\}\) \{ const \{t\}=useLanguage\(\)/);
 assert.match(extra,/title=\{tr\('ui.delete'\)\}/);
});
