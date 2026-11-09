import { normalizeDate, parseMoney } from './dates.mjs';

// Conservative parser: each proposed instalment must have ONE date and ONE amount
// on the same row. Never infer instalments from a generic total or a previous row.
const DATE_RE=/\b(?:\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{4}|\d{4}-\d{2}-\d{2})\b/g;
const MONEY_RE=/(?:€\s*)?\b\d{1,3}(?:[. ]\d{3})*(?:,\d{2}|\.\d{2})\b|\b\d{1,7}(?:,\d{2}|\.\d{2})\s*€/g;
const CONTEXT=/\b(?:piano\s+rate|riparto|ripartizione|rate\s+condominiali|condominio|rateizzazione|scadenziario\s+rate)\b/i;
const ROW=/\b(?:rata|scadenza|versamento|acconto|saldo|quota)\b/i;
// Summary rows only: "saldo"/"residuo" rows can be real instalments and are kept.
const SUMMARY=/\b(?:totale|riepilogo|somma\s+rate|importo\s+complessivo)\b/i;
// Credit adjustments ("conguaglio a credito", "a vostro favore") or negative amounts are not to pay.
const CREDIT=/\ba\s+(?:vostro\s+|tuo\s+|suo\s+|vs\.?\s+)?credito\b|\b(?:a|in)\s+(?:vostro|tuo|suo)\s+favore\b/i;
// A minus attached to the figure or after the euro sign; a spaced dash is only a separator.
const NEGATIVE_AMOUNT=/(?<![\p{L}\p{N}])[-−–](?:€|EUR\s?)?\d|(?:€|\bEUR\b)\s*[-−–]\s*\d/iu;
const MAX_ROWS=120;
const fold=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('it-IT');
// Whole-word match, case and accent insensitive: "interno 1" ≠ "Interno 10", "Rossi" ≠ "Rossini".
function unitMatcher(unitFilter){
  const words=fold(unitFilter).trim().split(/\s+/).filter(Boolean);
  if(!words.length)return null;
  const phrase=words.map(w=>w.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('\\s+');
  return new RegExp(`(?<![\\p{L}\\p{N}])${phrase}(?![\\p{L}\\p{N}])`,'u');
}

export function parseRatePlanText(input,{unitFilter=''}={}) {
  const text=String(input||'').normalize('NFKC').replace(/\u00a0/g,' ');
  const lines=text.split(/\r?\n/).map(x=>x.replace(/[\t ]+/g,' ').trim()).filter(Boolean).slice(0,450);
  const warnings=[], rows=[];
  if(!CONTEXT.test(text.slice(0,15000)))warnings.push('Non è stato riconosciuto un piano rate condominiale: verifica attentamente il documento.');
  const filter=unitMatcher(unitFilter);
  let ambiguous=0, excluded=0, duplicates=0, credits=0;
  const seenLines=new Set();
  for(const line of lines){
    if(SUMMARY.test(line))continue;
    if(filter && !filter.test(fold(line))){excluded++;continue;}
    const matches=[...line.matchAll(DATE_RE)];
    if(matches.length!==1)continue;
    const due_date=normalizeDate(matches[0][0]);if(!due_date)continue;
    const withoutDate=line.replace(matches[0][0],' ');
    const values=[...withoutDate.matchAll(MONEY_RE)].map(m=>parseMoney(m[0].replace('€','').trim())).filter(x=>Number.isFinite(x)&&x>0&&x<=1000000);
    if(values.length!==1){ambiguous++;continue;}
    if(!CONTEXT.test(text.slice(0,15000))&&!ROW.test(line))continue;
    if(CREDIT.test(line)||NEGATIVE_AMOUNT.test(withoutDate)){credits++;continue;}
    // Only textually identical rows are duplicates: "Rata 1 ordinaria" and "Rata 1 straordinaria" are both kept.
    if(seenLines.has(line)){duplicates++;continue;}
    seenLines.add(line);
    const number=line.match(/\brata\s*(?:n[°º.]?\s*)?(\d{1,3})\b/i)?.[1];
    rows.push({selected:true,title:number?`Rata condominio ${number}`:'Rata condominio',due_date,amount:values[0],category:'Condominio',supplier:'Condominio'});
  }
  const kept=rows.slice(0,MAX_ROWS), overflow=rows.length-kept.length;
  if(ambiguous)warnings.push(`${ambiguous} righe con importi o date ambigui non sono state importate.`);
  if(filter&&!rows.length&&excluded)warnings.push('Nessuna riga corrisponde al nome/interno indicato.');
  if(duplicates)warnings.push(`${duplicates} righe ripetute in modo identico sono state considerate una sola volta.`);
  if(credits)warnings.push(`${credits} righe a credito o con importo negativo non sono state importate come rate da pagare.`);
  if(overflow)warnings.push(`${overflow} rate oltre il limite di ${MAX_ROWS} non sono state importate.`);
  const sameKey=new Map();
  for(const row of kept)sameKey.set(`${row.due_date}:${row.amount}`,(sameKey.get(`${row.due_date}:${row.amount}`)||0)+1);
  if([...sameKey.values()].some(n=>n>1))warnings.push('Alcune rate hanno la stessa data e lo stesso importo: verifica che non siano doppioni prima di salvarle.');
  if(kept.length<2)warnings.push('Sono state trovate meno di due rate: controlla che il documento e la selezione siano corretti.');
  // `discarded`: rows with a date and an amount that were not proposed (duplicates, credits, over the limit).
  return {rows:kept,warnings,discarded:duplicates+credits+overflow};
}
