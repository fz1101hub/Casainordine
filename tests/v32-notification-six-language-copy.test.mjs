import test from 'node:test';
import assert from 'node:assert/strict';
import {billReminderCopy} from '../lib/notification-copy.mjs';

// These are recipient-facing email strings, not UI-only dictionary keys.
// Guard all six languages against accidental Italian fallback or mixed register.
const expected={
 it:{subject:'Promemoria scadenza bolletta',footer:'Apri Casa in Ordine per verificare i dettagli.'},
 en:{subject:'Bill due reminder',footer:'Open Casa in Ordine to review the details.'},
 es:{subject:'Recordatorio de vencimiento',footer:'Abre Casa in Ordine para consultar los detalles.'},
 fr:{subject:'Rappel d’échéance de facture',footer:'Ouvrez Casa in Ordine pour vérifier les détails.'},
 de:{subject:'Erinnerung an Rechnungsfälligkeit',footer:'Öffne Casa in Ordine, um die Details zu prüfen.'},
 pt:{subject:'Lembrete de vencimento da fatura',footer:'Abra Casa in Ordine para consultar os detalhes.'}
};
test('recipient email subjects and footers stay in the selected language',()=>{
 for(const [language,{subject,footer}] of Object.entries(expected)){
  const result=billReminderCopy({language,name:'Energia',dueDate:'2026-12-31'});
  assert.equal(result.subject,subject,language);
  assert.ok(result.text.endsWith('\n\n'+footer),language);
  assert.equal(result.text.split('\n').length,3,language);
  assert.match(result.text,/Energia/,language);
 }
});
test('recipient language variants keep the correct localized email subject and footer',()=>{
 for(const [language,{subject,footer}] of Object.entries(expected)){
  for(const variant of [language.toUpperCase(),language+'-XX',language.toUpperCase()+'_XX']){
   const result=billReminderCopy({language:variant,name:'Energia',dueDate:'2026-12-31'});
   assert.equal(result.subject,subject,variant);
   assert.ok(result.text.endsWith(footer),variant);
  }
 }
});
