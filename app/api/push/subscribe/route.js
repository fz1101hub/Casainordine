import { authenticatedUser,getAdmin,json,failure } from '../../../../lib/server.mjs';
import { validPushSubscription } from '../../../../lib/push.mjs';
// Dispositivi per persona: il cron manda una notifica a ognuno, quindi un numero senza limite
// renderebbe lento il giro per tutti.
export const MAX_PUSH_DEVICES=10;

export async function GET(request){
 try{const user=await authenticatedUser(request);if(!user)return json({error:'unauthorized'},401);
 const {data,error}=await getAdmin().from('push_subscriptions').select('id,endpoint,created_at').eq('user_id',user.id);
 if(error)throw error;return json({subscriptions:data||[],enabled:!!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY});
 }catch(e){return failure(e,'pushLoad',500,'push');}
}
export async function POST(request){
 try{const user=await authenticatedUser(request);if(!user)return json({error:'unauthorized'},401);
 const body=await request.json().catch(()=>null),parsed=validPushSubscription(body);
 if(!parsed)return json({error:'pushInvalid'},400);
 const admin=getAdmin();const {data:existing,error:findError}=await admin.from('push_subscriptions').select('user_id').eq('endpoint',parsed.endpoint).maybeSingle();
 if(findError)throw findError;if(existing&&existing.user_id!==user.id)return json({error:'pushOtherAccount'},409);
 if(!existing){const {count,error:countError}=await admin.from('push_subscriptions').select('id',{count:'exact',head:true}).eq('user_id',user.id);
  if(countError)throw countError;if((count||0)>=MAX_PUSH_DEVICES)return json({error:'pushLimit'},429);}
 const {error}=await admin.from('push_subscriptions').upsert({...parsed,user_id:user.id},{onConflict:'endpoint'});
 if(error)throw error;return json({ok:true});
 }catch(e){return failure(e,'pushEnable',500,'push');}
}
export async function DELETE(request){
 try{const user=await authenticatedUser(request);if(!user)return json({error:'unauthorized'},401);
 const {endpoint}=await request.json().catch(()=>({}));if(!endpoint||typeof endpoint!=='string'||endpoint.length>2048)return json({error:'pushEndpoint'},400);
 const {error}=await getAdmin().from('push_subscriptions').delete().eq('user_id',user.id).eq('endpoint',endpoint);
 if(error)throw error;return json({ok:true});
 }catch(e){return failure(e,'pushDisable',500,'push');}
}
