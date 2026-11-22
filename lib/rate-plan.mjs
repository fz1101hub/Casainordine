import { normalizeDate, parseMoney } from './dates.mjs';

// Conservative parser: each proposed instalment must have ONE date and ONE amount
// on the same row. Never infer instalments from a generic total or a previous row.
const DATE_RE=/\b(?:\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{4}|\d{4}-\d{2}-\d{2})\b/g;
const MONEY_RE=/(?:€\s*)?\b\d{1,3}(?:[. ]\d{3})*(?:,\d{2}|\.\d{2})\b|\b\d{1,7}(?:,\d{2}|\.\d{2})\s*€/g;
const CONTEXT=/\b(?:piano\s+rate|riparto|ripartizione|rate\s+condominiali|condominio|rateizzazione|scadenziario\s+rate)\b/i;
const ROW=/\b(?:rata|scadenza|versamento|acconto|saldo|quota)\b/i;
// Le stesse parole nelle altre lingue dell'app (chi incolla un elenco scritto nella propria lingua).
const ROW_OTHER=/(?<!\p{L})(?:instal{1,2}ments?|cuotas?|échéances?|echeances?|raten?|prestaç(?:ão|ões)|prestac(?:ao|oes))(?!\p{L})/iu;
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

// t: traduzione (titoli delle rate e avvisi nella lingua dell'app); senza, restano le chiavi.
export function parseRatePlanText(input,{unitFilter='',t=key=>key}={}) {
  const text=String(input||'').normalize('NFKC').replace(/\u00a0/g,' ');
  const lines=text.split(/\r?\n/).map(x=>x.replace(/[\t ]+/g,' ').trim()).filter(Boolean).slice(0,450);
  const warnings=[], rows=[];
  if(!CONTEXT.test(text.slice(0,15000)))warnings.push(t('rates.warn.notPlan'));
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
    if(!CONTEXT.test(text.slice(0,15000))&&!ROW.test(line)&&!ROW_OTHER.test(line))continue;
    if(CREDIT.test(line)||NEGATIVE_AMOUNT.test(withoutDate)){credits++;continue;}
    // Only textually identical rows are duplicates: "Rata 1 ordinaria" and "Rata 1 straordinaria" are both kept.
    if(seenLines.has(line)){duplicates++;continue;}
    seenLines.add(line);
    const number=line.match(/(?<!\p{L})(?:rata|instal{1,2}ment|cuota|échéance|echeance|rate|prestação|prestacao)\s*(?:n[°º.]?\s*)?(\d{1,3})(?!\d)/iu)?.[1];
    rows.push({selected:true,title:number?t('rates.rowTitle',{number}):t('rates.rowTitlePlain'),due_date,amount:values[0],category:'Condominio',supplier:t('rates.defaultSupplier')});
  }
  const kept=rows.slice(0,MAX_ROWS), overflow=rows.length-kept.length;
  if(ambiguous)warnings.push(t('rates.warn.ambiguous',{count:ambiguous}));
  if(filter&&!rows.length&&excluded)warnings.push(t('rates.warn.noMatch'));
  if(duplicates)warnings.push(t('rates.warn.duplicates',{count:duplicates}));
  if(credits)warnings.push(t('rates.warn.credits',{count:credits}));
  if(overflow)warnings.push(t('rates.warn.overflow',{count:overflow,max:MAX_ROWS}));
  const sameKey=new Map();
  for(const row of kept)sameKey.set(`${row.due_date}:${row.amount}`,(sameKey.get(`${row.due_date}:${row.amount}`)||0)+1);
  if([...sameKey.values()].some(n=>n>1))warnings.push(t('rates.warn.sameDateAmount'));
  // Distinct titles for rates with the same title, date and amount ('Rata condominio 1 (2)'), so
  // that both can be told apart and saved.
  const titles=new Map();
  for(const row of kept){const key=`${row.title}:${row.due_date}:${row.amount}`;const n=(titles.get(key)||0)+1;titles.set(key,n);if(n>1)row.title=`${row.title} (${n})`;}
  if(kept.length<2)warnings.push(t('rates.warn.fewRows'));
  // `discarded`: rows with a date and an amount that were not proposed (duplicates, credits, over the limit).
  return {rows:kept,warnings,discarded:duplicates+credits+overflow};
}

// Chiavi delle rate importate: la prima rata con una certa data e importo mantiene la chiave di
// sempre, le successive uguali ricevono :2, :3… (ordine del piano).
export function rateItemsWithKeys(selected,supplier){
  const seen=new Map();
  return selected.map(r=>{
    const base=`rate:${supplier.toLowerCase().slice(0,60)}:${r.due_date}:${Number(r.amount).toFixed(2)}`;
    const count=(seen.get(base)||0)+1;seen.set(base,count);
    return {title:r.title.trim(),supplier,category:'Condominio',amount:Number(r.amount),due_date:r.due_date,paid_at:null,source:'document',is_estimate:false,
      external_id:count===1?base:`${base}:${count}`};
  });
}
