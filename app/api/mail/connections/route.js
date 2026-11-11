import { authenticatedUser, getAdmin, json, failure, publicError } from '../../../../lib/server.mjs';
import {decryptSecret,encryptSecret} from '../../../../lib/mail-core.mjs';
import {verifyImapCredentials} from '../../../../lib/mail-imap.mjs';
import {isImapProvider} from '../../../../lib/mail-providers.mjs';
export const runtime='nodejs';
export const maxDuration=30;
export async function GET(request){
  const user=await authenticatedUser(request);if(!user)return json({error:'Non autorizzato'},401);
  const {data,error}=await getAdmin().from('mail_connections').select('id,provider,email_address,status,last_error,last_sync_at,created_at').eq('user_id',user.id).order('created_at',{ascending:false});
  return error?failure(error,'Impossibile caricare le caselle collegate.',500,'mail/connections'):json({connections:data||[]});
}
export async function POST(request){
  const user=await authenticatedUser(request);if(!user)return json({error:'Non autorizzato'},401);
  const input=await request.json().catch(()=>({}));
  if(!isImapProvider(input.provider))return json({error:'Seleziona un provider IMAP disponibile.'},400);
  const admin=getAdmin();
  // Failed logins count too; prevents using this API as a brute-force IMAP proxy.
  const {count,error:attemptError}=await admin.from('mail_connection_attempts').select('id',{head:true,count:'exact'}).eq('user_id',user.id).gte('created_at',new Date(Date.now()-15*60_000).toISOString());
  if(attemptError)return json({error:'Configurazione database non aggiornata.'},503);
  if((count||0)>=5)return json({error:'Limite di tentativi raggiunto: riprova tra 15 minuti.'},429);
  const {count:total}=await admin.from('mail_connections').select('id',{head:true,count:'exact'}).eq('user_id',user.id);
  if((total||0)>=12)return json({error:'Limite di 12 caselle per account raggiunto.'},429);
  const {error:logError}=await admin.from('mail_connection_attempts').insert({user_id:user.id});
  if(logError)return json({error:'Impossibile registrare il tentativo.'},503);
  try{
    const valid=await verifyImapCredentials(input);
    const {error}=await admin.from('mail_connections').upsert({
      user_id:user.id,provider:valid.provider,email_address:valid.email_address,imap_login:valid.imap_login,
      refresh_token_enc:encryptSecret(valid.password),status:'active',last_error:null
    },{onConflict:'user_id,provider,email_address'});
    if(error)throw publicError('Impossibile salvare la connessione.');
    return json({ok:true});
  }catch(e){return failure(e,'Impossibile collegare la casella: riprova più tardi.',500,'mail/connections');}
}
export async function DELETE(request){
  const user=await authenticatedUser(request);if(!user)return json({error:'Non autorizzato'},401);
  const {id}=await request.json().catch(()=>({}));
  if(!/^[0-9a-f-]{36}$/i.test(String(id)))return json({error:'ID non valido'},400);
  const admin=getAdmin();
  const {data,error}=await admin.from('mail_connections').delete().eq('user_id',user.id).eq('id',id).select('id,provider,refresh_token_enc').maybeSingle();
  if(error)return failure(error,'Impossibile scollegare la casella.',500,'mail/connections');
  if(!data)return json({error:'Casella non trovata'},404);
  if(data.provider==='gmail'){
    let revoked=false;
    try {
      const response=await fetch('https://oauth2.googleapis.com/revoke',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token:decryptSecret(data.refresh_token_enc)})});
      revoked=response.ok;
    }catch{}
    return json({ok:true,revoked,notice:revoked?null:'Revoca anche il permesso dalle impostazioni Google.'});
  }
  if(data.provider==='outlook')return json({ok:true,notice:'Connessione rimossa. Puoi revocare il permesso anche nelle impostazioni privacy del tuo account Microsoft.'});
  return json({ok:true,notice:'Credenziale IMAP eliminata dall’app. Puoi revocare la password per app nelle impostazioni del provider.'});
}
