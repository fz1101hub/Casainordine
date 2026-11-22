// Casa in Ordine v2.0 — regole deterministiche; nessuna AI, pagamento o tariffa verificata.
const months={monthly:1,bimonthly:2,quarterly:3,yearly:12,biennial:24};
const isoDate = value=>/^\d{4}-\d{2}-\d{2}$/.test(String(value||''));
const dayMs=86400000;
export function addMonthsClamped(iso,n){
 if(!isoDate(iso)||!Number.isInteger(n)||Math.abs(n)>120)return null;
 const [y,m,d]=iso.split('-').map(Number);const first=new Date(Date.UTC(y,m-1+n,1,12));
 const last=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0,12)).getUTCDate();
 return `${first.getUTCFullYear()}-${String(first.getUTCMonth()+1).padStart(2,'0')}-${String(Math.min(d,last)).padStart(2,'0')}`;
}
const diffDays=(a,b)=>(Date.parse(a+'T12:00:00Z')-Date.parse(b+'T12:00:00Z'))/dayMs;
const canonical=s=>String(s||'').normalize('NFKC').trim().toLowerCase().replace(/\s+/g,' ');
export function missingBillCandidates(utilities,bills,today,{graceDays=7}={}){
 if(!isoDate(today))return [];
 const out=[];
 for(const u of utilities||[]){
  const step=months[u.frequency];if(!u.active||!step||!u.id)continue;
  const name=canonical(u.supplier);const sameScope=b=>(b.home_id||null)===(u.home_id||null)&&
   ((u.home_id||null)!==null||b.user_id===u.user_id);
  const history=(bills||[]).filter(b=>
   sameScope(b)&&(b.utility_id===u.id||(canonical(b.supplier)===name&&b.category===u.category))&&
   b.is_estimate!==true&&b.source!=='recurring'&&isoDate(b.due_date)&&b.due_date<=today
  ).sort((a,b)=>a.due_date.localeCompare(b.due_date));
  // Never guess after only one invoice: no cadence evidence.
  if(history.length<2)continue;
  const last=history.at(-1);const previous=history.at(-2);
  const interval=diffDays(last.due_date,previous.due_date);
  if(interval<step*26-9||interval>step*31+9)continue;
  let expected=addMonthsClamped(last.due_date,step),guard=0;
  while(expected&&diffDays(today,expected)>graceDays&&guard++<12){
   if((bills||[]).some(b=>b.id!==last.id&&sameScope(b)&&b.is_estimate!==true&&b.source!=='recurring'&&
     (b.utility_id===u.id||(canonical(b.supplier)===name&&b.category===u.category))&&
     isoDate(b.due_date)&&Math.abs(diffDays(b.due_date,expected))<=15))break;
   out.push({utility_id:u.id,user_id:u.user_id,home_id:u.home_id||null,supplier:u.supplier,expected_on:expected,days_late:diffDays(today,expected),last_due:last.due_date});
   expected=addMonthsClamped(expected,step);
  }
 }
 return out;
}
const median=arr=>{const x=arr.filter(Number.isFinite).sort((a,b)=>a-b);if(!x.length)return null;return x.length%2?x[(x.length-1)/2]:(x[x.length/2]+x[x.length/2-1])/2};
export function billFraudSignals(bill,history=[],{sender='',senderAuth='unknown',trustedSenders=[],ibanFingerprint='',historicalIbanFingerprints=[]}={}){
 const flags=[];
 const peers=(history||[]).filter(b=>b.id!==bill.id&&canonical(b.supplier)===canonical(bill.supplier)&&b.category===bill.category&&b.is_estimate!==true).sort((a,b)=>String(a.due_date||'').localeCompare(String(b.due_date||''))).map(b=>Number(b.amount)).filter(n=>n>0);
 const baseline=median(peers.slice(-8));const amount=Number(bill.amount);
 if(baseline!==null&&peers.length>=3&&amount>baseline*1.8&&amount-baseline>=30)flags.push({id:'high_amount'});
 if(senderAuth==='fail')flags.push({id:'failed_auth'});
 const known=(trustedSenders||[]).some(a=>canonical(a.email||a.sender_email||a)===canonical(sender));
 if(sender&&!known)flags.push({id:'new_sender'});
 const oldIban=(historicalIbanFingerprints||[]).filter(Boolean);
 if(ibanFingerprint&&oldIban.length&&oldIban.every(x=>x!==ibanFingerprint))flags.push({id:'iban_change'});
 return {flags,requiresReview:flags.length>0,baseline};
}
export function parsePagoPA(text){
 const t=String(text||'').replace(/[\u200b-\u200d]/g,' ');
 const pairs=[];
 // A notice may contain multiple numeric identifiers: never silently pick one.
 const notice=/(?:codice\s+(?:avviso|di\s+avviso)|numero\s+avviso|IUV)\s*[:#-]?\s*((?:\d[\s-]?){15,18})(?!\d)/gi;
 for(const match of t.matchAll(notice)){const digits=match[1].replace(/\D/g,'');if(digits.length===18||digits.length===15) pairs.push(digits);}
 const unique=[...new Set(pairs)];
 const org=/(?:codice\s+(?:fiscale\s+)?ente\s+creditore|codice\s+fiscale\s+ente|cod\.\s*fisc\.\s*ente)\s*[:#-]?\s*(\d{11})/i.exec(t)?.[1]||null;
 return {noticeCode:unique.length===1?unique[0]:null,creditorCode:org,ambiguous:unique.length>1,found:unique};
}
// Passi del trasloco: il testo è nel dizionario («v20.move.<step>»), qui solo l'anticipo in giorni.
export const MOVE_TEMPLATE=[['step1',-7],['step2',-21],['step3',-30],['step4',0],['step5',7],['step6',30],['step7',1]];
export function moveChecklist(moveOn){if(!isoDate(moveOn))return [];
 return MOVE_TEMPLATE.map(([step,offset])=>({step,due_on:new Date(Date.parse(moveOn+'T12:00:00Z')+offset*dayMs).toISOString().slice(0,10),done:false}));}
export function savingsProjection({targetAmount,currentAmount=0,deadline,today}){
 const target=Number(targetAmount),current=Number(currentAmount);
 if(!Number.isFinite(target)||target<=0||!Number.isFinite(current)||current<0||!isoDate(deadline)||!isoDate(today))return null;
 const dueMonths=Math.max(1,(Number(deadline.slice(0,4))-Number(today.slice(0,4)))*12+Number(deadline.slice(5,7))-Number(today.slice(5,7))+1);
 const remaining=Math.max(0,Math.round((target-current)*100)/100);
 return {remaining,months:dueMonths,monthly:Math.ceil(remaining*100/dueMonths)/100,progress:Math.min(100,Math.round(current/target*100))};
}
// Stato di una casella collegata; il testo è nel dizionario («v20.mail.<status>»).
export function mailHealth(connection,now=new Date()){
 if(connection.status==='reconnect')return {level:'error',status:'reconnect'};
 if(connection.status==='error')return {level:'error',status:'error'};
 const last=connection.last_sync_at?Date.parse(connection.last_sync_at):NaN;
 if(!Number.isFinite(last))return {level:'warning',status:'never'};
 if(now.getTime()-last>48*3600000)return {level:'warning',status:'stale'};
 return {level:'ok',status:'recent'};
}
// Testo di un segnale di possibile frode (t: traduzione, money: formato degli importi).
// Un id sconosciuto (dati vecchi) mostra l'etichetta salvata, se c'è.
const FRAUD_FLAGS=['high_amount','failed_auth','new_sender','iban_change'];
export function fraudFlagText(flag,t,baseline=null,money=value=>String(value)){
 const id=flag?.id;
 if(!FRAUD_FLAGS.includes(id))return String(flag?.label||'');
 if(id!=='high_amount')return t('fraud.'+id);
 const value=Number(baseline);
 return baseline!==null&&Number.isFinite(value)&&value>=0?t('fraud.high_amount',{amount:money(value)}):t('fraud.high_amountPlain');
}
/** Italian IBANs detected locally in documents. A valid checksum is not proof of an authorized payee. */
export function extractItalianIbans(text){
 const source=String(text||'').toUpperCase();const results=[];
 // Restrict search to Italian IBAN length; no background requests and no persistence of raw numbers.
 const re=/\bIT(?:[ \t-]?[A-Z0-9]){25}\b/g;
 for(const m of source.matchAll(re)){
  const iban=m[0].replace(/[ \t-]/g,'');
  if(!/^IT\d{2}[A-Z]\d{10}[A-Z0-9]{12}$/.test(iban))continue;
  const shuffled=iban.slice(4)+iban.slice(0,4);let mod=0;
  for(const c of shuffled){const chars=/\d/.test(c)?c:String(c.charCodeAt(0)-55);for(const digit of chars)mod=(mod*10+Number(digit))%97;}
  if(mod===1)results.push(iban);
 }
 return [...new Set(results)];
}
