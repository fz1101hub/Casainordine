import { authenticatedUser,getAdmin,json } from '../../../../lib/server.mjs';
import { validPushSubscription } from '../../../../lib/push.mjs';

export async function GET(request){
 try{const user=await authenticatedUser(request);if(!user)return json({error:'Non autorizzato'},401);
 const {data,error}=await getAdmin().from('push_subscriptions').select('id,endpoint,created_at').eq('user_id',user.id);
 if(error)throw error;return json({subscriptions:data||[],enabled:!!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY});
 }catch(e){return json({error:e.message},500);}
}
export async function POST(request){
 try{const user=await authenticatedUser(request);if(!user)return json({error:'Non autorizzato'},401);
 const body=await request.json().catch(()=>null),parsed=validPushSubscription(body);
 if(!parsed)return json({error:'Sottoscrizione push non valida'},400);
 const admin=getAdmin();const {data:existing,error:findError}=await admin.from('push_subscriptions').select('user_id').eq('endpoint',parsed.endpoint).maybeSingle();
 if(findError)throw findError;if(existing&&existing.user_id!==user.id)return json({error:'Questo dispositivo risulta già associato a un altro account'},409);
 const {error}=await admin.from('push_subscriptions').upsert({...parsed,user_id:user.id},{onConflict:'endpoint'});
 if(error)throw error;return json({ok:true});
 }catch(e){return json({error:e.message},500);}
}
export async function DELETE(request){
 try{const user=await authenticatedUser(request);if(!user)return json({error:'Non autorizzato'},401);
 const {endpoint}=await request.json().catch(()=>({}));if(!endpoint||typeof endpoint!=='string'||endpoint.length>2048)return json({error:'Endpoint richiesto'},400);
 const {error}=await getAdmin().from('push_subscriptions').delete().eq('user_id',user.id).eq('endpoint',endpoint);
 if(error)throw error;return json({ok:true});
 }catch(e){return json({error:e.message},500);}
}
