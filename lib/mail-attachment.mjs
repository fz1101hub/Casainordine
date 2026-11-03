import { randomUUID } from 'node:crypto';
import { allowedAttachment, fileSignatureIsValid, safeFileName, MAIL_BUCKET, MAX_ATTACHMENT_BYTES } from './mail-core.mjs';
import { extractBillFields } from './document-import.mjs';
import { senderHint } from './mail-senders.mjs';

async function quickExtract(buffer,mime) {
  if(mime!=='application/pdf')return null;
  try{
    const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');
    const task=pdfjs.getDocument({data:new Uint8Array(buffer),isEvalSupported:false,useSystemFonts:false,disableFontFace:true});
    const doc=await task.promise;
    try{
      const lines=[];
      for(let i=1;i<=Math.min(doc.numPages,3);i++){
        const page=await doc.getPage(i);
        const content=await page.getTextContent();
        lines.push(content.items.map(x=>x.str).join(' '));
        page.cleanup();
      }
      const result=extractBillFields(lines.join('\n'));
      return {title:result.title,supplier:result.supplier,category:result.category,amount:result.amount,due_date:result.due_date,warnings:result.warnings};
    }finally{await doc.destroy();}
  }catch{return null;}
}

// All providers share the same safe path, signature checks and duplicate key.
export async function saveMailboxAttachment(admin,connection,{messageId,attachmentId,filename,mimeType,bytes,subject='',sender='',receivedAt=null,senderAuth='unknown',learnedSenders=[]}){
  const file=Buffer.isBuffer(bytes)?bytes:Buffer.from(bytes||[]);
  if(file.length>MAX_ATTACHMENT_BYTES)return false;
  const mime=allowedAttachment(filename,mimeType,file.length);
  if(!mime||!fileSignatureIsValid(file,mime))return false;
  const {data:existing,error:existsError}=await admin.from('mail_documents').select('id').eq('connection_id',connection.id).eq('message_id',messageId).eq('attachment_id',attachmentId).maybeSingle();
  if(existsError)throw existsError;
  if(existing)return false;
  const storagePath=`${connection.user_id}/${randomUUID()}.${mime==='application/pdf'?'pdf':mime==='image/jpeg'?'jpg':mime.split('/')[1]}`;
  const {error:uploadErr}=await admin.storage.from(MAIL_BUCKET).upload(storagePath,file,{contentType:mime,upsert:false});
  if(uploadErr)throw uploadErr;
  let committed=false;
  try{
    const extracted=await quickExtract(file,mime);
    const suggestion=extracted||{title:`${subject} ${filename}`.slice(0,240)||'Bolletta da email',supplier:'',category:'Altro',amount:null,due_date:null,warnings:['Apri il documento per leggere importo e scadenza.']};
    const hint=senderHint(learnedSenders,sender,senderAuth);
    if(hint){suggestion.learned_supplier_hint=hint.supplier;suggestion.sender_match=hint.match;}
    // A sender hint must not override a supplier read from the document.
    suggestion.sender_auth=senderAuth;
    const {error}=await admin.from('mail_documents').insert({
      user_id:connection.user_id,connection_id:connection.id,message_id:String(messageId),attachment_id:String(attachmentId),
      filename:safeFileName(filename),mime_type:mime,storage_path:storagePath,size_bytes:file.length,
      subject:String(subject).slice(0,240),sender:String(sender).slice(0,240),received_at:receivedAt||new Date().toISOString(),suggestion
    });
    if(error){if(error.code==='23505')return false;throw error;}
    committed=true;
    return true;
  }finally{
    // Roll back orphaned uploads if insertion fails or a duplicate was detected.
    if(!committed)await admin.storage.from(MAIL_BUCKET).remove([storagePath]);
  }
}
