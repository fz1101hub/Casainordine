import { getAdmin,json,cronAuthorized } from '../../../../lib/server.mjs';
import { syncConnection } from '../../../../lib/mail-sync.mjs';
import { MAIL_BUCKET } from '../../../../lib/mail-core.mjs';
export const runtime='nodejs';
export const maxDuration=60;
export async function GET(request){
  if(!process.env.CRON_SECRET)return json({error:'CRON_SECRET mancante'},503);
  if(!cronAuthorized(request))return json({error:'Non autorizzato'},401);
  const admin=getAdmin();
  const started=Date.now();
  // Equità: si parte dalle caselle tentate meno di recente (last_attempt_at, migrazione v3.3).
  // Prima l'ordine era sull'ultima sincronizzazione RIUSCITA, quindi poche caselle sempre in
  // errore occupavano tutti i posti e le altre non venivano mai lette.
  let {data,error}=await admin.from('mail_connections').select('*').neq('status','reconnect').order('last_attempt_at',{ascending:true,nullsFirst:true}).limit(30);
  const attemptColumn=!error;
  if(error){
    // Migrazione v3.3 non ancora eseguita: comportamento precedente.
    ({data,error}=await admin.from('mail_connections').select('*').neq('status','reconnect').order('last_sync_at',{ascending:true,nullsFirst:true}).limit(8));
  }
  if(error)return json({error:'Impossibile leggere le caselle collegate.'},500);
  const results=[];
  for(const c of data||[]){
    // Il cron gira una volta al giorno: entro 60 secondi si elaborano più caselle possibile.
    if(Date.now()-started>40_000)break;
    const last=attemptColumn?(c.last_attempt_at||c.last_sync_at):c.last_sync_at;
    if(last&&Date.now()-new Date(last).getTime()<20*60*60_000)continue;
    if(attemptColumn)await admin.from('mail_connections').update({last_attempt_at:new Date().toISOString()}).eq('id',c.id);
    try{results.push({id:c.id,...await syncConnection(admin,c,{messageLimit:12,docLimit:3})});}
    catch{results.push({id:c.id,error:true,imported:0});}
  }
  // Expire OAuth states and clear abandoned private attachments after 45 days.
  await admin.from('mail_oauth_states').delete().lt('expires_at',new Date().toISOString());
  await admin.from('mail_connection_attempts').delete().lt('created_at',new Date(Date.now()-24*60*60_000).toISOString());
  const expiry=new Date(Date.now()-45*24*60*60_000).toISOString();
  const {data:old}=await admin.from('mail_documents').select('id,storage_path').eq('status','pending').lt('created_at',expiry).limit(100);
  let expired=0;
  for(const d of old||[]){
    const {error:storageError}=await admin.storage.from(MAIL_BUCKET).remove([d.storage_path]);
    if(storageError)continue;
    const {error:rowError}=await admin.from('mail_documents').update({status:'dismissed',filename:'[eliminato]',subject:null,sender:null,suggestion:{}}).eq('id',d.id);
    if(!rowError)expired++;
  }
  // Data minimization: keep pending evidence up to 120 days, older history up to 365.
  const receiptsCutoff=new Date(Date.now()-120*86400000).toISOString();
  const historyCutoff=new Date(Date.now()-365*86400000).toISOString();
  await admin.from('mail_payment_evidence').delete().eq('status','pending').lt('created_at',receiptsCutoff);
  await admin.from('mail_payment_evidence').delete().in('status',['dismissed','confirmed','auto_confirmed']).lt('created_at',historyCutoff);
  return json({ok:results.every(x=>!x.error),connections:results.length,documents_found:results.reduce((n,x)=>n+x.imported,0),payment_candidates:results.reduce((n,x)=>n+(x.payment_candidates||0),0),payments_confirmed:results.reduce((n,x)=>n+(x.payments_confirmed||0),0),expired_documents:expired,failures:results.filter(x=>x.error).length});
}
