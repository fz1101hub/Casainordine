import {randomBytes} from 'node:crypto';
import {authenticatedUser,getAdmin,hashToken,json} from '../../../../lib/server.mjs';
export const runtime='nodejs';
export async function GET(request){
 try{const user=await authenticatedUser(request);if(!user)return json({error:'Non autorizzato'},401);
 const {data,error}=await getAdmin().from('calendar_feeds').select('created_at').eq('user_id',user.id).maybeSingle();
 if(error)throw error;return json({active:!!data,created_at:data?.created_at||null});
 }catch(e){return json({error:e.message},500);}
}
export async function POST(request){
 try{const user=await authenticatedUser(request);if(!user)return json({error:'Non autorizzato'},401);
 const token=randomBytes(32).toString('base64url');
 const {error}=await getAdmin().from('calendar_feeds').upsert({user_id:user.id,token_hash:hashToken(token),created_at:new Date().toISOString()});
 if(error)throw error;
 const origin=new URL(request.url).origin;
 return json({url:`${origin}/api/calendar/${token}`});
 }catch(e){return json({error:e.message},500);}
}
export async function DELETE(request){
 try{const user=await authenticatedUser(request);if(!user)return json({error:'Non autorizzato'},401);
 const {error}=await getAdmin().from('calendar_feeds').delete().eq('user_id',user.id);
 if(error)throw error;return json({ok:true});
 }catch(e){return json({error:e.message},500);}
}
