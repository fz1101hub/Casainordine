import { parseMoney, todayRome } from './dates.mjs';

const POSITIVE = [
  /(?:pagamento|addebito|bonifico|versamento)\s+(?:è\s+stato\s+|e\s+stato\s+)?(?:effettuato|eseguito|ricevuto|confermato|completato|registrato|andato\s+a\s+buon\s+fine)/i,
  /(?:conferma|ricevuta|quietanza)\s+(?:di|del|dell['’])\s*(?:avvenuto\s+)?pagamento/i,
  /(?:abbiamo|hai)\s+(?:ricevuto|effettuato|registrato|eseguito)\s+(?:il\s+)?pagamento/i,
  /(?:payment|direct\s+debit)\s+(?:received|successful|completed|confirmed)/i,
  /(?:payment\s+confirmation|payment\s+receipt)/i,
  /(?:fattura|bolletta)\s+(?:risulta\s+)?(?:saldata|pagata)/i
];
const NEGATIVE = /(?:non\s+(?:abbiamo|hai)\s+(?:ricevuto|effettuato|registrato|eseguito)\s+(?:il\s+)?pagamento|pagamento\s+non\s+(?:e\s+stato|è\s+stato)\s+(?:eseguito|ricevuto|effettuato|confermato)|pagamento\s+(?:stornato|annullato|revocato)|addebito\s+stornato|(?:pagamento|addebito)\s+(?:verra|sarà|sara)\s+(?:effettuato|eseguito)|pagamento\s+(?:non\s+|mai\s+)?(?:riuscito|effettuato|eseguito|ricevuto|confermato|completato)\s*non\s+|pagamento\s+non\s+(?:riuscito|effettuato|eseguito|ricevuto|confermato|completato)|pagamento\s+(?:rifiutato|respinto|fallito|in\s+attesa|da\s+effettuare|da\s+confermare)|addebito\s+(?:fallito|non\s+riuscito)|payment\s+(?:failed|declined|pending|not\s+received)|sollecito\s+di\s+pagamento|avviso\s+di\s+pagamento|promemoria\s+di\s+pagamento|richiesta\s+di\s+pagamento|importo\s+da\s+pagare)/i;
const PAYMENT_REQUEST = /\b(?:clicca\s+(?:qui|sul\s+link)|paga\s+ora|per\s+completare\s+(?:il\s+)?pagamento|procedi\s+al\s+pagamento|effettua\s+(?:il\s+)?pagamento|pagamento\s+da\s+effettuare|devi\s+pagare|in\s+attesa\s+di\s+pagamento|pay\s+now|complete\s+your\s+payment|payment\s+due|pagamento\s+programmato|addebito\s+programmato)\b/i;
const SUSPICIOUS = /\b(?:sollecito|insoluto|morosit[aà]|rata\s+scaduta|stornato|revocato|annullato|rimborsato|rimborso|accredito\s+da\s+ricevere)\b/i;
const CONTEXT = /bollett|fattur|utenza|energia|elettric|acqua|gas|internet|fibra|telefon|condomini|rifiut|tari|utility|invoice|servizi\s+domestic/i;
// Euro sign before ("€ 87,50", "EUR 87,50") or after the figure ("87,50 €", "87,50 EUR").
// Both forms are collected separately so that "2026 € 87,50" yields two amounts, never a guess.
const MONEY = String.raw`(\d{1,3}(?:[.\s]\d{3})*(?:,\d{2})?|\d+(?:[.,]\d{2})?)`;
// The figure must end there: "€ 1234,56" is never cut to 123, nor "€ 87.50" to 87.
const AMOUNT_BEFORE = new RegExp(String.raw`(?:€|\bEUR)\s*${MONEY}(?!\d|[.,]\d)`, 'gi');
const AMOUNT_AFTER = new RegExp(String.raw`(?<![\d.,])${MONEY}\s*(?:€|EUR\b)`, 'gi');
// Dates are masked first: "17/11/2026 € 87,50" must not turn 2026 into an amount.
const DATE_MASK = /\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b|\b\d{1,2}\.\d{1,2}\.\d{4}\b|\b\d{4}-\d{2}-\d{2}\b/g;
// Checked on accent-free lowercase text. These messages are never evidence of a payment made:
// a new bill to pay (even if it thanks for the previous payment), a future debit, a failed payment.
const NEW_BILL = /\bnuov[ao]\s+(?:bolletta|fattura)\b|\bdisponibile\s+(?:la\s+|una\s+)?(?:tua\s+|sua\s+)?(?:nuova\s+)?(?:bolletta|fattura)\b|\b(?:bolletta|fattura)\b[^.!?\n]{0,60}\b(?:e|sono)\s+(?:ora\s+)?disponibil[ei]\b|\bstata\s+emessa\s+(?:la\s+|una\s+)?(?:tua\s+)?(?:nuova\s+)?(?:bolletta|fattura)\b|\bti\s+(?:inviamo|invieremo)\s+(?:la\s+)?(?:tua\s+)?(?:bolletta|fattura)\b|\bnew\s+(?:bill|invoice)\b|\b(?:bill|invoice)\s+is\s+(?:now\s+)?(?:available|ready)\b/;
const FUTURE_DEBIT = /\b(?:verra|verranno|sara|saranno)\s+(?:\S+\s+){0,3}?(?:effettuat|eseguit|addebitat|prelevat|riscoss|incassat|pagat)[oaie]\b|\b(?:addebiteremo|preleveremo|addebitera|addebiteranno)\b|\b(?:addebito|pagamento|prelievo)\s+(?:diretto\s+)?(?:previsto|programmato|pianificato)\b|\bpreavviso\s+di\s+(?:addebito|pagamento)\b|\bwill\s+be\s+(?:charged|debited|collected|paid)\b|\bscheduled\s+(?:payment|debit)\b/;
const FAILED = /\brespint[oaie]\b|\brifiutat[oaie]\b|\bnon\s+(?:e\s+)?(?:andat|riuscit)[oa]\s+a\s+buon\s+fine\b|\bnon\s+(?:e\s+)?stato\s+possibile\s+(?:addebitare|effettuare|eseguire|completare|incassare|riscuotere|prelevare|procedere)\b|\bnon\s+(?:e\s+)?riuscit[oa]\b|\binsolut[oi]\b|\bstornat[oaie]\b|\bstorno\b|\bfallit[oaie]\b|\besito\s+negativo\b|\bmancato\s+(?:pagamento|addebito)\b|\b(?:payment|debit)\s+(?:failed|declined|rejected|returned|bounced|reversed)\b/;
const STOP = new Set(['energia','elettrica','elettrico','elettricita','italia','italiano','italiana','servizi','servizio','spa','srl','srls','acqua','gas','internet','fibra','luce','energia','utenze','azienda','societa','comune','pubblico','pubblica','casa','energiaelettrica','telefonia','group','holding','fattura','bolletta','sede','clienti','operatore','utility','utilities']);
const normalize = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();

export function senderAddress(raw){
  const match=String(raw||'').match(/[a-z0-9._%+\-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  return match?match[0].toLowerCase():null;
}
export function supplierKey(name){
  return normalize(name).replace(/[^a-z0-9 ]+/g,' ').replace(/\s+/g,' ').trim().slice(0,120);
}
function supplierTokens(supplier){return supplierKey(supplier).split(' ').filter(t=>t.length>=4&&!STOP.has(t));}
export function supplierMatches(supplier,{subject='',text='',sender=''}={}){
  const tokens=supplierTokens(supplier);
  if(!tokens.length)return false;
  const all=` ${normalize(`${subject} ${text} ${sender}`).replace(/[^a-z0-9]+/g,' ')} `;
  return tokens.some(token=>all.includes(` ${token} `));
}
export function sanitizeMailText(text){
  const raw=String(text||'').slice(0,12000)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ')
    .replace(/<[^>]+>/g,' ').replace(/&(?:nbsp|amp|euro|lt|gt|quot);/gi,m=>({'&nbsp;':' ','&amp;':'&','&euro;':'€','&lt;':'<','&gt;':'>','&quot;':'"'}[m.toLowerCase()]||' '));
  // Do not treat quoted emails or forwarded texts as new payment confirmations.
  return raw.split(/\n(?:da:|from:|-----original message-----|inoltrato da:|il\s+giorno\s+.{0,70}ha\s+scritto:|on\s+.{0,70}wrote:|>\s*)/i)[0].slice(0,5000);
}
export function extractPaymentEvidence({subject='',text='',sender='',receivedAt=null}={}){
  const title=String(subject).slice(0,200),body=sanitizeMailText(text),source=senderAddress(sender);
  if(!source)return null;
  const content=`${title}\n${body}`;
  const explicitBody=POSITIVE.some(re=>re.test(body));
  if(!POSITIVE.some(re=>re.test(content))||NEGATIVE.test(content)||SUSPICIOUS.test(content)||/(?:pagamento|payment)[^\n]{0,80}\?/i.test(content))return null;
  // A subject such as "ricevuta di pagamento" is not enough when the body asks the
  // recipient to pay. Keep equivocal messages for manual verification only.
  if(PAYMENT_REQUEST.test(body) && !explicitBody)return null;
  const plain=normalize(content);
  if(NEW_BILL.test(plain)||FUTURE_DEBIT.test(plain)||FAILED.test(plain))return null;
  const found=[],masked=content.replace(DATE_MASK,' ');
  for(const match of [...masked.matchAll(AMOUNT_BEFORE),...masked.matchAll(AMOUNT_AFTER)]){
    const value=parseMoney(match[1].replace(/\s/g,''));
    if(Number.isFinite(value)&&value>0&&value<=100000)found.push(value);
  }
  const amounts=[...new Set(found)];
  if(amounts.length!==1)return null; // multiple amounts or none: never guess a bill
  const date=new Date(receivedAt||'');
  if(!Number.isFinite(date.getTime())||date.getTime()>Date.now()+24*60*60_000)return null;
  return {sender:source,subject:title,amount:amounts[0],receivedAt:date.toISOString(),billContext:CONTEXT.test(content),text:body,autoEligible:explicitBody&&!PAYMENT_REQUEST.test(body)};
}
// `bills` may include bills already paid: the receipt belongs to the compatible bill whose due
// date is closest to the email (Rome calendar days). If that one is paid, or two are equally
// close, nothing is matched — a receipt for last month must never close this month's bill.
export function matchOutstandingBill(evidence,bills){
  const received=new Date(evidence?.receivedAt);
  if(!Number.isFinite(received.getTime()))return null;
  const emailDay=Date.parse(`${todayRome(received)}T12:00:00Z`);
  const cents=Math.round(Number(evidence.amount)*100);
  const possible=[];
  for(const b of bills||[]){
    const due=Date.parse(`${b.due_date}T12:00:00Z`);
    if(!Number.isFinite(due))continue;
    const days=Math.round((due-emailDay)/86_400_000);
    if(days<-90||days>45)continue;
    if(Math.round(Number(b.amount)*100)!==cents)continue;
    if(!supplierMatches(b.supplier,{subject:evidence.subject,text:evidence.text,sender:evidence.sender}))continue;
    possible.push({bill:b,distance:Math.abs(days)});
  }
  if(!possible.length)return null;
  const nearest=Math.min(...possible.map(p=>p.distance));
  const closest=possible.filter(p=>p.distance===nearest);
  if(closest.length!==1||closest[0].bill.paid_at)return null;
  // Two open bills with the same amount (e.g. October paid late and November): still ambiguous,
  // as before. Picking the nearest one could auto-confirm the wrong month.
  if(possible.filter(p=>!p.bill.paid_at).length>1)return null;
  return closest[0].bill;
}
export function gmailMessageText(payload){
  let plain='',html='';
  function walk(part,depth=0){
    if(!part||depth>10)return;
    if(part.body?.data && typeof part.body.data==='string' && part.body.data.length<100000){
      const content=Buffer.from(part.body.data,'base64url').toString('utf8');
      if(part.mimeType==='text/plain'&&!plain)plain=content;
      if(part.mimeType==='text/html'&&!html)html=content;
    }
    for(const child of part.parts||[])walk(child,depth+1);
  }
  walk(payload);
  return sanitizeMailText(plain||html);
}
