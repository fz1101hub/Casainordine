/**
 * Personal sender hints for invoice discovery. Never use these hints to authorize payments.
 * SPF/DKIM/DMARC values are parsed from receiver-reported email headers; they are not
 * cryptographic verification performed by Casa in Ordine.
 */
const PERSONAL_DOMAINS = new Set([
  'gmail.com','googlemail.com','outlook.com','hotmail.com','live.com','msn.com',
  'yahoo.com','yahoo.it','ymail.com','aol.com','icloud.com','me.com','mac.com',
  'libero.it','virgilio.it','tiscali.it','fastmail.com','gmx.com','gmx.de',
  'mail.com','proton.me','protonmail.com','protonmail.ch','pm.me','email.it'
]);

export function parseSenderEmail(raw) {
  if(typeof raw!=='string'||raw.length>320||/[\r\n\x00-\x1f]/.test(raw))return null;
  const text=raw.trim();
  const bracketed=[...text.matchAll(/<([^<>]+)>/g)];
  if(bracketed.length>1 || (bracketed.length===1 && !text.endsWith('>')))return null;
  // A display name may include commas, but unbracketed lists are not accepted.
  const addr=bracketed.length===1?bracketed[0][1].trim():text;
  if(!bracketed.length&&/[\s,;<>]/.test(addr))return null;
  if(!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i.test(addr))return null;
  return addr.toLowerCase();
}
export function senderDomain(value){return parseSenderEmail(value)?.split('@')[1]||null;}
export function isPersonalDomain(domain){return PERSONAL_DOMAINS.has(String(domain||'').toLowerCase());}
export function supplierKey(value){return String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().slice(0,120);}

export function reportedAuthentication(headers,sender,provider=''){
  const domain=senderDomain(sender);
  if(!domain)return 'unknown';
  // Headers from unknown IMAP infrastructure cannot be treated as trusted authentication results.
  if(!['gmail','outlook'].includes(provider))return 'unknown';
  const items=Array.isArray(headers)?headers:[];
  const trustedReceiver=provider==='gmail'?/^mx\.google\.com\s*;/i:/^(?:[a-z0-9.-]+\.)?protection\.outlook\.com\s*;/i;
  const values=items.filter(x=>String(x?.name||'').toLowerCase()==='authentication-results')
    .map(x=>String(x.value||'').slice(0,2500).trim()).filter(v=>trustedReceiver.test(v));
  if(!values.length)return 'unknown';
  let passed=false;
  for(const val of values){
    const verdict=val.match(/(?:^|[;\s])dmarc\s*=\s*(pass|fail|temperror|permerror|none|bestguesspass)/i)?.[1]?.toLowerCase();
    const from=val.match(/\bheader\.from\s*=\s*([a-z0-9.-]+)/i)?.[1]?.toLowerCase();
    if(!verdict||from!==domain)continue;
    if(verdict==='fail'||verdict==='permerror')return 'reported_fail';
    if(verdict==='pass')passed=true;
  }
  return passed?'reported_pass':'unknown';
}

export function canLearnSender(sender,supplier,authState='unknown'){
  const email=parseSenderEmail(sender);
  const normalized=supplierKey(supplier);
  return !!(email&&normalized.length>=2&&normalized.length<=120&&
    !isPersonalDomain(senderDomain(email))&&authState!=='reported_fail');
}

/** No automatic approval: matching is just a ranking hint for candidate documents. */
export function senderHint(entries,rawSender,authState='unknown'){
  const email=parseSenderEmail(rawSender),domain=senderDomain(rawSender);
  if(!email||isPersonalDomain(domain)||authState==='reported_fail')return null;
  const list=Array.isArray(entries)?entries:[];
  const exact=list.filter(x=>x.sender_email===email);
  const all=exact.length?exact:list.filter(x=>x.sender_domain===domain&&authState==='reported_pass');
  const keys=new Set(all.map(x=>supplierKey(x.supplier)));
  if(keys.size!==1||!all.length)return null;
  return {supplier:all[0].supplier,match:exact.length?'exact':'domain'};
}

export function gmailLearnedSenderQuery(entries,limit=12){
  const unique=[...new Set((entries||[]).map(x=>x.sender_email).filter(s=>
    parseSenderEmail(s)===s&&!isPersonalDomain(senderDomain(s))))].slice(0,limit);
  if(!unique.length)return null;
  return `has:attachment newer_than:35d {${unique.map(x=>`from:${x}`).join(' ')}}`;
}
export async function loadPersonalSenders(admin,userId){
  const {data,error}=await admin.from('mail_bill_senders')
    .select('sender_email,sender_domain,supplier,auth_state').eq('user_id',userId)
    .order('confirmed_at',{ascending:false}).limit(200);
  if(error)throw new Error('Impossibile leggere i mittenti delle bollette. Esegui la migrazione v1.6.');
  return data||[];
}
export async function recordConfirmedBillSender(admin,{userId,document,bill}){
  const email=parseSenderEmail(document.sender),state=document.suggestion?.sender_auth||'unknown';
  const supplier=String(bill.supplier||'').trim().slice(0,120);
  if(!canLearnSender(email,supplier,state))return {learned:false,reason:'Mittente non idoneo o autenticazione sospetta.'};
  const entry={user_id:userId,sender_email:email,sender_domain:senderDomain(email),
    supplier,supplier_key:supplierKey(supplier),auth_state:state,confirmed_at:new Date().toISOString()};
  const {error}=await admin.from('mail_bill_senders').upsert(entry,
    {onConflict:'user_id,sender_email,supplier_key'});
  if(error)throw error;
  return {learned:true};
}
