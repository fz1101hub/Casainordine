import { mailRedirectUri, codeChallenge, encryptSecret, decryptSecret, likelyBillDocument, isDocumentAttachment, MAX_ATTACHMENT_BYTES } from './mail-core.mjs';
import { saveMailboxAttachment } from './mail-attachment.mjs';
import { processPaymentMessage } from './payment-sync.mjs';
import { loadUserSuppliers } from './mail-suppliers.mjs';
import { loadPersonalSenders, reportedAuthentication } from './mail-senders.mjs';

export function microsoftConsentUrl(state,verifier){
  if(!process.env.MICROSOFT_MAIL_CLIENT_ID||!process.env.MICROSOFT_MAIL_CLIENT_SECRET)throw new Error('OAuth Microsoft non configurato.');
  const params=new URLSearchParams({client_id:process.env.MICROSOFT_MAIL_CLIENT_ID,response_type:'code',redirect_uri:mailRedirectUri(),response_mode:'query',scope:'offline_access User.Read Mail.Read',prompt:'consent',state,code_challenge:codeChallenge(verifier),code_challenge_method:'S256'});
  return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params}`;
}
async function microsoftToken(params){
  const response=await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token',{
    method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({client_id:process.env.MICROSOFT_MAIL_CLIENT_ID||'',client_secret:process.env.MICROSOFT_MAIL_CLIENT_SECRET||'',...params})
  });
  const body=await response.json();
  if(!response.ok){const error=new Error('Autorizzazione Microsoft non riuscita.');if(body.error==='invalid_grant')error.code='RECONNECT';throw error;}
  return body;
}
export function exchangeMicrosoftCode(code,verifier){return microsoftToken({grant_type:'authorization_code',code,code_verifier:verifier,redirect_uri:mailRedirectUri()});}
async function refreshMicrosoftToken(connection){const tokens=await microsoftToken({grant_type:'refresh_token',refresh_token:decryptSecret(connection.refresh_token_enc),scope:'offline_access User.Read Mail.Read'});return tokens;}
async function graphFetch(token,path){
  const response=await fetch(`https://graph.microsoft.com/v1.0/${path}`,{headers:{Authorization:`Bearer ${token}`,Accept:'application/json'}});
  if(!response.ok){const error=new Error(`Microsoft Graph HTTP ${response.status}`);if(response.status===401)error.code='RECONNECT';throw error;}
  return response.json();
}
export async function microsoftMailboxAddress(token){
  const me=await graphFetch(token,'me?$select=mail,userPrincipalName');
  const address=String(me.mail||me.userPrincipalName||'').trim().toLowerCase();
  if(!/^[^\s@]+@[^\s@]+$/.test(address))throw new Error('Microsoft non ha restituito un indirizzo email valido.');
  return address;
}
export async function syncMicrosoftConnection(admin,connection,{messageLimit=25,docLimit=5}={}){
  let imported=0,scanned=0,skipped=0,payment_candidates=0,payments_confirmed=0;
  try{
    const tokens=await refreshMicrosoftToken(connection);
    if(tokens.refresh_token){
      const {error}=await admin.from('mail_connections').update({refresh_token_enc:encryptSecret(tokens.refresh_token)}).eq('id',connection.id);
      if(error)throw error;
    }
    const token=tokens.access_token;
    const learnedSenders=await loadPersonalSenders(admin,connection.user_id);
    const knownSuppliers=await loadUserSuppliers(admin,connection.user_id);
    // Inbox only, most recent first. Subject/sender OR filename must resemble a bill.
    const search=new URLSearchParams({'$select':'id,subject,from,receivedDateTime,hasAttachments,body','$orderby':'receivedDateTime desc','$top':String(Math.min(50,messageLimit))});
    const data=await graphFetch(token,`me/mailFolders/inbox/messages?${search}`);
    for(const msg of (data.value||[]).slice(0,messageLimit)){
      if(imported>=docLimit)break;
      scanned++;
      // Le intestazioni si scaricano solo se servono davvero, e al massimo una volta per messaggio:
      // le usano sia la conferma automatica dei pagamenti sia gli allegati.
      let headers=null;
      const messageHeaders=async()=>{if(!headers){const h=await graphFetch(token,`me/messages/${encodeURIComponent(msg.id)}?$select=internetMessageHeaders`);headers=h.internetMessageHeaders||[];}return headers;};
      const paymentSenderAuth=async()=>reportedAuthentication(await messageHeaders(),msg.from?.emailAddress?.address||'','outlook');
      const outcome=await processPaymentMessage(admin,connection,{messageId:msg.id,subject:msg.subject||'',sender:msg.from?.emailAddress?.address||'',text:msg.body?.content||'',receivedAt:msg.receivedDateTime,senderAuth:paymentSenderAuth});
      if(outcome==='pending')payment_candidates++;
      if(outcome==='auto_confirmed')payments_confirmed++;
      if(!msg.hasAttachments){skipped++;continue;}
      const attachmentData=await graphFetch(token,`me/messages/${encodeURIComponent(msg.id)}/attachments?$top=100`);
      const subject=String(msg.subject||'');
      const sender=String(msg.from?.emailAddress?.address||'');
      const attachments=attachmentData.value||[];
      // If header retrieval is unavailable, keep the document reviewable, marked as unknown.
      let senderAuth='unknown';
      try{
        senderAuth=reportedAuthentication(await messageHeaders(),sender,'outlook');
      }catch{/* Lack of header access is not evidence of authentication success. */}
      if(!likelyBillDocument({subject,sender,filenames:attachments.map(a=>a.name||''),learnedSenders,knownSuppliers,bodyText:msg.body?.content||'',senderAuth})){skipped++;continue;}
      for(const a of attachments){
        if(imported>=docLimit)break;
        if(a['@odata.type']!=='#microsoft.graph.fileAttachment'||!a.contentBytes||!a.id||a.size>MAX_ATTACHMENT_BYTES||!isDocumentAttachment(a.name)){skipped++;continue;}
        // Graph returns fileAttachment.contentBytes for small files. Larger may require separate endpoint.
        const bytes=Buffer.from(a.contentBytes,'base64');
        if(bytes.length>MAX_ATTACHMENT_BYTES){skipped++;continue;}
        const inserted=await saveMailboxAttachment(admin,connection,{messageId:msg.id,attachmentId:a.id,filename:a.name,mimeType:a.contentType||'application/octet-stream',bytes,subject,sender,senderAuth,learnedSenders,receivedAt:msg.receivedDateTime});
        if(inserted)imported++;else skipped++;
      }
    }
    await admin.from('mail_connections').update({status:'active',last_sync_at:new Date().toISOString(),last_error:null}).eq('id',connection.id);
    return {imported,scanned,skipped,payment_candidates,payments_confirmed};
  }catch(error){
    await admin.from('mail_connections').update({status:error.code==='RECONNECT'?'reconnect':'error',last_error:String(error.message).slice(0,180)}).eq('id',connection.id);
    return {imported,scanned,skipped,payment_candidates,payments_confirmed,error:error.message};
  }
}
