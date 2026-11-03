import {getAdmin,hashToken,json} from '../../../../../lib/server.mjs';
export const runtime='nodejs';
export async function GET(_request,{params}){
 try{
  const {token}=await params;
  if(!/^[a-f0-9]{64}$/.test(token||''))return json({error:'Condivisione non disponibile'},404);
  const admin=getAdmin();
  const {data,error}=await admin.from('home_vacation_shares').select('shared_text,expires_at,revoked_at').eq('token_hash',hashToken(token)).maybeSingle();
  if(error||!data||data.revoked_at||new Date(data.expires_at).getTime()<=Date.now())return json({error:'Condivisione scaduta o revocata'},404);
  return json({instructions:data.shared_text,expires_at:data.expires_at});
 }catch{return json({error:'Condivisione non disponibile'},503);}
}
