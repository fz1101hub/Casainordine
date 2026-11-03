import { authenticatedUser, getAdmin, json } from '../../../../lib/server.mjs';
import { syncConnection } from '../../../../lib/mail-sync.mjs';
export const runtime='nodejs';
export const maxDuration=60;
export async function POST(request){
  const user=await authenticatedUser(request);if(!user)return json({error:'Non autorizzato'},401);
  const {id}=await request.json().catch(()=>({}));
  if(!/^[0-9a-f-]{36}$/i.test(String(id)))return json({error:'ID non valido'},400);
  const admin=getAdmin();
  const {data,error}=await admin.from('mail_connections').select('*').eq('id',id).eq('user_id',user.id).maybeSingle();
  if(error||!data)return json({error:'Casella non trovata'},404);
  if(data.status==='reconnect')return json({error:'Ricollega l’account prima di sincronizzare.'},409);
  if(data.last_sync_at && Date.now()-new Date(data.last_sync_at).getTime()<5*60_000)return json({error:'Sincronizzazione già eseguita recentemente. Riprova tra 5 minuti.'},429);
  const result=await syncConnection(admin,data,{messageLimit:25,docLimit:5});
  return json(result,result.error?502:200);
}
