// Calendario .ics delle scadenze per il collegamento letto dalle app di calendario (solo server).
// Formato e regole in lib/calendar-core.mjs; qui i testi nella lingua di chi ha creato il collegamento.
import {translate} from './i18n.mjs';
import {buildCalendar,icsStamp,foldLine} from './calendar-core.mjs';
export {icsStamp,foldLine};
export function calendarText(bills,stamp=icsStamp(),language='it',garden=[],health=[],extra=[]) {
 // Il tipo di documento («passport») diventa il suo nome nella lingua del calendario.
 // Scadenze fiscali: la chiave («730») diventa il nome della scadenza, con l'anno.
 const t=(key,params)=>translate(language,'calendar.ics.'+key,params&&params.taxKey?{...params,what:translate(language,'taxes.cal.deadline.'+params.taxKey,{year:params.year})}
  :params&&params.kind?{...params,what:params.what||translate(language,'iddocs.kind.'+params.kind)}:params);
 return buildCalendar(bills,stamp,t,garden,health,extra);
}
