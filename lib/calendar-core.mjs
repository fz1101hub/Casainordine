// Calendario .ics delle scadenze, senza dizionario: lo usano il collegamento letto dalle app di
// calendario (lib/calendar.mjs, server) e il file scaricato da Impostazioni (lib/calendar-download.js,
// browser, che non deve scaricare il dizionario intero). I testi arrivano da `t` (chiavi «calendar.ics.*»).
// Formato RFC 5545, provato in tests/calendario.test.mjs con ical.js (la libreria di Thunderbird):
// - righe piegate a 75 byte (CRLF + spazio) senza spezzare lettere accentate o emoji: prima un
//   titolo lungo dava righe di 200 byte, che Outlook e i controlli severi rifiutano;
// - niente caratteri di controllo nei testi (il tab diventa uno spazio);
// - il fuso orario di Roma dichiarato (VTIMEZONE e X-WR-TIMEZONE): così anche un calendario senza
//   scadenze contiene un componente, come chiede la norma;
// - DTSTAMP del momento della lettura (prima una data fissa), ricarica consigliata ogni 6 ore;
// - eventi di giornata intera, «liberi» (TRANSP:TRANSPARENT), con un avviso 3 giorni prima.

const CONTROL=/[\u0000-\u0008\u000b-\u001f\u007f]/g;
function escapeIcs(value) {
 return String(value ?? '').replace(/\t/g,' ').replace(/\r\n|\r/g,'\n').replace(CONTROL,'')
  .replace(/\\/g,'\\\\').replace(/\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,');
}
function dateCompact(iso){if(!/^\d{4}-\d{2}-\d{2}$/.test(iso||''))throw new Error('invalid date');return iso.replaceAll('-','');}
function nextDate(iso){const d=new Date(`${iso}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+1);return d.toISOString().slice(0,10);}
// Momento attuale nel formato di DTSTAMP (UTC): 20261123T180000Z.
export function icsStamp(date=new Date()){return date.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');}

// Piega una riga a 75 byte: le righe seguenti cominciano con uno spazio (che non conta nel testo).
// Si spezza tra un carattere e l'altro (anche le emoji di due unità restano intere).
const utf8Bytes=char=>{const code=char.codePointAt(0);return code<0x80?1:code<0x800?2:code<0x10000?3:4;};
export function foldLine(line){
 const out=[];let current='',size=0,limit=75;
 for(const char of line){
  const bytes=utf8Bytes(char);
  if(size+bytes>limit){out.push(current);current=' ';size=1;}
  current+=char;size+=bytes;
 }
 out.push(current);
 return out.join('\r\n');
}

const ROME=['BEGIN:VTIMEZONE','TZID:Europe/Rome',
 'BEGIN:DAYLIGHT','TZOFFSETFROM:+0100','TZOFFSETTO:+0200','TZNAME:CEST','DTSTART:19700329T020000','RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU','END:DAYLIGHT',
 'BEGIN:STANDARD','TZOFFSETFROM:+0200','TZOFFSETTO:+0100','TZNAME:CET','DTSTART:19701025T030000','RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU','END:STANDARD',
 'END:VTIMEZONE'];

// t(chiave, valori): testo nella lingua di chi legge il calendario (chiavi «calendar.ics.<chiave>»).
// garden: interventi del giardino e dell'orto (lib/garden.mjs, gardenCalendarEvents) e voci del piano
// degli animali (lib/pets.mjs, petCalendarEvents: hanno «pet» al posto di «plant»), eventi di
// giornata intera senza avviso (i promemoria li manda già l'app).
// health: visite e vaccinazioni (lib/health.mjs, healthCalendarEvents): con l'ora sono eventi di un'ora
// nell'ora di Roma; «what» è il titolo, oppure solo il tipo se chi ha il calendario non vuole i dettagli.
export function buildCalendar(bills,stamp,t,garden=[],health=[]) {
 const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Casa in Ordine//IT','CALSCALE:GREGORIAN','METHOD:PUBLISH','X-WR-CALNAME:'+escapeIcs(t('name')),
  'X-WR-TIMEZONE:Europe/Rome','REFRESH-INTERVAL;VALUE=DURATION:PT6H','X-PUBLISHED-TTL:PT6H',...ROME];
 for(const bill of bills.filter(b=>!b.paid_at&& /^\d{4}-\d{2}-\d{2}$/.test(b.due_date))){
   lines.push('BEGIN:VEVENT',`UID:bill-${escapeIcs(bill.id || `${bill.due_date}-${bill.title}`)}@casainordine`, `DTSTAMP:${stamp}`,`DTSTART;VALUE=DATE:${dateCompact(bill.due_date)}`,`DTEND;VALUE=DATE:${dateCompact(nextDate(bill.due_date))}`,`SUMMARY:${escapeIcs(t('summary',{title:bill.title}))}`,`DESCRIPTION:${escapeIcs(t('description',{supplier:bill.supplier||'—',amount:`EUR ${Number(bill.amount||0).toFixed(2)}`}))}`,'TRANSP:TRANSPARENT','BEGIN:VALARM','ACTION:DISPLAY',`DESCRIPTION:${escapeIcs(t('alarm'))}`,'TRIGGER:-P3D','END:VALARM','END:VEVENT');
 }
 for(const event of garden.filter(e=>/^\d{4}-\d{2}-\d{2}$/.test(e?.date||''))){
   lines.push('BEGIN:VEVENT',`UID:${escapeIcs(event.uid)}@casainordine`,`DTSTAMP:${stamp}`,`DTSTART;VALUE=DATE:${dateCompact(event.date)}`,`DTEND;VALUE=DATE:${dateCompact(nextDate(event.date))}`,`SUMMARY:${escapeIcs(event.pet?t('pet',{task:event.task,pet:event.pet}):t('garden',{task:event.task,plant:event.plant}))}`,`DESCRIPTION:${escapeIcs(event.product?t(event.pet?'petDescription':'gardenDescription',{product:event.product}):t(event.pet?'petNoProduct':'gardenNoProduct'))}`,'TRANSP:TRANSPARENT','END:VEVENT');
 }
 for(const event of health.filter(e=>/^\d{4}-\d{2}-\d{2}$/.test(e?.date||''))){
   const timed=/^\d{2}:\d{2}$/.test(event.time||'');
   const start=timed?`DTSTART;TZID=Europe/Rome:${dateCompact(event.date)}T${event.time.replace(':','')}00`:`DTSTART;VALUE=DATE:${dateCompact(event.date)}`;
   const end=timed?'DURATION:PT1H':`DTEND;VALUE=DATE:${dateCompact(nextDate(event.date))}`;
   const what=event.what||t('healthKind.'+(event.kind||'other'));
   lines.push('BEGIN:VEVENT',`UID:${escapeIcs(event.uid)}@casainordine`,`DTSTAMP:${stamp}`,start,end,`SUMMARY:${escapeIcs(t('health',{person:event.person,what}))}`,`DESCRIPTION:${escapeIcs(event.place?t('healthPlace',{place:event.place}):t('healthNoPlace'))}`,'TRANSP:OPAQUE','END:VEVENT');
 }
 lines.push('END:VCALENDAR');
 return lines.map(foldLine).join('\r\n')+'\r\n';
}
