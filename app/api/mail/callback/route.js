import { getAdmin, publicAppUrl } from '../../../../lib/server.mjs';
import { hashState, decryptSecret, encryptSecret } from '../../../../lib/mail-core.mjs';
import { exchangeGoogleCode, mailboxAddress } from '../../../../lib/mail-google.mjs';
import { exchangeMicrosoftCode, microsoftMailboxAddress } from '../../../../lib/mail-microsoft.mjs';
import { browserBinding, clearOauthStateCookie, mailboxMatchesAccount } from '../../../../lib/oauth-binding.mjs';
export const runtime='nodejs';
export const maxDuration=30;
// Response.redirect() ha intestazioni immutabili: serve una risposta propria per cancellare il cookie.
// Si torna all'app da cui è partito il collegamento (APP_URL, o l'indirizzo della richiesta).
const redirect=(status,request)=>new Response(null,{status:303,headers:{
  Location:new URL(`/?mail=${encodeURIComponent(status)}`,publicAppUrl(request)).toString(),
  'Set-Cookie':clearOauthStateCookie(),'Cache-Control':'no-store'
}});
export async function GET(request){
  const url=new URL(request.url),state=url.searchParams.get('state'),code=url.searchParams.get('code');
  if(!state||!/^[-_a-zA-Z0-9]{30,160}$/.test(state))return redirect('invalid_state',request);
  const binding=browserBinding(request.headers.get('cookie'),state);
  try{
    const admin=getAdmin();
    // Consume state once, independent of provider and callback replay.
    const {data:pending,error}=await admin.from('mail_oauth_states').delete().eq('state_hash',hashState(state)).select('user_id,provider,verifier_enc,expires_at').maybeSingle();
    if(error||!pending||new Date(pending.expires_at).getTime()<Date.now())return redirect('expired',request);
    // Il browser sta completando un collegamento diverso da quello che ha avviato.
    if(binding==='mismatch')return redirect('other_browser',request);
    if(url.searchParams.get('error'))return redirect('denied',request);
    if(!code)return redirect('failed',request);
    const provider=pending.provider||'gmail';
    if(!['gmail','outlook'].includes(provider))return redirect('failed',request);
    const verifier=decryptSecret(pending.verifier_enc);
    const tokens=provider==='gmail'?await exchangeGoogleCode(code,verifier):await exchangeMicrosoftCode(code,verifier);
    if(!tokens.refresh_token)return redirect('no_refresh',request);
    const email=provider==='gmail'?await mailboxAddress(tokens.access_token):await microsoftMailboxAddress(tokens.access_token);
    if(binding==='missing'){
      // Nessun cookie (per esempio web app su iPhone che apre l'accesso in un browser separato):
      // si collega solo la casella con lo stesso indirizzo, verificato, dell'account.
      const {data:account,error:accountError}=await admin.auth.admin.getUserById(pending.user_id);
      if(accountError||!mailboxMatchesAccount(account?.user,email))return redirect('other_browser',request);
    }
    const {error:upsertError}=await admin.from('mail_connections').upsert({
      user_id:pending.user_id,provider,email_address:email,
      refresh_token_enc:encryptSecret(tokens.refresh_token),imap_login:null,status:'active',last_error:null
    },{onConflict:'user_id,provider,email_address'});
    if(upsertError)throw upsertError;
    return redirect('connected',request);
  }catch{return redirect('failed',request);}
}
