import {getAdmin,hashToken} from '../../../lib/server.mjs';
export const dynamic='force-dynamic';
export const metadata={title:'Istruzioni temporanee · Casa in Ordine',robots:{index:false,follow:false},referrer:'no-referrer'};
export default async function SharedVacation({params}){
 const {token}=await params;let shared=null;
 if(/^[a-f0-9]{64}$/.test(token||'')){
  try{
   const {data,error}=await getAdmin().from('home_vacation_shares').select('shared_text,expires_at,revoked_at').eq('token_hash',hashToken(token)).maybeSingle();
   if(!error&&data&&!data.revoked_at&&Date.parse(data.expires_at)>Date.now())shared=data;
  }catch{}
 }
 return <main style={{fontFamily:'system-ui',maxWidth:650,padding:30,margin:'auto',lineHeight:1.7}}><h1>Casa in Ordine · Condivisione temporanea</h1>{shared?<><p>Informazioni scelte dal proprietario della casa:</p><div style={{whiteSpace:'pre-wrap',padding:22,border:'1px solid #ccc',borderRadius:12}}>{shared.shared_text}</div><small>Link valido fino al {new Date(shared.expires_at).toLocaleString('it-IT',{timeZone:'Europe/Rome'})}, salvo revoca anticipata.</small></>:<p>Questa condivisione è scaduta, revocata o non esiste.</p>}<p><small>Non usare queste istruzioni al posto dei numeri di emergenza ufficiali.</small></p></main>;
}
