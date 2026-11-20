import { authenticatedUser, getAdmin, json } from '../../../../lib/server.mjs';
import { mailStartMessage } from '../../../../lib/mail-api-i18n.mjs';
export const runtime='nodejs';
const isId=x=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(x));
export async function GET(request){
  const user=await authenticatedUser(request);if(!user)return json({error:mailStartMessage('connectionsLogin',request.headers.get('accept-language'))},401);
  const {data,error}=await getAdmin().from('mail_bill_senders')
    .select('id,sender_email,sender_domain,supplier,auth_state,confirmed_at')
    .eq('user_id',user.id).order('confirmed_at',{ascending:false}).limit(200);
  return error?json({error:mailStartMessage('sendersLoad',request.headers.get('accept-language'))},500):json({senders:data||[]});
}
export async function DELETE(request){
  const user=await authenticatedUser(request);if(!user)return json({error:mailStartMessage('connectionsLogin',request.headers.get('accept-language'))},401);
  const {id}=await request.json().catch(()=>({}));
  if(!isId(id))return json({error:mailStartMessage('sendersId',request.headers.get('accept-language'))},400);
  const {error}=await getAdmin().from('mail_bill_senders').delete().eq('user_id',user.id).eq('id',id);
  return error?json({error:mailStartMessage('sendersRemove',request.headers.get('accept-language'))},500):json({ok:true});
}
