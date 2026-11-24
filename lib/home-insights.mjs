// No remote AI or analytics. These deterministic helpers run locally.
export const UNITS={Luce:'kWh',Gas:'Smc',Acqua:'m³'};
const finite=n=>Number.isFinite(Number(n))?Number(n):null;
export function parseLocalNumber(raw){
  let s=String(raw??'').replace(/\s|€/g,'');
  if(!s)return null;
  if(s.includes(',')&&s.includes('.'))s=s.lastIndexOf(',')>s.lastIndexOf('.')?s.replace(/\./g,'').replace(',','.'):s.replace(/,/g,'');
  else if(s.includes(','))s=s.replace(',','.');
  else if(/^\d{1,3}(?:\.\d{3})+$/.test(s))s=s.replace(/\./g,'');
  return /^\d+(?:\.\d+)?$/.test(s)?finite(s):null;
}
export function extractConsumption(text){
  const input=String(text||'').slice(0,160000);
  const found=[];
  const patterns=[
    // No spaces inside the figure: "anno 2025 1.234 kWh" is 1234, not 20251,234.
    {unit:'kWh',re:/(?:consum[oi]|energia (?:fatturata|utilizzata)|totale energia|prelevat[ao])[\s\S]{0,95}?(\d[\d.,]{0,14})\s*(kwh)\b/gi},
    {unit:'Smc',re:/(?:consum[oi]|gas (?:fatturato|naturale)|totale gas)[\s\S]{0,95}?(\d[\d.,]{0,14})\s*(smc)\b/gi},
    {unit:'m³',re:/(?:consum[oi]|acqua (?:fatturata|erogata)|volume consumato)[\s\S]{0,95}?(\d[\d.,]{0,14})\s*(?:m\s*[³3]|metri cubi)(?![a-z0-9])/gi}
  ];
  for(const {unit,re} of patterns){for(const match of input.matchAll(re)){
    const value=parseLocalNumber(match[1]);if(value!==null&&value>0&&value<1000000)found.push({value,unit,context:match[0].replace(/\s+/g,' ').slice(0,120)});
  }}
  const unique=[...new Map(found.map(f=>[`${f.unit}:${f.value}`,f])).values()];
  return {candidates:unique,ambiguous:unique.length!==1,value:unique.length===1?unique[0].value:null,unit:unique.length===1?unique[0].unit:null};
}
export function extractMeterCandidates(text){
  const source=String(text||'');const list=[];
  const re=/(?:lettura\s*(?:attuale|contatore|rilevata)?|numeratore|consumo\s*letto|totalizzatore)[\s:#-]{0,25}(\d{1,8}(?:[.,]\d{1,4})?)/gi;
  for(const match of source.matchAll(re)){const n=parseLocalNumber(match[1]);if(n!==null&&n<=99999999)list.push(n);}
  return [...new Set(list)];
}
function monthIndex(iso){const y=Number(iso?.slice(0,4)),m=Number(iso?.slice(5,7));return y*12+m;}
function monthOf(iso){return typeof iso==='string'?iso.slice(0,7):'';}
const DAY=86_400_000;
// Giorni del periodo di fatturazione mese per mese (estremi compresi), oppure null se il periodo
// manca o non torna (più di 400 giorni, fine prima dell'inizio).
function periodDays(start,end){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(start||'')||!/^\d{4}-\d{2}-\d{2}$/.test(end||''))return null;
  const from=Date.parse(start+'T12:00:00Z'),to=Date.parse(end+'T12:00:00Z');
  if(!Number.isFinite(from)||!Number.isFinite(to)||to<from||(to-from)/DAY>400)return null;
  const parts=new Map();
  for(let t=from;t<=to;t+=DAY){const m=new Date(t).toISOString().slice(0,7);parts.set(m,(parts.get(m)||0)+1);}
  return {total:Math.round((to-from)/DAY)+1,parts};
}
const daysInMonth=month=>new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0)).getUTCDate();
// Consumo mese per mese. Con il periodo di fatturazione il consumo si divide fra i mesi in base ai
// giorni: prima una bolletta bimestrale (settembre-ottobre, 305 kWh) finiva tutta in ottobre e,
// accanto a bollette mensili, sembrava un consumo raddoppiato. Senza periodo vale il mese della
// fine del periodo o della scadenza, come prima.
// Ogni riga: month, unit, value, amount, count e, se tutti i dati del mese hanno il periodo,
// coverage (giorni coperti / giorni del mese): partial se sotto il 90% (mese non ancora completo),
// overlap se sopra il 110% (periodi sovrapposti, per esempio un conguaglio).
export function monthlyConsumption(bills,category){
  const agg=new Map();
  const add=(month,unit,value,amount,days)=>{
    const key=`${month}|${unit}`;
    const row=agg.get(key)||{month,unit,value:0,amount:0,count:0,days:0,known:true};
    row.value+=value;row.amount+=amount;row.count++;
    if(days===null)row.known=false;else row.days+=days;
    agg.set(key,row);
  };
  for(const bill of bills||[]){
    if(category&&bill.category!==category)continue;
    const n=finite(bill.consumption_value);if(n===null||n<0||!bill.consumption_unit)continue;
    const amount=Number(bill.amount)||0,span=periodDays(bill.period_start,bill.period_end);
    if(span){for(const [month,days] of span.parts)add(month,bill.consumption_unit,n*days/span.total,amount*days/span.total,days);continue;}
    const month=monthOf(bill.period_end||bill.due_date);if(!/^\d{4}-\d\d$/.test(month))continue;
    add(month,bill.consumption_unit,n,amount,null);
  }
  return [...agg.values()].sort((a,b)=>a.month.localeCompare(b.month)||a.unit.localeCompare(b.unit)).map(({days,known,...row})=>{
    const out={...row,value:Math.round(row.value*10)/10,amount:Math.round(row.amount*100)/100};
    if(known){const coverage=days/daysInMonth(row.month);out.coverage=Math.round(coverage*100)/100;if(coverage<0.9)out.partial=true;if(coverage>1.1)out.overlap=true;}
    return out;
  });
}
export function consumptionAnomalies(monthly,{threshold=0.35,minHistory=2}={}){
 const results=[];const byUnit=new Map();
 // Mesi incompleti o con periodi sovrapposti non si confrontano e non fanno da storico.
 for(const row of [...(monthly||[])].filter(r=>!r.partial&&!r.overlap).sort((a,b)=>a.month.localeCompare(b.month))){
   const history=byUnit.get(row.unit)||[];
   if(history.length>=minHistory){const sample=history.slice(-6);const avg=sample.reduce((s,r)=>s+r.value,0)/sample.length;
     if(avg>0&&row.value>avg*(1+threshold))results.push({month:row.month,unit:row.unit,value:row.value,average:avg,increasePct:Math.round((row.value/avg-1)*100)});
   }
   history.push(row);byUnit.set(row.unit,history);
 }
 return results;
}
export function expenseForecast(bills,{months=12,anchor='2026-11-01'}={}){
 const completed=[...(bills||[])].filter(b=>b?.due_date&&Number.isFinite(Number(b.amount))&&Number(b.amount)>=0);
 const history=new Map();
 for(const b of completed){const key=(b.supplier||b.title||'').toLowerCase().trim()+'|'+(b.category||'');
   if(!history.has(key))history.set(key,[]);history.get(key).push(b);

 }
 const baseline=[];
 for(const [key,items] of history){const older=items.filter(b=>b.due_date<anchor).sort((a,b)=>a.due_date.localeCompare(b.due_date));
  if(!older.length)continue;
  const last=older.slice(-6);const intervals=older.slice(-5).map((b,i,a)=>i>0?monthIndex(b.due_date)-monthIndex(a[i-1].due_date):null).filter(n=>n!==null&&n>0);
  const cadence=intervals.length?Math.max(1,Math.min(24,Math.round(intervals.reduce((a,b)=>a+b,0)/intervals.length))):null;
  baseline.push({key,avg:last.reduce((s,b)=>s+Number(b.amount),0)/last.length,cadence,lastMonth:monthIndex(older.at(-1).due_date)});
 }
 const forecast=[];
 for(let i=0;i<months;i++){
  const d=new Date(`${anchor.slice(0,7)}-01T12:00:00Z`);d.setUTCMonth(d.getUTCMonth()+i);
  const month=d.toISOString().slice(0,7);const scheduled=completed.filter(b=>monthOf(b.due_date)===month);
  // Do not double-count historical estimates where explicit invoices exist.
  const scheduledSum=scheduled.reduce((s,b)=>s+Number(b.amount),0);
  const scheduledKeys=new Set(scheduled.map(b=>(b.supplier||b.title||'').toLowerCase().trim()+'|'+(b.category||'')));
  const index=monthIndex(month+'-01');
  const estimated=baseline.filter(b=>b.cadence&&index>b.lastMonth&&(index-b.lastMonth)%b.cadence===0&&!scheduledKeys.has(b.key)).reduce((s,b)=>s+b.avg,0);
  forecast.push({month,scheduled:Math.round(scheduledSum*100)/100,estimated:Math.round(estimated*100)/100,total:Math.round((scheduledSum+estimated)*100)/100});
 }
 return {months:forecast,historyRecords:completed.filter(b=>b.due_date<anchor).length};
}
export function cents(value){const n=Number(value);return Number.isFinite(n)&&n>=0?Math.round(n*100):null;}
export function canConfirmReceipt(bill,receipt){return Boolean(bill&&receipt&&bill.id===receipt.bill_id&&!bill.paid_at&&receipt.status==='pending'&&cents(bill.amount)!==null&&cents(receipt.amount)===cents(bill.amount));}
export function dateWithinDays(iso,from,days){if(!/^\d{4}-\d{2}-\d{2}$/.test(iso||'')||!/^\d{4}-\d{2}-\d{2}$/.test(from||''))return false;const diff=(Date.parse(iso+'T12:00:00Z')-Date.parse(from+'T12:00:00Z'))/86400000;return diff>=0&&diff<=days;}
export function csvSafe(value){const str=String(value??'');return /^[=+\-@\t\r]/.test(str)?`'${str}`:str;}
export function serializeCsv(rows,columns){const quote=v=>'"'+csvSafe(v).replace(/"/g,'""')+'"';return [columns.map(c=>quote(c.label)).join(';'),...rows.map(r=>columns.map(c=>quote(r[c.key])).join(';'))].join('\r\n');}
// notice: avviso nella lingua di chi esporta (testo del dizionario «extra.backup.fileNotice»).
export function safeBackup({notice='',bills=[],utilities=[],properties=[],documents=[],meters=[],meterReminders=[],contracts=[],assets=[],receipts=[],events=[]}={}){return {format:'casa-in-ordine-backup',version:2,exported_at:new Date().toISOString(),notice,bills,utilities,properties,documents:documents.map(({storage_path,...d})=>d),meters,meterReminders,contracts,assets,receipts,events};}
