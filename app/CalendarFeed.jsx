'use client';
import {useEffect,useState} from 'react';
import {CalendarDays,Copy,RotateCcw,Trash2} from 'lucide-react';
export default function CalendarFeed({client,onNotify}){
 const [active,setActive]=useState(false),[url,setUrl]=useState(''),[busy,setBusy]=useState(false);
 async function request(method){const {data:{session}}=await client.auth.getSession();const res=await fetch('/api/calendar/feed',{method,headers:{Authorization:`Bearer ${session?.access_token||''}`}});const body=await res.json().catch(()=>({}));if(!res.ok)throw new Error(body.error||'Errore di configurazione');return body;}
 useEffect(()=>{request('GET').then(v=>setActive(v.active)).catch(()=>{});},[client]);
 async function doAction(method){setBusy(true);try{if(method==='DELETE'&&!window.confirm('Revocare il collegamento del calendario? Gli eventi già importati potrebbero restare nel dispositivo.'))return;
  const data=await request(method);setActive(method==='POST');setUrl(data.url||'');onNotify(method==='POST'?'Nuovo calendario creato: copia il collegamento.':'Calendario revocato.');
 }catch(e){onNotify(e.message);}finally{setBusy(false);}}
 return <div className="summary-settings"><h3><CalendarDays size={17}/> Calendario sincronizzabile (sola lettura)</h3><p>Genera un collegamento privato da aggiungere come calendario in abbonamento sul telefono. Le scadenze non pagate si aggiornano quando il calendario le riscarica; la frequenza dipende dal servizio calendario. Non è una sincronizzazione bidirezionale.</p><div className="hub-home-choices"><button className="btn btn-soft" disabled={busy} onClick={()=>doAction('POST')}><RotateCcw size={16}/>{active?'Rigenera collegamento':'Attiva calendario'}</button>{active&&<button className="btn btn-soft" disabled={busy} onClick={()=>doAction('DELETE')}><Trash2 size={15}/> Revoca</button>}</div>{url&&<div className="hub-invite-url"><small>Link segreto: chiunque lo possieda può leggere i tuoi eventi. Non pubblicarlo né inoltrarlo.</small><code>{url}</code><button className="btn btn-soft" onClick={()=>navigator.clipboard.writeText(url).then(()=>onNotify('Collegamento copiato.')).catch(()=>onNotify('Copia manualmente il collegamento.'))}><Copy size={15}/> Copia URL</button></div>}</div>;
}
