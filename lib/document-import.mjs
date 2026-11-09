import { normalizeDate, parseMoney } from './dates.mjs';
import { extractItalianIbans } from './v20-core.mjs';

// Deterministic extraction only: no cloud AI and no automatic bill/payment approval.
const DATE = /\b(?:\d{1,2}[/.\-]\d{1,2}[/.\-]\d{4}|\d{4}-\d{2}-\d{2})\b/g;
const NUMBER = /(?<!\d)(?:\d{1,3}(?:[. ]\d{3})+|\d{1,7})[.,]\d{2}(?!\d)/g;
// After the euro sign the figure must end there: "€ 1234,56" is never cut to 123.
const CURRENCY_NUMBER = /(?:€|\bEUR\b)\s*(\d{1,3}(?:[. ]\d{3})*(?:[,.]\d{2})?|\d{1,7}(?:[,.]\d{2})?)(?!\d|[.,]\d)|((?:\d{1,3}(?:[. ]\d{3})*|\d{1,7})(?:[,.]\d{2})?)\s*(?:€|\bEUR\b)/gi;
// "Scadenza" in any form ("Data scadenza:", "Scadenza -", "Scadenza pagamento") beats a generic "entro il".
const DUE_LABELS = [
  /\b(?:data\s+(?:di\s+)?)?scadenza\b/i,
  /\b(?:da\s+pagare\s+entro|pagare\s+entro|pagamento\s+entro|entro\s+il|termine\s+(?:di\s+)?pagamento)\b/i
];
// Deadlines for complaints, self-reading, withdrawal or cancellation are never the bill due date.
const NEAR_NON_DUE = /\b(?:reclam[oi]|autolettur[ae]|recess[oi]|disdett[ae]|ripensament[oi])\b/i;
const AMOUNT_LABELS = [
  /\b(?:totale\s+(?:da\s+)?pagare|importo\s+da\s+pagare|somma\s+da\s+pagare|totale\s+da\s+versare|importo\s+del\s+pagamento)\b/i,
  /\b(?:totale\s+(?:della\s+)?bolletta|totale\s+fattura|importo\s+totale|saldo\s+da\s+pagare|totale\s+dovuto|totale\s+documento)\b/i,
  /\b(?:da\s+pagare|importo\s+dovuto|importo\s+bolletta|importo\s+fattura)\b/i
];
const NON_DUE = /\b(?:scadenza\s+(?:dell['’]?offerta|contratto|promozione|precedente|passata)|scadenza\s+(?:per\s+)?il\s+reclamo|gi[aà]\s+scadut[ao]|data\s+emissione|data\s+fattura)\b/i;
const NON_TOTAL = /\b(?:subtotal[ei]?|subtotale|imponibile|sconto|acconto|rata\s+precedente|gi[aà]\s+pagat[ao]|importo\s+pagato|rimborso|credito\s+residuo|storn[oi]|costo\s+unitario)\b/i;
// VAT lines ("IVA 10%", "IVA su…", "Totale IVA", a line starting with IVA), not "IVA inclusa/compresa".
const VAT_LINE = /^\W*iva\b(?!\s+(?:inclus|compres))|\biva\s*(?:al\s*)?\d{1,2}(?:[.,]\d{1,2})?\s*%|\biva\s+(?:su|sul|sulla|sui|sugli|sulle)\b|\b(?:totale|importo|aliquota|imposta)\s+iva\b(?!\s+(?:inclus|compres))/i;
const notTotalLine = line => NON_TOTAL.test(line) || VAT_LINE.test(line);
// Credit notes and amounts in the customer's favour are never an amount to pay.
const CREDIT_DOC = /^(?:tipo\s+(?:di\s+)?documento\s*[:\-]?\s*)?nota\s+(?:di\s+)?credito\b|\bTD04\b/im;
const CREDIT_LINE = /\ba\s+(?:vostro\s+|tuo\s+|suo\s+|vs\.?\s+)?credito\b|\b(?:a|in)\s+(?:vostro|tuo|suo)\s+favore\b/i;
// A minus attached to the figure or after the euro sign; a spaced dash is only a separator.
const NEGATIVE_AMOUNT = /(?<![\p{L}\p{N}])[-−–](?:€|EUR\s?)?\d|(?:€|\bEUR\b)\s*[-−–]\s*\d/iu;
const isCreditText = text => CREDIT_LINE.test(text) || NEGATIVE_AMOUNT.test(text.replace(DATE, ' '));

export function cleanOcrText(text){
  // OCR frequently inserts NBSP, zero-width spaces and very wide whitespace.
  return String(text||'').normalize('NFKC').replace(/[\u200b-\u200d\ufeff]/g,'')
    .replace(/\u00a0/g,' ').replace(/[ \t]+/g,' ').replace(/\r\n?/g,'\n');
}
function cleanLines(text) {return cleanOcrText(text).split('\n').map(l=>l.trim()).filter(Boolean).slice(0,2500);}
function amountsIn(line){
  const values=[];
  const masked=line.replace(DATE,' '); // Never interpret dd/mm/yyyy as a monetary amount.
  for(const match of masked.matchAll(CURRENCY_NUMBER)){
    const value=parseMoney(String(match[1]||match[2]).replace(/\s/g,''));
    if(Number.isFinite(value)&&value>0&&value<=1_000_000)values.push(value);
  }
  // Only decimal numbers without a currency symbol can be selected under a strong label.
  if(!values.length){
    for(const match of masked.matchAll(NUMBER)){
      const value=parseMoney(match[0].replace(/\s/g,''));
      if(Number.isFinite(value)&&value>0&&value<=1_000_000)values.push(value);
    }
  }
  return [...new Set(values)];
}
function datesIn(text){return [...text.matchAll(DATE)].map(x=>normalizeDate(x[0])).filter(Boolean);}
// Dates after `from` whose clause does not mention a complaint/self-reading/withdrawal deadline.
// The clause before a date stops at the previous date or at . ; · | ! ?; with `checkAfter` the words
// right after the date count too ("entro il 31/12/2026 per reclami").
function dueDatesIn(line,from,checkAfter){
  const masked=line.replace(DATE,m=>'#'.repeat(m.length)),values=[];
  let previousEnd=0;
  for(const match of line.matchAll(DATE)){
    const start=match.index,end=start+match[0].length;
    if(start>=from){
      const before=masked.slice(Math.max(previousEnd,start-70),start).split(/[.;·|!?]/).pop();
      const after=checkAfter?masked.slice(end,end+40).split(/[.;·|!?,(#]|\s[-–—]\s/)[0]:'';
      const value=normalizeDate(match[0]);
      if(value&&!NEAR_NON_DUE.test(before)&&!NEAR_NON_DUE.test(after))values.push(value);
    }
    previousEnd=end;
  }
  return values;
}
function chooseCandidates(candidates){
  if(!candidates.length)return {value:null,ambiguous:false};
  const score=Math.min(...candidates.map(c=>c.rank));
  const values=[...new Set(candidates.filter(c=>c.rank===score).map(c=>c.value))];
  return {value:values.length===1?values[0]:null,ambiguous:values.length>1};
}
function findDate(lines){
  const found=[];
  for(let rank=0;rank<DUE_LABELS.length;rank++){
    for(let i=0;i<lines.length;i++){
      const line=lines[i],match=line.match(DUE_LABELS[rank]);
      if(!match||NON_DUE.test(line))continue;
      const from=match.index+match[0].length;
      let dates=dueDatesIn(line,from,rank>0);
      // Don't steal the invoice issue date from before the due-date label.
      if(!dates.length&&!datesIn(line.slice(from)).length&&!NEAR_NON_DUE.test(line)){
        for(let j=i+1;j<=i+2&&j<lines.length;j++){
          if(lines[j].length>55||NON_DUE.test(lines[j])||NEAR_NON_DUE.test(lines[j]))break;
          dates=datesIn(lines[j]);if(dates.length)break;
        }
      }
      found.push(...dates.map(value=>({value,rank})));
    }
  }
  const result=chooseCandidates(found);
  if(result.value===null)return result;
  // The highest priority wins, but a different date under the next priority is flagged.
  const ranks=[...new Set(found.map(c=>c.rank))].sort((a,b)=>a-b);
  const conflict=ranks.length>1&&found.some(c=>c.rank===ranks[1]&&c.value!==result.value);
  return {value:result.value,ambiguous:conflict};
}
function findAmount(lines){
  const found=[];
  for(let rank=0;rank<AMOUNT_LABELS.length;rank++){
    for(let i=0;i<lines.length;i++){
      const line=lines[i],match=line.match(AMOUNT_LABELS[rank]);
      if(!match||notTotalLine(line))continue;
      let amounts=amountsIn(line.slice(match.index+match[0].length)),source=line;
      if(!amounts.length&&lines[i+1]?.length<=45&&!notTotalLine(lines[i+1])){amounts=amountsIn(lines[i+1]);source=`${line}\n${lines[i+1]}`;}
      const credit=amounts.length>0&&isCreditText(source);
      found.push(...amounts.map(value=>({value,rank,credit})));
    }
  }
  return {...chooseCandidates(found),credit:found.some(c=>c.credit)};
}
function findSupplier(lines){
  for(let i=0;i<Math.min(lines.length,80);i++){
    const m=lines[i].match(/^(?:fornitore|societ[aà]\s+emittente|gestore|emessa\s+da|emittente)\s*[:\-]\s*(.+)$/i);
    if(m&&m[1].length>2&&m[1].length<110)return m[1].replace(/[\s.,;]+$/,'').trim();
  }
  const excluded=/^(?:fattura|bolletta|fattura elettronica|pagina|numero|dettaglio|riepilogo|spett\.?le|cliente|data|codice|periodo|totale|importo|pagamento|scadenza|consumi|intestatario|fornitura|indirizzo|documento|gentile|servizio|sede|iva\b|p\.iva|pec\b|www\.|tel\b|telefono|contratto|avviso|ricevuta|\d)/i;
  return (lines.slice(0,12).find(line=>line.length>=4&&line.length<=65&&!excluded.test(line)&&/[a-zàèéìòù]/i.test(line))||'').trim();
}
function findCategory(text){
  const t=text.toLowerCase();
  if(/\b(energia elettrica|elettricità|elettrica|kwh|pod\b|luce)\b/i.test(t))return 'Luce';
  if(/\b(gas naturale|smc\b|pdr\b|metano|gas)\b/i.test(t))return 'Gas';
  if(/\b(idrico|acquedotto|servizio idrico|consumo acqua|fognatura)\b/i.test(t))return 'Acqua';
  if(/\b(fibra|adsl|banda larga|connessione internet|ftth|internet)\b/i.test(t))return 'Internet';
  if(/\b(telefonia|linea mobile|cellulare|telefono)\b/i.test(t))return 'Telefono';
  if(/\b(tari|rifiuti|tassa rifiuti)\b/i.test(t))return 'Rifiuti';
  if(/\b(condominio|condominiali|amministratore condominiale)\b/i.test(t))return 'Condominio';
  if(/\b(canone locazione|affitto|rata mutuo|mutuo)\b/i.test(t))return 'Affitto / Mutuo';
  if(/\b(polizza|assicurazione|premio assicurativo)\b/i.test(t))return 'Assicurazione';
  return 'Altro';
}
function classifyDocument(text){
  const content=cleanOcrText(text).slice(0,12000);
  if(/\b(?:quietanza\s+(?:di\s+)?pagamento|ricevuta\s+di\s+pagamento|pagamento\s+(?:riuscito|eseguito|effettuato|confermato|ricevuto))\b/i.test(content)&&
     !/\b(?:totale\s+(?:da\s+)?pagare|importo\s+da\s+pagare)\b/i.test(content))return 'ricevuta';
  // "Sollecito" or "avviso di sospensione" only as a heading (or "Oggetto:"), or as an explicit
  // reminder: many ordinary bills mention "spese di sollecito" in their terms.
  if(/(?:^|\n)[ \t]*(?:oggetto[ \t]*[:\-][ \t]*)?(?:(?:primo|secondo|terzo|ultimo)[ \t]+)?(?:sollecit[oi]|(?:pre)?avviso[ \t]+di[ \t]+sospensione)(?![\p{L}\p{N}])|\b(?:primo|secondo|terzo|ultimo|nuovo)\s+sollecito\b|\bsollecito\s+(?:di\s+pagamento|n[°º.]?\s*\d)|\bmessa\s+in\s+mora\b|\bavviso\s+di\s+morosit[aà]/iu.test(content))return 'sollecito';
  return 'bolletta';
}
/** Field guesses are proposals for human review, never evidence that an invoice was paid. */
export function extractBillFields(text){
  const lines=cleanLines(text);
  const due=findDate(lines),amountResult=findAmount(lines);
  // A credit note, a negative total or a lone "a vostro credito" amount is never a debt to pay.
  const credit=CREDIT_DOC.test(lines.join('\n'))||amountResult.credit||
    (amountResult.value===null&&!amountResult.ambiguous&&lines.some(l=>CREDIT_LINE.test(l)&&amountsIn(l).length));
  const due_date=due.value,amount=credit?null:amountResult.value;
  const supplier=findSupplier(lines),category=findCategory(lines.join(' '));
  const documentType=credit?'nota_credito':classifyDocument(lines.join('\n'));
  const foundIbans=extractItalianIbans(text);
  const title=category!=='Altro'?`Bolletta ${category.toLowerCase()}${supplier?` · ${supplier}`:''}`:(supplier?`Bolletta · ${supplier}`:'Bolletta da documento');
  const warnings=[];
  if(!credit&&amountResult.ambiguous)warnings.push('Più importi totali differenti: scegli manualmente quello dovuto.');
  else if(!credit&&amount===null)warnings.push('Importo non individuato: inseriscilo manualmente.');
  if(due.ambiguous)warnings.push('Più scadenze differenti: verifica quale è quella corretta.');
  else if(!due_date)warnings.push('Scadenza non individuata: seleziona la data corretta.');
  if(!supplier)warnings.push('Fornitore non individuato: aggiungilo se disponibile.');
  if(foundIbans.length>1)warnings.push('Trovati più IBAN: scegli quello per il pagamento e verifica il destinatario.');
  else if(foundIbans.length===1)warnings.push('IBAN rilevato: verrà confrontata solo un’impronta digitale con quelle verificate in precedenza.');
  if(documentType==='ricevuta')warnings.unshift('Sembra una ricevuta di pagamento, non una nuova bolletta: non salvarla come debito senza verificare.');
  if(documentType==='sollecito')warnings.unshift('Sembra un sollecito: verifica che la bolletta non sia già registrata o pagata.');
  if(documentType==='nota_credito')warnings.unshift('Sembra una nota di credito o un importo a tuo favore: non è un importo da pagare, non salvarla come debito.');
  if(!lines.length)warnings.push('Il documento non contiene testo riconoscibile.');
  else warnings.push('Verifica sempre importo e scadenza prima di salvare.');
  return {title,supplier,category,amount,due_date,documentType,warnings,ibanCandidate:foundIbans.length===1?foundIbans[0]:null,textLength:String(text||'').length};
}
