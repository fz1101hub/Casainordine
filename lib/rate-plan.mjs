import { normalizeDate, parseMoney } from './dates.mjs';

// Conservative parser: each proposed instalment must have ONE date and ONE amount
// on the same row. Never infer instalments from a generic total or a previous row.
const DATE_RE=/\b(?:\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{4}|\d{4}-\d{2}-\d{2})\b/g;
const MONEY_RE=/(?:€\s*)?\b\d{1,3}(?:[. ]\d{3})*(?:,\d{2}|\.\d{2})\b|\b\d{1,7}(?:,\d{2}|\.\d{2})\s*€/g;
const CONTEXT=/\b(?:piano\s+rate|riparto|ripartizione|rate\s+condominiali|condominio|rateizzazione|scadenziario\s+rate)\b/i;
const ROW=/\b(?:rata|scadenza|versamento|acconto|saldo|quota)\b/i;

export function parseRatePlanText(input,{unitFilter=''}={}) {
  const text=String(input||'').normalize('NFKC').replace(/\u00a0/g,' ');
  const lines=text.split(/\r?\n/).map(x=>x.replace(/[\t ]+/g,' ').trim()).filter(Boolean).slice(0,450);
  const warnings=[], rows=[];
  if(!CONTEXT.test(text.slice(0,15000)))warnings.push('Non è stato riconosciuto un piano rate condominiale: verifica attentamente il documento.');
  const filter=String(unitFilter).trim().toLocaleLowerCase('it-IT');
  let ambiguous=0, excluded=0;
  for(const line of lines){
    if(/\b(?:totale|riepilogo|somma\s+rate|residuo|importo\s+complessivo)\b/i.test(line))continue;
    if(filter && !line.toLocaleLowerCase('it-IT').includes(filter)){excluded++;continue;}
    const matches=[...line.matchAll(DATE_RE)];
    if(matches.length!==1)continue;
    const due_date=normalizeDate(matches[0][0]);if(!due_date)continue;
    const withoutDate=line.replace(matches[0][0],' ');
    const values=[...withoutDate.matchAll(MONEY_RE)].map(m=>parseMoney(m[0].replace('€','').trim())).filter(x=>Number.isFinite(x)&&x>0&&x<=1000000);
    if(values.length!==1){ambiguous++;continue;}
    if(!CONTEXT.test(text.slice(0,15000))&&!ROW.test(line))continue;
    const number=line.match(/\brata\s*(?:n[°º.]?\s*)?(\d{1,3})\b/i)?.[1];
    rows.push({selected:true,title:number?`Rata condominio ${number}`:'Rata condominio',due_date,amount:values[0],category:'Condominio',supplier:'Condominio'});
  }
  if(ambiguous)warnings.push(`${ambiguous} righe con importi o date ambigui non sono state importate.`);
  if(filter&&!rows.length&&excluded)warnings.push('Nessuna riga corrisponde al nome/interno indicato.');
  const unique=[];const seen=new Set();
  for(const row of rows){const key=`${row.due_date}:${row.amount}`;if(!seen.has(key)){seen.add(key);unique.push(row);}}
  if(unique.length<2)warnings.push('Sono state trovate meno di due rate: controlla che il documento e la selezione siano corretti.');
  return {rows:unique.slice(0,120),warnings};
}
