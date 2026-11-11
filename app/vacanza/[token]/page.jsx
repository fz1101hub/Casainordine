import {headers} from 'next/headers';
import {getAdmin,hashToken} from '../../../lib/server.mjs';
import {acceptedLanguage,localeFor,translate} from '../../../lib/i18n.mjs';
export const dynamic='force-dynamic';

// Pagina aperta da chi non ha un account (vicini, parenti): la lingua viene dal browser.
async function language(){return acceptedLanguage((await headers()).get('accept-language'));}
export async function generateMetadata(){
 const lang=await language();
 return {title:translate(lang,'share.vacation.metaTitle'),robots:{index:false,follow:false},referrer:'no-referrer'};
}
export default async function SharedVacation({params}){
 const {token}=await params;let shared=null;
 const lang=await language(),t=key=>translate(lang,key);
 if(/^[a-f0-9]{64}$/.test(token||'')){
  try{
   const {data,error}=await getAdmin().from('home_vacation_shares').select('shared_text,expires_at,revoked_at').eq('token_hash',hashToken(token)).maybeSingle();
   if(!error&&data&&!data.revoked_at&&Date.parse(data.expires_at)>Date.now())shared=data;
  }catch{}
 }
 const until=shared?new Date(shared.expires_at).toLocaleString(localeFor(lang),{timeZone:'Europe/Rome'}):'';
 return <main lang={localeFor(lang)} style={{fontFamily:'system-ui',maxWidth:650,padding:30,margin:'auto',lineHeight:1.7}}><h1>{t('share.vacation.heading')}</h1>{shared?<><p>{t('share.vacation.intro')}</p><div style={{whiteSpace:'pre-wrap',padding:22,border:'1px solid #ccc',borderRadius:12}}>{shared.shared_text}</div><small>{translate(lang,'share.vacation.validUntil',{date:until})}</small></>:<p>{t('share.vacation.unavailable')}</p>}<p><small>{t('share.vacation.emergency')}</small></p></main>;
}
