'use client';
import {useEffect,useState} from 'react';
import {BellRing} from 'lucide-react';
function toBytes(base64){const padding='='.repeat((4-base64.length%4)%4);const s=atob((base64+padding).replace(/-/g,'+').replace(/_/g,'/'));return Uint8Array.from(s,x=>x.charCodeAt(0));}
export default function PushSettings({client,onNotify}){
 const [enabled,setEnabled]=useState(false),[busy,setBusy]=useState(false),[supported,setSupported]=useState(false);
 const key=process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
 useEffect(()=>{setSupported('serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window&&location.protocol==='https:');
   if('serviceWorker' in navigator)navigator.serviceWorker.ready.then(r=>r.pushManager.getSubscription()).then(s=>setEnabled(!!s)).catch(()=>{});
 },[]);
 async function api(method,body){const {data:{session}}=await client.auth.getSession();const r=await fetch('/api/push/subscribe',{method,headers:{'Authorization':`Bearer ${session?.access_token||''}`,'Content-Type':'application/json'},body:JSON.stringify(body)});const p=await r.json().catch(()=>({}));if(!r.ok)throw new Error(p.error||'Impossibile configurare le notifiche');return p;}
 async function toggle(){setBusy(true);try{
  const reg=await navigator.serviceWorker.ready;
  const existing=await reg.pushManager.getSubscription();
  if(existing){await api('DELETE',{endpoint:existing.endpoint});await existing.unsubscribe();setEnabled(false);onNotify('Notifiche push disattivate su questo dispositivo.');}
  else{const permission=await Notification.requestPermission();if(permission!=='granted')throw new Error('Permesso notifiche non concesso');
  const subscription=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:toBytes(key)});try{await api('POST',subscription.toJSON());}catch(e){await subscription.unsubscribe();throw e;}
  setEnabled(true);onNotify('Notifiche attivate su questo dispositivo.');}
 }catch(e){onNotify(e.message);}finally{setBusy(false);}}
 return <div className="summary-settings"><h3><BellRing size={17}/> Notifiche push sul dispositivo</h3><p>Un avviso 3 giorni prima, se il pagamento non risulta registrato. Richiedono HTTPS, browser compatibile e configurazione VAPID sul server. Su iPhone la web app deve essere aggiunta alla schermata Home.</p>{key&&supported?<button className="btn btn-soft" disabled={busy} onClick={toggle}>{enabled?'Disattiva su questo dispositivo':'Attiva notifiche su questo dispositivo'}</button>:<small>Non disponibili in questa installazione: usa intanto le notifiche nell'app e le email configurate.</small>}</div>;
}
