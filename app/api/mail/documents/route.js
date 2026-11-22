import { authenticatedUser, getAdmin, json, failure } from '../../../../lib/server.mjs';
import { mailStartMessage } from '../../../../lib/mail-api-i18n.mjs';
import { MAIL_BUCKET } from '../../../../lib/mail-core.mjs';
import { recordConfirmedBillSender } from '../../../../lib/mail-senders.mjs';
export const runtime='nodejs';
export async function GET(request){
  const user=await authenticatedUser(request);if(!user)return json({error:mailStartMessage('connectionsLogin',request.headers.get('accept-language'))},401);
  const {data,error}=await getAdmin().from('mail_documents').select('id,connection_id,filename,mime_type,storage_path,size_bytes,subject,sender,received_at,suggestion,status,created_at').eq('user_id',user.id).eq('status','pending').order('created_at',{ascending:false}).limit(100);
  return error?failure(error,mailStartMessage('documentsLoad',request.headers.get('accept-language')),500,'mail/documents'):json({documents:data||[]});
}
export async function PATCH(request){
  const message = key => mailStartMessage(key, request.headers.get('accept-language'));
  const user=await authenticatedUser(request);if(!user)return json({error:message('connectionsLogin')},401);
  const {id,action,bill_id}=await request.json().catch(()=>({}));
  const isUuid=x=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(x));
  if(!isUuid(id)||!['imported','dismissed'].includes(action)||
     (action==='imported'&&!isUuid(bill_id)))return json({error:message('documentsInvalid')},400);
  const admin=getAdmin();
  let bill=null;
  if(action==='imported'){
    const {data:row,error:billErr}=await admin.from('bills').select('id,supplier,source').eq('id',bill_id).eq('user_id',user.id).maybeSingle();
    if(billErr||!row||row.source!=='document')return json({error:message('documentsBillMissing')},400);
    bill=row;
  }
  // Read the original From/auth evidence BEFORE removing it for data minimization.
  // PostgREST UPDATE RETURNING contains the updated (cleared) values, not the original.
  const {data:original,error:readError}=await admin.from('mail_documents')
    .select('id,storage_path,sender,suggestion').eq('user_id',user.id).eq('id',id).eq('status','pending').maybeSingle();
  if(readError)return json({error:message('documentsRead')},500);
  if(!original)return json({error:message('documentsMissing')},404);
  const {data:updated,error}=await admin.from('mail_documents')
    .update({status:action,filename:'[eliminato]',subject:null,sender:null,suggestion:{}})
    .eq('user_id',user.id).eq('id',id).eq('status','pending').select('id').maybeSingle();
  if(error)return failure(error,message('documentsUpdate'),500,'mail/documents');
  if(!updated)return json({error:message('documentsProcessed')},409);
  let learningWarning='';
  if(action==='imported'){
    try{await recordConfirmedBillSender(admin,{userId:user.id,document:original,bill});}
    catch{learningWarning=message('documentsLearning');}
  }
  // Remove the original attachment after confirmation or dismissal; metadata retained for idempotency.
  const {error:storageError}=await admin.storage.from(MAIL_BUCKET).remove([original.storage_path]);
  if(storageError)return json({ok:true,warning:message('documentsStorage')});
  return json({ok:true,...(learningWarning?{warning:learningWarning}:{})});
}
