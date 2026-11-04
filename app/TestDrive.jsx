'use client';
import {useEffect,useMemo,useState} from 'react';
import Link from 'next/link';
import {ArrowLeft,Bell,Check,CheckCircle2,ChevronRight,ClipboardCheck,House,LayoutDashboard,ListChecks,ReceiptText,RotateCcw,ShoppingBasket,ShieldCheck,X} from 'lucide-react';
import PersonalizedHome from './PersonalizedHome';
import {createDemoFixtures,restoreDemoFixtures,DEMO_STORAGE_KEY} from '../lib/test-fixtures.mjs';
import {buildFiveMinuteBriefing} from '../lib/v21-core.mjs';
import {todayRome,euro} from '../lib/dates.mjs';

const NAV=[
 {id:'dashboard',title:'La mia Home',icon:House},
 {id:'bills',title:'Bollette',icon:ReceiptText},
 {id:'shopping',title:'Spesa',icon:ShoppingBasket},
 {id:'tasks',title:'Attività',icon:ListChecks},
 {id:'briefing',title:'5 minuti',icon:ClipboardCheck},
 {id:'overview',title:'Panoramica',icon:LayoutDashboard}
];
const when=(d)=>d?new Date(d+'T12:00:00Z').toLocaleDateString('it-IT',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}):'Senza data';
const HOME_DEMO_PREFS_KEY='casainordine-home-v3-demo';

export default function TestDrive(){
 const [data,setData]=useState(()=>createDemoFixtures());
 const [screen,setScreen]=useState('dashboard');
 const [loaded,setLoaded]=useState(false);
 const [homeKey,setHomeKey]=useState(0);
 const [notice,setNotice]=useState('');
 useEffect(()=>{
  try{
   const saved=localStorage.getItem(DEMO_STORAGE_KEY);
   if(saved)setData(restoreDemoFixtures(JSON.parse(saved)));
  }catch{setData(createDemoFixtures());}
  setLoaded(true);
 },[]);
 useEffect(()=>{
  if(!loaded)return;
  try{localStorage.setItem(DEMO_STORAGE_KEY,JSON.stringify(data));}catch{}
 },[data,loaded]);
 const extras=useMemo(()=>({shopping:data.shopping,assets:data.assets,contracts:data.contracts,decisions:data.decisions,inventory:data.inventory}),[data]);
 const tasksOpen=data.tasks.filter(t=>!t.done_at), billsOpen=data.bills.filter(b=>!b.paid_at);
 const briefing=useMemo(()=>buildFiveMinuteBriefing({bills:data.bills,tasks:data.tasks,assets:data.assets,contracts:data.contracts,decisions:data.decisions,inventory:data.inventory,today:todayRome()}),[data]);
 const nav=id=>{setScreen(NAV.some(n=>n.id===id)?id:'overview');setNotice('');if(typeof window!=='undefined')window.scrollTo({top:0,behavior:'smooth'});};
 const toggleBill=(bill)=>{setData(old=>({...old,bills:old.bills.map(b=>b.id===bill.id?{...b,paid_at:b.paid_at?null:new Date().toISOString()}:b)}));setNotice('Stato della bolletta aggiornato solo nella prova.');};
 const toggleTask=(task)=>{setData(old=>({...old,tasks:old.tasks.map(t=>t.id===task.id?{...t,done_at:t.done_at?null:new Date().toISOString()}:t)}));setNotice('Attività aggiornata solo nella prova.');};
 const toggleShopping=(id)=>{setData(old=>({...old,shopping:old.shopping.map(x=>x.id===id?{...x,checked:!x.checked}:x)}));setNotice('Lista della spesa aggiornata solo nella prova.');};
 const reset=()=>{
  if(!window.confirm('Ripristinare i dati fittizi e la Home di prova? Le modifiche reali non saranno toccate.'))return;
  localStorage.removeItem(DEMO_STORAGE_KEY);
  localStorage.removeItem(HOME_DEMO_PREFS_KEY);
  setData(createDemoFixtures());setHomeKey(x=>x+1);setScreen('dashboard');setNotice('Dati di prova ripristinati.');
 };
 const current=NAV.find(x=>x.id===screen);
 return <div className="testdrive">
  <div className="testdrive-top">
   <div className="testdrive-brand"><span className="testdrive-logo"><House size={20}/></span>
     <div><b>Casa in Ordine</b><small>Ambiente di prova · Profilo Demo</small></div>
   </div>
   <div className="testdrive-top-actions">
     <button type="button" onClick={reset} className="btn btn-soft"><RotateCcw size={16}/> Ripristina prova</button>
     <Link className="btn btn-soft" href="/"><ArrowLeft size={16}/> Accedi o registrati</Link>
   </div>
  </div>
  <div className="testdrive-banner" role="note"><ShieldCheck size={19}/><span><b>Questi sono dati inventati.</b> Puoi segnare bollette pagate, completare attività, spuntare prodotti e personalizzare la Home. Tutte le modifiche restano in questo browser: nessun dato viene inviato a Supabase e nessun pagamento è reale.</span></div>
  <nav className="testdrive-navigation" aria-label="Navigazione della prova">{NAV.map(({id,title,icon:Icon})=><button type="button" className={screen===id?'active':''} key={id} onClick={()=>nav(id)} aria-current={screen===id?'page':undefined}><Icon size={17}/>{title}</button>)}</nav>
  {notice&&<div className="testdrive-notice" role="status"><CheckCircle2 size={17}/><span>{notice}</span><button type="button" aria-label="Chiudi" onClick={()=>setNotice('')}><X size={16}/></button></div>}
  <main className="testdrive-main">
   {screen==='dashboard'&&<PersonalizedHome key={homeKey} client={null} demo={true} user={null} homeId="demo-home" canWrite={true}
       bills={data.bills} tasks={data.tasks} displayName="Demo"
       sampleExtras={extras} onSampleShoppingChange={toggleShopping}
       onNavigate={nav} onNewBill={()=>nav('bills')} onNewTask={()=>nav('tasks')}
       onPay={toggleBill} onToggleTask={toggleTask} onRefresh={()=>{}} onNotify={setNotice}/>}
   {screen==='overview'&&<div className="testdrive-view">
     <div className="page-heading"><div><div className="eyebrow">PANORAMICA COMPLETA</div><h1>La casa di esempio</h1><p>Una fotografia dei dati fittizi del tuo profilo di prova.</p></div></div>
     <div className="testdrive-stats">
      <div className="panel"><small>Bollette da pagare</small><strong>{billsOpen.length}</strong><span>{euro(billsOpen.reduce((s,b)=>s+b.amount,0))}</span></div>
      <div className="panel"><small>Attività in sospeso</small><strong>{tasksOpen.length}</strong><span>Da organizzare</span></div>
      <div className="panel"><small>Prodotti da acquistare</small><strong>{data.shopping.filter(x=>!x.checked).length}</strong><span>Lista condivisa simulata</span></div>
      <div className="panel"><small>Azioni importanti</small><strong>{briefing.length}</strong><span>La casa in 5 minuti</span></div>
     </div>
     <div className="panel testdrive-help"><h2>Come provare Casa in Ordine</h2><p>Torna alla Home, premi <b>Personalizza</b>, trascina idealmente i moduli usando le frecce, disattiva quelli meno utili e premi <b>Salva la mia Home</b>. Puoi anche segnare una bolletta pagata o un prodotto acquistato. Le variazioni saranno conservate solo nel tuo browser.</p><button className="btn btn-primary" onClick={()=>nav('dashboard')}>Apri la Home personalizzabile <ChevronRight size={17}/></button></div>
   </div>}
   {screen==='bills'&&<div className="testdrive-view">
     <div className="page-heading"><div><div className="eyebrow">ESEMPIO DI SCADENZE</div><h1>Bollette di prova</h1><p>Segna pagate le fatture fittizie per vedere come cambia la Home.</p></div></div>
     <div className="panel testdrive-list">{data.bills.slice().sort((a,b)=>a.due_date.localeCompare(b.due_date)).map(b=><div className="testdrive-line" key={b.id}>
      <span className={'testdrive-status '+(b.paid_at?'done':'open')}><ReceiptText size={20}/></span>
      <div className="testdrive-line-text"><b>{b.title}</b><small>{b.supplier} · {when(b.due_date)} · {b.paid_at?'Pagata':'Da pagare'}</small></div>
      <strong>{euro(b.amount)}</strong><button className="btn btn-soft" type="button" onClick={()=>toggleBill(b)}>{b.paid_at?'Riapri':'Segna pagata'}</button>
     </div>)}</div>
   </div>}
   {screen==='shopping'&&<div className="testdrive-view">
     <div className="page-heading"><div><div className="eyebrow">CASA CONDIVISA · SIMULAZIONE</div><h1>Lista della spesa</h1><p>Spunta un articolo: sarà aggiornato anche nella Home.</p></div></div>
     <div className="panel testdrive-list">{data.shopping.map(item=><label key={item.id} className="testdrive-line testdrive-checkline"><input type="checkbox" checked={item.checked} onChange={()=>toggleShopping(item.id)}/><span className="testdrive-line-text"><b className={item.checked?'testdrive-crossed':''}>{item.title}</b><small>{item.quantity}</small></span><span>{item.checked?'Acquistato':'Da comprare'}</span></label>)}</div>
   </div>}
   {screen==='tasks'&&<div className="testdrive-view">
     <div className="page-heading"><div><div className="eyebrow">GESTIONE QUOTIDIANA</div><h1>Attività di casa</h1><p>Completa una delle attività fittizie.</p></div></div>
     <div className="panel testdrive-list">{data.tasks.map(task=><label key={task.id} className="testdrive-line testdrive-checkline"><input type="checkbox" checked={!!task.done_at} onChange={()=>toggleTask(task)}/><span className="testdrive-line-text"><b className={task.done_at?'testdrive-crossed':''}>{task.title}</b><small>Scadenza: {when(task.due_date)}</small></span><span>{task.done_at?'Completata':'Da fare'}</span></label>)}</div>
   </div>}
   {screen==='briefing'&&<div className="testdrive-view">
     <div className="page-heading"><div><div className="eyebrow">UN RIEPILOGO SEMPLICE</div><h1>La casa in 5 minuti</h1><p>Le cinque azioni più urgenti, calcolate automaticamente sui dati fittizi.</p></div></div>
     <div className="panel testdrive-list">{briefing.length?briefing.map((item,index)=><div className="testdrive-line" key={item.id}><span className="testdrive-rank">{index+1}</span><div className="testdrive-line-text"><b>{item.label}</b><small>{item.detail}</small></div><button type="button" className="btn btn-soft" onClick={()=>nav(item.section)}><ChevronRight size={17}/> Apri</button></div>):<p>Hai già sistemato tutte le priorità principali della prova.</p>}</div>
   </div>}
  </main>
  <footer className="testdrive-footer">Profilo Demo · Nessuna registrazione · Nessuna email o notifica reale · I dati non escono da questo browser</footer>
 </div>;
}
