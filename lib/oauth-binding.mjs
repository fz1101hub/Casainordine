import { timingSafeEqual } from 'node:crypto';

// Lega il collegamento OAuth della casella al browser che l'ha avviato (RFC 6749 §10.12):
// senza questo legame chiunque potrebbe mandare a un'altra persona il link di consenso
// generato dal proprio account e ricevere nella propria app la casella di quella persona.
export const OAUTH_COOKIE='cio_mail_oauth';
const COOKIE_PATH='/api/mail/callback';
const MAX_AGE_SECONDS=600;

function secureCookies(){
  const app=process.env.APP_URL||'';
  return app.startsWith('https://')||process.env.NODE_ENV==='production';
}
export function oauthStateCookie(state){
  return `${OAUTH_COOKIE}=${state}; Path=${COOKIE_PATH}; Max-Age=${MAX_AGE_SECONDS}; HttpOnly; SameSite=Lax${secureCookies()?'; Secure':''}`;
}
export function clearOauthStateCookie(){
  return `${OAUTH_COOKIE}=; Path=${COOKIE_PATH}; Max-Age=0; HttpOnly; SameSite=Lax${secureCookies()?'; Secure':''}`;
}
export function readCookie(header,name){
  for(const part of String(header||'').split(';')){
    const i=part.indexOf('=');
    if(i<0)continue;
    if(part.slice(0,i).trim()===name)return part.slice(i+1).trim();
  }
  return null;
}
export function sameSecret(a,b){
  const x=Buffer.from(String(a??'')),y=Buffer.from(String(b??''));
  return x.length>0&&x.length===y.length&&timingSafeEqual(x,y);
}
// 'bound'     : il browser che torna da Google/Microsoft è quello che ha avviato il collegamento.
// 'mismatch'  : il browser ha un altro collegamento in corso (link altrui o tentativo vecchio).
// 'missing'   : nessun cookie, per esempio su iPhone quando la web app apre l'accesso in un
//               browser separato. In questo caso si accetta solo la casella con lo stesso
//               indirizzo, già verificato, dell'account (vedi mailboxMatchesAccount).
export function browserBinding(cookieHeader,state){
  const saved=readCookie(cookieHeader,OAUTH_COOKIE);
  if(!saved)return 'missing';
  return sameSecret(saved,state)?'bound':'mismatch';
}
export function mailboxMatchesAccount(user,mailbox){
  const account=String(user?.email||'').trim().toLowerCase();
  const box=String(mailbox||'').trim().toLowerCase();
  return Boolean(user?.email_confirmed_at&&account&&box&&account===box);
}
