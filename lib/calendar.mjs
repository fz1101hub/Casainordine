// Calendario .ics delle scadenze per il collegamento letto dalle app di calendario (solo server).
// Formato e regole in lib/calendar-core.mjs; qui i testi nella lingua di chi ha creato il collegamento.
import {translate} from './i18n.mjs';
import {buildCalendar,icsStamp,foldLine} from './calendar-core.mjs';
export {icsStamp,foldLine};
export function calendarText(bills,stamp=icsStamp(),language='it',garden=[]) {
 return buildCalendar(bills,stamp,(key,params)=>translate(language,'calendar.ics.'+key,params),garden);
}
