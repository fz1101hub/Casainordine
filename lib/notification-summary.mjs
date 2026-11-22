// Testi nel dizionario unico (chiavi «server.summary.*»); la frase concorda con il numero di bollette.
import {translate,normalizeLanguage,formatDate,formatMoney} from './i18n.mjs';
export function billSummaryCopy({language='it',today,bills=[]}={}){
 const lang=normalizeLanguage(language);
 if(formatDate(today,lang)==='—'||!/^\d{4}-\d{2}-\d{2}$/.test(today))throw new TypeError('Invalid summary date');
 if(!Array.isArray(bills)||!bills.length)throw new TypeError('Missing summary bills');
 const total=bills.reduce((sum,b)=>{
  const raw=b.amount;
  if(typeof raw!=='number' && (typeof raw!=='string'||!raw.trim()))throw new TypeError('Invalid bill amount');
  const amount=Number(raw);
  if(!Number.isFinite(amount)||amount<0||formatMoney(raw,lang)==='—')throw new TypeError('Invalid bill amount');
  if(formatDate(b.due_date,lang)==='—'||!/^\d{4}-\d{2}-\d{2}$/.test(b.due_date))throw new TypeError('Invalid bill date');
  const next=sum+amount;
  if(!Number.isFinite(next)||formatMoney(next,lang)==='—')throw new TypeError('Invalid summary total');
  return next;
 },0);
 const word=key=>translate(lang,'server.summary.'+key);
 return {subject:word('subject')+' ('+today.slice(0,7)+')',heading:word('heading'),description:`${bills.length} ${word(bills.length===1?'countOne':'count')} ${formatMoney(total,lang)}.`,openLabel:word('open'),
  rows:bills.map(b=>({title:String(b.title||''),supplier:String(b.supplier||''),date:formatDate(b.due_date,lang),amount:formatMoney(Number(b.amount),lang)}))};
}
