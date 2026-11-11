import { authenticatedUser, getAdmin, json, failure } from '../../../../lib/server.mjs';
import { newOAuthState, hashState, newCodeVerifier, googleConsentUrl, encryptSecret } from '../../../../lib/mail-core.mjs';
import { microsoftConsentUrl } from '../../../../lib/mail-microsoft.mjs';
import { oauthStateCookie } from '../../../../lib/oauth-binding.mjs';
export const runtime='nodejs';
export async function POST(request){
  try {
    const user=await authenticatedUser(request);
    if(!user)return json({error:'Accedi per collegare una casella.'},401);
    const {provider='gmail'}=await request.json().catch(()=>({}));
    if(!['gmail','outlook'].includes(provider))return json({error:'Questo provider non usa OAuth.'},400);
    const admin=getAdmin();
    const {count,error:rateError}=await admin.from('mail_oauth_states').select('state_hash',{count:'exact',head:true}).eq('user_id',user.id).gte('created_at',new Date(Date.now()-10*60_000).toISOString());
    if(rateError)throw rateError;
    if((count||0)>=5)return json({error:'Troppi tentativi di collegamento: riprova tra 10 minuti.'},429);
    const state=newOAuthState(),verifier=newCodeVerifier();
    const url=provider==='gmail'?googleConsentUrl(state,verifier):microsoftConsentUrl(state,verifier);
    const {error}=await admin.from('mail_oauth_states').insert({state_hash:hashState(state),user_id:user.id,provider,verifier_enc:encryptSecret(verifier),expires_at:new Date(Date.now()+10*60_000).toISOString()});
    if(error)throw error;
    // Il cookie lega il ritorno da Google/Microsoft a questo browser (vedi lib/oauth-binding.mjs).
    return Response.json({url},{headers:{'Cache-Control':'no-store','Set-Cookie':oauthStateCookie(state)}});
  }catch(e){return failure(e,'Impossibile avviare il collegamento della casella: riprova più tardi.',500,'mail/start');}
}
