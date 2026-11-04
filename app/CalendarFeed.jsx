'use client';
import {useEffect,useState} from 'react';
import {CalendarDays,Copy,RotateCcw,Trash2} from 'lucide-react';
import {useLanguage} from './LanguageProvider';
export default function CalendarFeed({client,onNotify}){
 const {t}=useLanguage();
 const [active,setActive]=useState(false),[url,setUrl]=useState(''),[busy,setBusy]=useState(false);
 async function request(method){const {data:{session}}=await client.auth.getSession();const res=await fetch('/api/calendar/feed',{method,headers:{Authorization:`Bearer ${session?.access_token||''}`}});const body=await res.json().catch(()=>({}));if(!res.ok)throw new Error(body.error||t('calendar.configError'));return body;}
 useEffect(()=>{request('GET').then(v=>setActive(v.active)).catch(()=>{});},[client]);
 async function doAction(method){setBusy(true);try{if(method==='DELETE'&&!window.confirm(t('calendar.revokeConfirm')))return;
  const data=await request(method);setActive(method==='POST');setUrl(data.url||'');onNotify(t(method==='POST'?'calendar.created':'calendar.revoked'));
 }catch(e){onNotify(e.message);}finally{setBusy(false);}}
 return <div className="summary-settings"><h3><CalendarDays size={17}/> {t('calendar.title')}</h3><p>{t('calendar.description')}</p><div className="hub-home-choices"><button className="btn btn-soft" disabled={busy} onClick={()=>doAction('POST')}><RotateCcw size={16}/>{t(active?'calendar.regenerate':'calendar.create')}</button>{active&&<button className="btn btn-soft" disabled={busy} onClick={()=>doAction('DELETE')}><Trash2 size={15}/> {t('calendar.revoke')}</button>}</div>{url&&<div className="hub-invite-url"><small>{t('calendar.secretWarning')}</small><code>{url}</code><button className="btn btn-soft" onClick={()=>navigator.clipboard.writeText(url).then(()=>onNotify(t('calendar.copied'))).catch(()=>onNotify(t('calendar.copyFailed')))}><Copy size={15}/> {t('calendar.copyUrl')}</button></div>}</div>;
}
