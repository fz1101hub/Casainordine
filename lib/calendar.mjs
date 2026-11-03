// One-time .ics export. Importing into a calendar is not an ongoing sync.
function escapeIcs(value) { return String(value ?? '').replace(/\\/g,'\\\\').replace(/\r\n|\r|\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,'); }
function dateCompact(iso){if(!/^\d{4}-\d{2}-\d{2}$/.test(iso||''))throw new Error('Data non valida');return iso.replaceAll('-','');}
function nextDate(iso){const d=new Date(`${iso}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+1);return d.toISOString().slice(0,10);}
export function calendarText(bills,stamp='20261102T000000Z') {
 const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Casa in Ordine//IT','CALSCALE:GREGORIAN','METHOD:PUBLISH','X-WR-CALNAME:Scadenze Casa in Ordine'];
 for(const bill of bills.filter(b=>!b.paid_at&& /^\d{4}-\d{2}-\d{2}$/.test(b.due_date))){
   lines.push('BEGIN:VEVENT',`UID:bill-${escapeIcs(bill.id || `${bill.due_date}-${bill.title}`)}@casainordine`, `DTSTAMP:${stamp}`,`DTSTART;VALUE=DATE:${dateCompact(bill.due_date)}`,`DTEND;VALUE=DATE:${dateCompact(nextDate(bill.due_date))}`,`SUMMARY:${escapeIcs(`Pagamento: ${bill.title}`)}`,`DESCRIPTION:${escapeIcs(`Fornitore: ${bill.supplier||'—'}; Importo: EUR ${Number(bill.amount||0).toFixed(2)}; Controlla nell'app se pagata.`)}`,'BEGIN:VALARM','ACTION:DISPLAY','DESCRIPTION:Verifica se hai pagato','TRIGGER:-P3D','END:VALARM','END:VEVENT');
 }
 lines.push('END:VCALENDAR');
 return lines.join('\r\n')+'\r\n';
}
export function downloadCalendar(bills,filename='scadenze-casa'){
 const content=calendarText(bills,new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,''));
 const url=URL.createObjectURL(new Blob([content],{type:'text/calendar;charset=utf-8'}));
 const a=document.createElement('a');a.href=url;a.download=`${filename}.ics`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
