'use client';
import {useEffect,useRef,useState} from 'react';
import {CalendarDays,Copy,RotateCcw,Trash2} from 'lucide-react';
import {useLanguage} from './LanguageProvider';
import {localizeSettingsApiError} from '../lib/settings-api-errors.mjs';
import { askConfirm, askText } from './ConfirmDialog';
export default function CalendarFeed({client,onNotify}){
 const {t,language}=useLanguage();
 const [active,setActive]=useState(false),[url,setUrl]=useState(''),[busy,setBusy]=useState(false);
 const authGeneration=useRef(0);
 async function request(method){const {data:{session}}=await client.auth.getSession();const res=await fetch('/api/calendar/feed',{method,headers:{Authorization:`Bearer ${session?.access_token||''}`}});const body=await res.json().catch(()=>({}));if(!res.ok)throw new Error(body.error?localizeSettingsApiError(body.error,language):t('calendar.configError'));return body;}
 useEffect(()=>{
  let current=true;
  let generation=0;
  async function refresh(){
   const ticket=++generation;
   const authTicket=authGeneration.current;
   setActive(false);
   setUrl('');
   try {
    const result=await request('GET');
    if(current&&ticket===generation&&authGeneration.current===authTicket)setActive(Boolean(result.active));
   } catch {
    if(current&&ticket===generation)setActive(false);
   }
  }
  refresh();
  const {data:{subscription}}=client.auth.onAuthStateChange((event)=>{
   if(event==='SIGNED_IN'||event==='SIGNED_OUT'||event==='USER_UPDATED'){
    authGeneration.current++;
    generation++;
    setActive(false);
    setUrl('');
    setBusy(false);
    Promise.resolve().then(()=>{if(current)refresh();});
   }
  });
  return ()=>{current=false;generation++;authGeneration.current++;subscription?.unsubscribe();};
 },[client]);
 async function doAction(method){const ticket=authGeneration.current;setBusy(true);try{if(method==='DELETE'&&!(await askConfirm(t('calendar.revokeConfirm'),{danger:true})))return;
  if(ticket!==authGeneration.current)return;
  const data=await request(method);if(ticket!==authGeneration.current)return;setActive(method==='POST');setUrl(data.url||'');onNotify(t(method==='POST'?'calendar.created':'calendar.revoked'));
 }catch(e){if(ticket===authGeneration.current)onNotify(e.message);}finally{if(ticket===authGeneration.current)setBusy(false);}}
 return <div className="summary-settings"><h3><CalendarDays size={17}/> {t('calendar.title')}</h3><p>{t('calendar.description')}</p><div className="hub-home-choices"><button className="btn btn-soft" disabled={busy} onClick={()=>doAction('POST')}><RotateCcw size={16}/>{t(active?'calendar.regenerate':'calendar.create')}</button>{active&&<button className="btn btn-soft" disabled={busy} onClick={()=>doAction('DELETE')}><Trash2 size={15}/> {t('calendar.revoke')}</button>}</div>{url&&<div className="hub-invite-url"><small>{t('calendar.secretWarning')}</small><code>{url}</code><button className="btn btn-soft" onClick={()=>navigator.clipboard.writeText(url).then(()=>onNotify(t('calendar.copied'))).catch(()=>onNotify(t('calendar.copyFailed')))}><Copy size={15}/> {t('calendar.copyUrl')}</button></div>}</div>;
}
