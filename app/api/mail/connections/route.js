import { authenticatedUser, getAdmin, json, failure, publicError } from '../../../../lib/server.mjs';
import {decryptSecret,encryptSecret} from '../../../../lib/mail-core.mjs';
import {verifyImapCredentials} from '../../../../lib/mail-imap.mjs';
import {isImapProvider} from '../../../../lib/mail-providers.mjs';
import {mailStartMessage} from '../../../../lib/mail-api-i18n.mjs';
const message=(request,key)=>mailStartMessage(key,request.headers.get('accept-language'));
export const runtime='nodejs';
export const maxDuration=30;
export async function GET(request){
  const user=await authenticatedUser(request);if(!user)return json({error:message(request,'connectionsLogin')},401);
  const {data,error}=await getAdmin().from('mail_connections').select('id,provider,email_address,status,last_error,last_sync_at,created_at').eq('user_id',user.id).order('created_at',{ascending:false});
  return error?failure(error,message(request,'connectionsLoad'),500,'mail/connections'):json({connections:data||[]});
}
export async function POST(request){
  const user=await authenticatedUser(request);if(!user)return json({error:message(request,'connectionsLogin')},401);
  const input=await request.json().catch(()=>({}));
  if(!isImapProvider(input.provider))return json({error:message(request,'connectionsProvider')},400);
  const admin=getAdmin();
  // Failed logins count too; prevents using this API as a brute-force IMAP proxy.
  const {count,error:attemptError}=await admin.from('mail_connection_attempts').select('id',{head:true,count:'exact'}).eq('user_id',user.id).gte('created_at',new Date(Date.now()-15*60_000).toISOString());
  if(attemptError)return json({error:message(request,'connectionsDatabase')},503);
  if((count||0)>=5)return json({error:message(request,'connectionsRate')},429);
  const {count:total}=await admin.from('mail_connections').select('id',{head:true,count:'exact'}).eq('user_id',user.id);
  if((total||0)>=12)return json({error:message(request,'connectionsLimit')},429);
  const {error:logError}=await admin.from('mail_connection_attempts').insert({user_id:user.id});
  if(logError)return json({error:message(request,'connectionsLog')},503);
  try{
    const valid=await verifyImapCredentials(input);
    const {error}=await admin.from('mail_connections').upsert({
      user_id:user.id,provider:valid.provider,email_address:valid.email_address,imap_login:valid.imap_login,
      refresh_token_enc:encryptSecret(valid.password),status:'active',last_error:null
    },{onConflict:'user_id,provider,email_address'});
    if(error)throw publicError(message(request,'connectionsSave'));
    return json({ok:true});
  }catch(e){return failure(e,message(request,'connectionsConnect'),500,'mail/connections');}
}
export async function DELETE(request){
  const user=await authenticatedUser(request);if(!user)return json({error:message(request,'connectionsLogin')},401);
  const {id}=await request.json().catch(()=>({}));
  if(!/^[0-9a-f-]{36}$/i.test(String(id)))return json({error:message(request,'syncId')},400);
  const admin=getAdmin();
  const {data,error}=await admin.from('mail_connections').delete().eq('user_id',user.id).eq('id',id).select('id,provider,refresh_token_enc').maybeSingle();
  if(error)return failure(error,message(request,'connectionsDisconnect'),500,'mail/connections');
  if(!data)return json({error:message(request,'syncMissing')},404);
  if(data.provider==='gmail'){
    let revoked=false;
    try {
      const response=await fetch('https://oauth2.googleapis.com/revoke',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token:decryptSecret(data.refresh_token_enc)})});
      revoked=response.ok;
    }catch{}
    return json({ok:true,revoked,notice:revoked?null:message(request,'connectionsGoogle')});
  }
  if(data.provider==='outlook')return json({ok:true,notice:message(request,'connectionsMicrosoft')});
  return json({ok:true,notice:message(request,'connectionsImap')});
}
