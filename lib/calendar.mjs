// Calendario .ics delle scadenze (feed letto dalle app di calendario, solo server).
import {translate} from './i18n.mjs';
function escapeIcs(value) { return String(value ?? '').replace(/\\/g,'\\\\').replace(/\r\n|\r|\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,'); }
function dateCompact(iso){if(!/^\d{4}-\d{2}-\d{2}$/.test(iso||''))throw new Error('invalid date');return iso.replaceAll('-','');}
function nextDate(iso){const d=new Date(`${iso}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+1);return d.toISOString().slice(0,10);}
// language: lingua di chi legge il calendario (testi nel dizionario, chiavi «server.calendar.*»).
export function calendarText(bills,stamp='20261102T000000Z',language='it') {
 const t=(key,params)=>translate(language,'server.calendar.'+key,params);
 const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Casa in Ordine//IT','CALSCALE:GREGORIAN','METHOD:PUBLISH','X-WR-CALNAME:'+escapeIcs(t('name'))];
 for(const bill of bills.filter(b=>!b.paid_at&& /^\d{4}-\d{2}-\d{2}$/.test(b.due_date))){
   lines.push('BEGIN:VEVENT',`UID:bill-${escapeIcs(bill.id || `${bill.due_date}-${bill.title}`)}@casainordine`, `DTSTAMP:${stamp}`,`DTSTART;VALUE=DATE:${dateCompact(bill.due_date)}`,`DTEND;VALUE=DATE:${dateCompact(nextDate(bill.due_date))}`,`SUMMARY:${escapeIcs(t('summary',{title:bill.title}))}`,`DESCRIPTION:${escapeIcs(t('description',{supplier:bill.supplier||'—',amount:`EUR ${Number(bill.amount||0).toFixed(2)}`}))}`,'BEGIN:VALARM','ACTION:DISPLAY',`DESCRIPTION:${escapeIcs(t('alarm'))}`,'TRIGGER:-P3D','END:VALARM','END:VEVENT');
 }
 lines.push('END:VCALENDAR');
 return lines.join('\r\n')+'\r\n';
}
