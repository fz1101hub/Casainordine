import { encryptSecret, decryptSecret, likelyBillDocument, isDocumentAttachment, MAX_ATTACHMENT_BYTES } from './mail-core.mjs';
import { validateMailboxInput, IMAP_PROVIDERS } from './mail-providers.mjs';
import { saveMailboxAttachment } from './mail-attachment.mjs';
import { processPaymentMessage } from './payment-sync.mjs';
import { loadUserSuppliers } from './mail-suppliers.mjs';
import { loadPersonalSenders } from './mail-senders.mjs';

async function createClient({provider,email_address,imap_login,refresh_token_enc},plainPassword){
  const {ImapFlow}=await import('imapflow');
  const host=IMAP_PROVIDERS[provider]?.host;
  if(!host)throw new Error('Provider IMAP non abilitato.');
  const client=new ImapFlow({
    host,port:993,secure:true,auth:{user:imap_login||email_address,pass:plainPassword??decryptSecret(refresh_token_enc)},
    tls:{rejectUnauthorized:true,serverName:host},
    logger:false,disableAutoIdle:true,connectionTimeout:12000,greetingTimeout:10000,socketTimeout:20000
  });
  // ImapFlow also emits asynchronous socket errors; route them through sync failures.
  client.on('error',()=>{});
  return client;
}

export async function verifyImapCredentials(input){
  const validated=validateMailboxInput(input);
  const client=await createClient(validated,validated.password);
  try{await client.connect();}
  catch{throw new Error('Accesso IMAP non riuscito. Verifica indirizzo, credenziale e impostazioni del provider.');}
  finally{try{await client.logout();}catch{client.close();}}
  return validated;
}

export async function syncImapConnection(admin,connection,{messageLimit=25,docLimit=5}={}){
  let imported=0,scanned=0,skipped=0,payment_candidates=0,payments_confirmed=0;
  let client;
  try{
    const learnedSenders=await loadPersonalSenders(admin,connection.user_id);
    const knownSuppliers=await loadUserSuppliers(admin,connection.user_id);
    client=await createClient(connection);
    await client.connect();
    const lock=await client.getMailboxLock('INBOX');
    try{
      const uids=await client.search({since:new Date(Date.now()-35*24*60*60_000)},{uid:true});
      const recent=uids.slice(-Math.min(messageLimit,50)).reverse();
      const validity=String(client.mailbox.uidValidity??'0');
      for(const uid of recent){
        if(imported>=docLimit)break;
        scanned++;
        const info=await client.fetchOne(uid,{envelope:true,size:true},{uid:true});
        if(!info||info.size>22*1024*1024){skipped++;continue;}
        const subject=String(info.envelope?.subject||'').slice(0,240);
        const sender=String(info.envelope?.from?.[0]?.address||'').slice(0,240);
        // If the subject isn't a bill, filenames can still identify an invoice.
        const source=await client.fetchOne(uid,{source:true},{uid:true});
        if(!source?.source){skipped++;continue;}
        const {simpleParser}=await import('mailparser');
        const mail=await simpleParser(source.source,{skipHtmlToText:true,skipTextToHtml:true,skipTextLinks:true});
        const outcome=await processPaymentMessage(admin,connection,{messageId:`${validity}:${uid}`,subject,sender,text:mail.text||mail.html||'',receivedAt:mail.date?.toISOString?.()||new Date().toISOString()});
        if(outcome==='pending')payment_candidates++;
        if(outcome==='auto_confirmed')payments_confirmed++;
        const attachments=mail.attachments||[];
        if(!likelyBillDocument({subject,sender,filenames:attachments.map(a=>a.filename||''),learnedSenders,knownSuppliers,bodyText:mail.text||mail.html||''})){skipped++;continue;}
        for(let i=0;i<attachments.length&&imported<docLimit;i++){
          const a=attachments[i];
          if(!a.filename||!a.content||a.size>MAX_ATTACHMENT_BYTES||!isDocumentAttachment(a.filename)){skipped++;continue;}
          const inserted=await saveMailboxAttachment(admin,connection,{
            messageId:`${validity}:${uid}`,attachmentId:`part-${i}`,filename:a.filename,mimeType:a.contentType||'application/octet-stream',bytes:a.content,
            subject,sender,learnedSenders,receivedAt:mail.date?.toISOString?.()||new Date().toISOString()
          });
          if(inserted)imported++;else skipped++;
        }
      }
    }finally{lock.release();}
    await admin.from('mail_connections').update({status:'active',last_sync_at:new Date().toISOString(),last_error:null}).eq('id',connection.id);
    return {imported,scanned,skipped,payment_candidates,payments_confirmed};
  }catch{
    // Never expose upstream auth error bodies, which may contain mailbox credentials.
    const error='Connessione IMAP non riuscita. Controlla la password per app e l’accesso IMAP.';
    await admin.from('mail_connections').update({status:'error',last_error:error}).eq('id',connection.id);
    return {imported,scanned,skipped,payment_candidates,payments_confirmed,error};
  }finally{if(client)try{await client.logout();}catch{client.close();}}
}
export {encryptSecret};
