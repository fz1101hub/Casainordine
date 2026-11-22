import { authenticatedUser, getAdmin, json } from '../../../../lib/server.mjs';
import { syncConnection } from '../../../../lib/mail-sync.mjs';
export const runtime='nodejs';
export const maxDuration=60;
export async function POST(request){
  const user=await authenticatedUser(request);if(!user)return json({error:'syncLogin'},401);
  const {id}=await request.json().catch(()=>({}));
  if(!/^[0-9a-f-]{36}$/i.test(String(id)))return json({error:'invalidId'},400);
  const admin=getAdmin();
  const {data,error}=await admin.from('mail_connections').select('*').eq('id',id).eq('user_id',user.id).maybeSingle();
  if(error||!data)return json({error:'syncMissing'},404);
  if(data.status==='reconnect')return json({error:'syncReconnect'},409);
  // Anche i tentativi falliti contano (last_attempt_at, v3.3): niente richieste ripetute al provider.
  const last=[data.last_sync_at,data.last_attempt_at].filter(Boolean).map(x=>new Date(x).getTime()).sort((a,b)=>b-a)[0];
  if(last && Date.now()-last<5*60_000)return json({error:'syncRate'},429);
  if('last_attempt_at' in data)await admin.from('mail_connections').update({last_attempt_at:new Date().toISOString()}).eq('id',data.id).eq('user_id',user.id);
  const result=await syncConnection(admin,data,{messageLimit:25,docLimit:5});
  // Non esporre messaggi grezzi del provider o dettagli interni nel client.
  // Mantieni i contatori già elaborati anche quando la sincronizzazione fallisce.
  return json(result.error?{...result,error:'syncFailure'}:result,result.error?502:200);
}
