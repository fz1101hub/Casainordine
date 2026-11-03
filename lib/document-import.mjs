import { normalizeDate, parseMoney } from './dates.mjs';
import { extractItalianIbans } from './v20-core.mjs';

// Deterministic extraction only: no cloud AI and no automatic bill/payment approval.
const DATE = /\b(?:\d{1,2}[/.\-]\d{1,2}[/.\-]\d{4}|\d{4}-\d{2}-\d{2})\b/g;
const NUMBER = /(?<!\d)(?:\d{1,3}(?:[. ]\d{3})+|\d{1,7})[.,]\d{2}(?!\d)/g;
const CURRENCY_NUMBER = /(?:€|\bEUR\b)\s*(\d{1,3}(?:[. ]\d{3})*(?:[,.]\d{2})?|\d{1,7}(?:[,.]\d{2})?)|((?:\d{1,3}(?:[. ]\d{3})*|\d{1,7})(?:[,.]\d{2})?)\s*(?:€|\bEUR\b)/gi;
const DUE_LABELS = [
  /\b(?:data\s+(?:di\s+)?scadenza\s+(?:del\s+)?(?:pagamento|bolletta|fattura)?|scadenza\s+(?:del\s+)?(?:pagamento|bolletta|fattura))\b/i,
  /\b(?:da\s+pagare\s+entro|pagare\s+entro|pagamento\s+entro|entro\s+il|termine\s+(?:di\s+)?pagamento)\b/i,
  /\bscadenza\b/i
];
const AMOUNT_LABELS = [
  /\b(?:totale\s+(?:da\s+)?pagare|importo\s+da\s+pagare|somma\s+da\s+pagare|totale\s+da\s+versare|importo\s+del\s+pagamento)\b/i,
  /\b(?:totale\s+(?:della\s+)?bolletta|totale\s+fattura|importo\s+totale|saldo\s+da\s+pagare|totale\s+dovuto|totale\s+documento)\b/i,
  /\b(?:da\s+pagare|importo\s+dovuto|importo\s+bolletta|importo\s+fattura)\b/i
];
const NON_DUE = /\b(?:scadenza\s+(?:dell['’]?offerta|contratto|promozione|precedente|passata)|scadenza\s+(?:per\s+)?il\s+reclamo|gi[aà]\s+scadut[ao]|data\s+emissione|data\s+fattura)\b/i;
const NON_TOTAL = /\b(?:subtotal[ei]?|subtotale|imponibile|iva|sconto|acconto|rata\s+precedente|gi[aà]\s+pagat[ao]|importo\s+pagato|rimborso|credito\s+residuo|storn[oi]|costo\s+unitario)\b/i;

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
      let dates=datesIn(line.slice(match.index+match[0].length));
      // Don't steal the invoice issue date from before the due-date label.
      if(!dates.length){
        for(let j=i+1;j<=i+2&&j<lines.length;j++){
          if(lines[j].length>55||NON_DUE.test(lines[j]))break;
          dates=datesIn(lines[j]);if(dates.length)break;
        }
      }
      if(dates.length===1)found.push({value:dates[0],rank});
      else if(dates.length>1)found.push(...dates.map(value=>({value,rank})));
    }
  }
  return chooseCandidates(found);
}
function findAmount(lines){
  const found=[];
  for(let rank=0;rank<AMOUNT_LABELS.length;rank++){
    for(let i=0;i<lines.length;i++){
      const line=lines[i],match=line.match(AMOUNT_LABELS[rank]);
      if(!match||NON_TOTAL.test(line))continue;
      let amounts=amountsIn(line.slice(match.index+match[0].length));
      if(!amounts.length&&lines[i+1]?.length<=45&&!NON_TOTAL.test(lines[i+1]))amounts=amountsIn(lines[i+1]);
      found.push(...amounts.map(value=>({value,rank})));
    }
  }
  return chooseCandidates(found);
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
  if(/\b(?:sollecito\s+di\s+pagamento|messa\s+in\s+mora|avviso\s+di\s+morosit[aà])\b/i.test(content))return 'sollecito';
  return 'bolletta';
}
/** Field guesses are proposals for human review, never evidence that an invoice was paid. */
export function extractBillFields(text){
  const lines=cleanLines(text);
  const due=findDate(lines),amountResult=findAmount(lines);
  const due_date=due.value,amount=amountResult.value;
  const supplier=findSupplier(lines),category=findCategory(lines.join(' '));
  const documentType=classifyDocument(lines.join('\n'));
  const foundIbans=extractItalianIbans(text);
  const title=category!=='Altro'?`Bolletta ${category.toLowerCase()}${supplier?` · ${supplier}`:''}`:(supplier?`Bolletta · ${supplier}`:'Bolletta da documento');
  const warnings=[];
  if(amountResult.ambiguous)warnings.push('Più importi totali differenti: scegli manualmente quello dovuto.');
  else if(amount===null)warnings.push('Importo non individuato: inseriscilo manualmente.');
  if(due.ambiguous)warnings.push('Più scadenze differenti: verifica quale è quella corretta.');
  else if(!due_date)warnings.push('Scadenza non individuata: seleziona la data corretta.');
  if(!supplier)warnings.push('Fornitore non individuato: aggiungilo se disponibile.');
  if(foundIbans.length>1)warnings.push('Trovati più IBAN: scegli quello per il pagamento e verifica il destinatario.');
  else if(foundIbans.length===1)warnings.push('IBAN rilevato: verrà confrontata solo un’impronta digitale con quelle verificate in precedenza.');
  if(documentType==='ricevuta')warnings.unshift('Sembra una ricevuta di pagamento, non una nuova bolletta: non salvarla come debito senza verificare.');
  if(documentType==='sollecito')warnings.unshift('Sembra un sollecito: verifica che la bolletta non sia già registrata o pagata.');
  if(!lines.length)warnings.push('Il documento non contiene testo riconoscibile.');
  else warnings.push('Verifica sempre importo e scadenza prima di salvare.');
  return {title,supplier,category,amount,due_date,documentType,warnings,ibanCandidate:foundIbans.length===1?foundIbans[0]:null,textLength:String(text||'').length};
}
