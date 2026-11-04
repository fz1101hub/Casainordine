import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {localizeMailApiMessage} from '../lib/mail-api-errors.mjs';
const source=readFileSync(new URL('../app/MailImporter.jsx',import.meta.url),'utf8');

test('legacy mail API errors are localized in six languages',()=>{
 const messages=['Non autorizzato','ID non valido','Casella non trovata','Richiesta non valida.','Ricollega l’account prima di sincronizzare.','Sincronizzazione già eseguita recentemente. Riprova tra 5 minuti.','Scegli una bolletta da associare al pagamento.','Bolletta non trovata.','Questa bolletta è già segnata come pagata.'];
 for(const message of messages){
  const translations=['it','en','es','fr','de','pt'].map(lang=>localizeMailApiMessage(message,lang));
  assert.equal(new Set(translations).size,6,message);
  assert.equal(translations[0],message);
 }
 assert.equal(localizeMailApiMessage('ID non valido.','en'),'Invalid ID');
 assert.equal(localizeMailApiMessage('Errore specifico sconosciuto','de'),'Errore specifico sconosciuto');
 assert.equal(localizeMailApiMessage('Non autorizzato','unknown'),'Non autorizzato');
 assert.equal(localizeMailApiMessage(null,'en'),null);
});

test('mail importer applies translations to API errors using selected language',()=>{
 assert.match(source,/localizeMailApiMessage\(result\.error,language\)/);
 assert.match(source,/const \{t:tr,money,locale,language\}=useLanguage\(\)/);
 assert.match(source,/mailRequest\(client,path,method,payload,tr,language\)/);
});
