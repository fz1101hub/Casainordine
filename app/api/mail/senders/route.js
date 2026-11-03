import { authenticatedUser, getAdmin, json } from '../../../../lib/server.mjs';
export const runtime='nodejs';
const isId=x=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(x));
export async function GET(request){
  const user=await authenticatedUser(request);if(!user)return json({error:'Non autorizzato'},401);
  const {data,error}=await getAdmin().from('mail_bill_senders')
    .select('id,sender_email,sender_domain,supplier,auth_state,confirmed_at')
    .eq('user_id',user.id).order('confirmed_at',{ascending:false}).limit(200);
  return error?json({error:'Impossibile leggere i mittenti: verifica la migrazione v1.6.'},500):json({senders:data||[]});
}
export async function DELETE(request){
  const user=await authenticatedUser(request);if(!user)return json({error:'Non autorizzato'},401);
  const {id}=await request.json().catch(()=>({}));
  if(!isId(id))return json({error:'Identificativo non valido.'},400);
  const {error}=await getAdmin().from('mail_bill_senders').delete().eq('user_id',user.id).eq('id',id);
  return error?json({error:'Impossibile rimuovere il mittente.'},500):json({ok:true});
}
