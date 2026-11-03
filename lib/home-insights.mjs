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
    {unit:'kWh',re:/(?:consum[oi]|energia (?:fatturata|utilizzata)|totale energia|prelevat[ao])[\s\S]{0,95}?(\d[\d.,\s]{0,14})\s*(kwh)\b/gi},
    {unit:'Smc',re:/(?:consum[oi]|gas (?:fatturato|naturale)|totale gas)[\s\S]{0,95}?(\d[\d.,\s]{0,14})\s*(smc)\b/gi},
    {unit:'m³',re:/(?:consum[oi]|acqua (?:fatturata|erogata)|volume consumato)[\s\S]{0,95}?(\d[\d.,\s]{0,14})\s*(?:m\s*[³3]|metri cubi)(?![a-z0-9])/gi}
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
export function monthlyConsumption(bills,category){
  const agg=new Map();for(const bill of bills||[]){
    if(category&&bill.category!==category)continue;
    const n=finite(bill.consumption_value);if(n===null||n<0||!bill.consumption_unit)continue;
    const month=monthOf(bill.period_end||bill.due_date);if(!/^\d{4}-\d\d$/.test(month))continue;
    const key=`${month}|${bill.consumption_unit}`;
    const current=agg.get(key)||{month,unit:bill.consumption_unit,value:0,amount:0,count:0};
    current.value+=n;current.amount+=Number(bill.amount)||0;current.count++;agg.set(key,current);
  }
  return [...agg.values()].sort((a,b)=>a.month.localeCompare(b.month));
}
export function consumptionAnomalies(monthly,{threshold=0.35,minHistory=2}={}){
 const results=[];const byUnit=new Map();
 for(const row of [...(monthly||[])].sort((a,b)=>a.month.localeCompare(b.month))){
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
 return {months:forecast,disclaimer:'Stima indicativa: media delle ultime bollette per fornitore dove non esistono scadenze già note. Non è una previsione contrattuale.',historyRecords:completed.filter(b=>b.due_date<anchor).length};
}
export function cents(value){const n=Number(value);return Number.isFinite(n)&&n>=0?Math.round(n*100):null;}
export function canConfirmReceipt(bill,receipt){return Boolean(bill&&receipt&&bill.id===receipt.bill_id&&!bill.paid_at&&receipt.status==='pending'&&cents(bill.amount)!==null&&cents(receipt.amount)===cents(bill.amount));}
export function dateWithinDays(iso,from,days){if(!/^\d{4}-\d{2}-\d{2}$/.test(iso||'')||!/^\d{4}-\d{2}-\d{2}$/.test(from||''))return false;const diff=(Date.parse(iso+'T12:00:00Z')-Date.parse(from+'T12:00:00Z'))/86400000;return diff>=0&&diff<=days;}
export function csvSafe(value){const str=String(value??'');return /^[=+\-@\t\r]/.test(str)?`'${str}`:str;}
export function serializeCsv(rows,columns){const quote=v=>'"'+csvSafe(v).replace(/"/g,'""')+'"';return [columns.map(c=>quote(c.label)).join(';'),...rows.map(r=>columns.map(c=>quote(r[c.key])).join(';'))].join('\r\n');}
export function safeBackup({bills=[],utilities=[],properties=[],documents=[],meters=[],meterReminders=[],contracts=[],assets=[],receipts=[],events=[]}={}){return {format:'casa-in-ordine-backup',version:1,exported_at:new Date().toISOString(),notice:'Solo dati visibili. Non include credenziali né i file binari.',bills,utilities,properties,documents:documents.map(({storage_path,...d})=>d),meters,meterReminders,contracts,assets,receipts,events};}
