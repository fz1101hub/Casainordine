import { encryptSecret, decryptSecret, allowedAttachment, likelyBillEmail, likelyBillDocument, isDocumentAttachment, decodeGmailData, SCAN_QUERY } from './mail-core.mjs';
import { saveMailboxAttachment } from './mail-attachment.mjs';
import { processPaymentMessage } from './payment-sync.mjs';
import { gmailMessageText } from './payment-recognition.mjs';
import { loadUserSuppliers, gmailSupplierQuery } from './mail-suppliers.mjs';
import { loadPersonalSenders, gmailLearnedSenderQuery, reportedAuthentication } from './mail-senders.mjs';

async function googleTokenRequest(params) {
  const response = await fetch('https://oauth2.googleapis.com/token',{
    method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({client_id:process.env.GOOGLE_MAIL_CLIENT_ID || '',client_secret:process.env.GOOGLE_MAIL_CLIENT_SECRET || '',...params})
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`Autorizzazione Gmail: ${String(body.error || 'errore').slice(0,90)}`);
  return body;
}
export async function exchangeGoogleCode(code, verifier) {
  const {googleRedirectUri} = await import('./mail-core.mjs');
  return googleTokenRequest({code,code_verifier:verifier,grant_type:'authorization_code',redirect_uri:googleRedirectUri()});
}
async function freshAccessToken(connection) {
  try {return (await googleTokenRequest({refresh_token:decryptSecret(connection.refresh_token_enc),grant_type:'refresh_token'})).access_token;}
  catch(error) {if (/invalid_grant/i.test(error.message)) { const e = new Error('Autorizzazione Gmail scaduta o revocata: ricollega l’account.');e.code='RECONNECT';throw e;} throw error;}
}
async function gmailFetch(token,path) {
  const response=await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`,{headers:{Authorization:`Bearer ${token}`}});
  if(!response.ok) throw new Error(`Gmail API HTTP ${response.status}`);
  return response.json();
}
export async function mailboxAddress(accessToken) {
  const data=await gmailFetch(accessToken,'profile');
  if (!data.emailAddress || !data.emailAddress.includes('@')) throw new Error('Gmail non ha restituito un indirizzo valido.');
  return data.emailAddress.toLowerCase();
}
export async function syncConnection(admin,connection,{messageLimit=30,docLimit=8}={}) {
  let imported=0,scanned=0,skipped=0,payment_candidates=0,payments_confirmed=0;
  try {
    const token=await freshAccessToken(connection);
    // Search traditional billing terms AND exact addresses previously confirmed by this user.
    const learnedSenders=await loadPersonalSenders(admin,connection.user_id);
    const knownSuppliers=await loadUserSuppliers(admin,connection.user_id);
    const queries=[gmailLearnedSenderQuery(learnedSenders),gmailSupplierQuery(knownSuppliers),SCAN_QUERY].filter(Boolean);
    const ids=[];const seen=new Set();
    for(const query of queries){
      const listing=await gmailFetch(token,`messages?maxResults=${Math.min(50,messageLimit)}&q=${encodeURIComponent(query)}`);
      for(const item of listing.messages||[]){if(!seen.has(item.id)&&ids.length<messageLimit){ids.push(item);seen.add(item.id);}}
    }
    for(const item of ids){
      if(imported>=docLimit)break;
      scanned++;
      const message=await gmailFetch(token,`messages/${encodeURIComponent(item.id)}?format=full`);
      const match=likelyBillEmail(message);
      const senderAuth=reportedAuthentication(message.payload?.headers||[],match.sender,'gmail');
      if(!likelyBillDocument({subject:match.subject,sender:match.sender,filenames:match.attachments.map(a=>a.filename),learnedSenders,knownSuppliers,bodyText:gmailMessageText(message.payload),senderAuth})){skipped++;continue;}
      for(const attachment of match.attachments){
        if(imported>=docLimit)break;
        const mime=isDocumentAttachment(attachment.filename)?allowedAttachment(attachment.filename,attachment.mimeType,attachment.size):null;
        if(!mime){skipped++;continue;}
        const raw=await gmailFetch(token,`messages/${encodeURIComponent(item.id)}/attachments/${encodeURIComponent(attachment.attachmentId)}`);
        const file=decodeGmailData(raw.data);
        const inserted=await saveMailboxAttachment(admin,connection,{
          messageId:item.id,attachmentId:attachment.attachmentId,filename:attachment.filename,mimeType:mime,bytes:file,
          subject:match.subject,sender:match.sender,senderAuth,learnedSenders,receivedAt:new Date(Number(message.internalDate)||Date.now()).toISOString()
        });
        if(!inserted){skipped++;continue;}
        imported++;
      }
    }
    // Separate query: payment confirmations often have no attachments.
    const paymentQuery=encodeURIComponent('newer_than:35d {\"pagamento ricevuto\" \"pagamento effettuato\" \"pagamento confermato\" \"ricevuta pagamento\" \"quietanza\" \"payment received\" \"payment confirmation\"}');
    const paymentListing=await gmailFetch(token,`messages?maxResults=${Math.min(40,messageLimit)}&q=${paymentQuery}`);
    for(const item of (paymentListing.messages||[]).slice(0,messageLimit)){
      const message=await gmailFetch(token,`messages/${encodeURIComponent(item.id)}?format=full`);
      const headers=message.payload?.headers||[];
      const head=name=>headers.find(h=>h.name?.toLowerCase()===name)?.value||'';
      const outcome=await processPaymentMessage(admin,connection,{messageId:item.id,subject:head('subject'),sender:head('from'),text:gmailMessageText(message.payload),receivedAt:new Date(Number(message.internalDate)||Date.now()).toISOString()});
      if(outcome==='pending')payment_candidates++;
      if(outcome==='auto_confirmed')payments_confirmed++;
    }
    await admin.from('mail_connections').update({status:'active',last_sync_at:new Date().toISOString(),last_error:null}).eq('id',connection.id);
    return {imported,scanned,skipped,payment_candidates,payments_confirmed};
  }catch(error){
    await admin.from('mail_connections').update({status:error.code==='RECONNECT'?'reconnect':'error',last_error:String(error.message).slice(0,200)}).eq('id',connection.id);
    return {imported,scanned,skipped,payment_candidates,payments_confirmed,error:error.message};
  }
}
export {encryptSecret};
