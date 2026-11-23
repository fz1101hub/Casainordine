// File .ics da scaricare (Impostazioni → «Esporta calendario»), nel browser: stesso formato del
// collegamento (lib/calendar-core.mjs), testi dalla lingua dell'app (t di useLanguage).
// Il 22 novembre la funzione era stata tolta per errore e il pulsante non faceva niente (errore
// «downloadCalendar is not defined»); ora la prova scripts/prove-con-accesso.mjs lo usa e
// tests/funzioni-definite.test.mjs trova le funzioni chiamate ma non importate.
import {buildCalendar,icsStamp} from './calendar-core.mjs';
export function downloadCalendar(bills,filename,t){
 const content=buildCalendar(bills,icsStamp(),(key,params)=>t('calendar.ics.'+key,params));
 const url=URL.createObjectURL(new Blob([content],{type:'text/calendar;charset=utf-8'}));
 const a=document.createElement('a');a.href=url;a.download=`${filename}.ics`;document.body.appendChild(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),1000);
}
