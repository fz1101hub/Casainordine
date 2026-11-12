'use client';
import {useEffect,useState} from 'react';
import {BellRing} from 'lucide-react';
import {useLanguage} from './LanguageProvider';
import {localizeSettingsApiError} from '../lib/settings-api-errors.mjs';
function toBytes(base64){const padding='='.repeat((4-base64.length%4)%4);const s=atob((base64+padding).replace(/-/g,'+').replace(/_/g,'/'));return Uint8Array.from(s,x=>x.charCodeAt(0));}
export default function PushSettings({client,onNotify}){
 const {t,language}=useLanguage();
 const [enabled,setEnabled]=useState(false),[busy,setBusy]=useState(false),[supported,setSupported]=useState(false);
 const key=process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
 // Attive solo se l'iscrizione di questo browser appartiene all'account corrente (su un
 // dispositivo condiviso potrebbe essere rimasta quella di un altro account).
 async function ownedSubscription(subscription){
  if(!subscription)return false;
  const {subscriptions=[]}=await api('GET');
  return subscriptions.some(x=>x.endpoint===subscription.endpoint);
 }
 useEffect(()=>{
   let cancelled=false;
   setEnabled(false);
   setSupported('serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window&&location.protocol==='https:');
   if('serviceWorker' in navigator){
     navigator.serviceWorker.ready.then(r=>r.pushManager.getSubscription()).then(ownedSubscription)
       .then(value=>{if(!cancelled)setEnabled(value);})
       .catch(()=>{if(!cancelled)setEnabled(false);});
   }
   return ()=>{cancelled=true;};
 },[client]);
 async function api(method,body){const {data:{session}}=await client.auth.getSession();if(!session?.access_token)throw new Error(t('push.configError'));const r=await fetch('/api/push/subscribe',{method,headers:{'Authorization':`Bearer ${session?.access_token||''}`,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});const p=await r.json().catch(()=>({}));if(!r.ok)throw new Error(p.error?localizeSettingsApiError(p.error,language):t('push.configError'));return p;}
 async function toggle(){setBusy(true);try{
  // Prima di toccare una sottoscrizione del browser, verificare la sessione:
  // un logout durante la schermata impostazioni non deve disiscrivere il dispositivo.
  const {data:{session}}=await client.auth.getSession();
  if(!session?.access_token)throw new Error(t('push.configError'));
  const reg=await navigator.serviceWorker.ready;
  const existing=await reg.pushManager.getSubscription();
  if(existing&&!(await ownedSubscription(existing)))throw new Error(t('push.configError'));
  // Una sottoscrizione già appartenente all'utente non va eliminata solo perché
  // lo stato UI era temporaneamente falso durante il controllo asincrono.
  if(existing&&!enabled){setEnabled(true);onNotify(t('push.enabled'));return;}
  if(existing&&enabled){await api('DELETE',{endpoint:existing.endpoint});await existing.unsubscribe();setEnabled(false);onNotify(t('push.disabled'));}
  else{if(existing)await existing.unsubscribe().catch(()=>{});const permission=await Notification.requestPermission();if(permission!=='granted')throw new Error(t('push.permissionDenied'));
  const subscription=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:toBytes(key)});try{await api('POST',subscription.toJSON());}catch(e){await subscription.unsubscribe();throw e;}
  setEnabled(true);onNotify(t('push.enabled'));}
 }catch(e){onNotify(e.message);}finally{setBusy(false);}}
 return <div className="summary-settings"><h3><BellRing size={17}/> {t('push.title')}</h3><p>{t('push.description')}</p>{key&&supported?<button className="btn btn-soft" disabled={busy} onClick={toggle}>{t(enabled?'push.off':'push.on')}</button>:<small>{t('push.unavailable')}</small>}</div>;
}
