'use client';
import {useEffect,useMemo,useState} from 'react';
import Link from 'next/link';
import {ArrowLeft,Bell,Check,CheckCircle2,ChevronRight,ClipboardCheck,House,LayoutDashboard,ListChecks,ReceiptText,RotateCcw,ShoppingBasket,ShieldCheck,X} from 'lucide-react';
import PersonalizedHome from './PersonalizedHome';
import {createDemoFixtures,restoreDemoFixtures,DEMO_STORAGE_KEY} from '../lib/test-fixtures.mjs';
import {buildFiveMinuteBriefing} from '../lib/v21-core.mjs';
import {todayRome} from '../lib/dates.mjs';
import {v21BriefingCopy} from '../lib/v21-briefing-copy.mjs';
import {v32DemoCopy} from '../lib/v32-demo-copy.mjs';
import {localizeDemoFixtures} from '../lib/v32-demo-fixture-labels.mjs';
import {useLanguage,LanguageSelector} from './LanguageProvider';
import { askConfirm, askText } from './ConfirmDialog';

const NAV=[
 {id:'dashboard',title:'La mia Home',icon:House},
 {id:'bills',title:'Bollette',icon:ReceiptText},
 {id:'shopping',title:'Spesa',icon:ShoppingBasket},
 {id:'tasks',title:'Attività',icon:ListChecks},
 {id:'briefing',title:'5 minuti',icon:ClipboardCheck},
 {id:'overview',title:'Panoramica',icon:LayoutDashboard}
];
const HOME_DEMO_PREFS_KEY='casainordine-home-v3-demo';

export default function TestDrive(){
 const {t:tr,date,money,language}=useLanguage();
 const copy=v32DemoCopy(language);
 const when=d=>date(d,{day:'numeric',month:'short',year:'numeric'});
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
 const displayData=useMemo(()=>localizeDemoFixtures(data,language),[data,language]);
 const extras=useMemo(()=>({shopping:displayData.shopping,assets:displayData.assets,contracts:displayData.contracts,decisions:displayData.decisions,inventory:displayData.inventory}),[displayData]);
 const tasksOpen=data.tasks.filter(t=>!t.done_at), billsOpen=data.bills.filter(b=>!b.paid_at);
 const briefing=useMemo(()=>buildFiveMinuteBriefing({bills:displayData.bills,tasks:displayData.tasks,assets:displayData.assets,contracts:displayData.contracts,decisions:displayData.decisions,inventory:displayData.inventory,today:todayRome(),copy:v21BriefingCopy(language)}),[displayData,language]);
 const nav=id=>{setScreen(NAV.some(n=>n.id===id)?id:'overview');setNotice('');if(typeof window!=='undefined')window.scrollTo({top:0,behavior:'smooth'});};
 const toggleBill=(bill)=>{setData(old=>({...old,bills:old.bills.map(b=>b.id===bill.id?{...b,paid_at:b.paid_at?null:new Date().toISOString()}:b)}));setNotice(tr('demo.updated.bill'));};
 const toggleTask=(task)=>{setData(old=>({...old,tasks:old.tasks.map(t=>t.id===task.id?{...t,done_at:t.done_at?null:new Date().toISOString()}:t)}));setNotice(tr('demo.updated.task'));};
 const toggleShopping=(id)=>{setData(old=>({...old,shopping:old.shopping.map(x=>x.id===id?{...x,checked:!x.checked}:x)}));setNotice(tr('demo.updated.shopping'));};
 const reset=async ()=>{
  if(!(await askConfirm(tr('demo.reset.confirm'),{danger:true})))return;
  localStorage.removeItem(DEMO_STORAGE_KEY);
  localStorage.removeItem(HOME_DEMO_PREFS_KEY);
  setData(createDemoFixtures());setHomeKey(x=>x+1);setScreen('dashboard');setNotice(tr('demo.reset.done'));
 };
 const current=NAV.find(x=>x.id===screen);
 return <div className="testdrive">
  {/* Intestazione: logo, lingua e pulsanti restano in una zona che i lettori di schermo riconoscono. */}
  <header>
  <div className="testdrive-top">
   <div className="testdrive-brand"><span className="testdrive-logo"><House size={20}/></span>
     <div><b>Casa in Ordine</b><small>{tr('demo.environment')}</small></div>
   </div>
   <div className="testdrive-top-actions"><LanguageSelector id="demo-language" label={false}/>
     <button type="button" onClick={reset} className="btn btn-soft"><RotateCcw size={16}/> {tr('demo.restore')}</button>
     <Link className="btn btn-soft" href="/"><ArrowLeft size={16}/> {tr('demo.signin')}</Link>
   </div>
  </div>
  <div className="testdrive-banner" role="note"><ShieldCheck size={19}/><span><b>{tr('demo.bannerStrong')}</b> {tr('demo.banner')}</span></div>
  </header>
  <nav className="testdrive-navigation" aria-label={copy.navigation}>{NAV.map(({id,title,icon:Icon})=><button type="button" className={screen===id?'active':''} key={id} onClick={()=>nav(id)} aria-current={screen===id?'page':undefined}><Icon size={17}/>{tr('nav.'+id)}</button>)}</nav>
  {notice&&<div className="testdrive-notice" role="status"><CheckCircle2 size={17}/><span>{notice}</span><button type="button" aria-label={copy.dismiss} onClick={()=>setNotice('')}><X size={16}/></button></div>}
  <main className="testdrive-main">
   {screen==='dashboard'&&<PersonalizedHome key={homeKey} client={null} demo={true} user={null} homeId="demo-home" canWrite={true}
       bills={displayData.bills} tasks={displayData.tasks} displayName="Demo"
       sampleExtras={extras} onSampleShoppingChange={toggleShopping}
       onNavigate={nav} onNewBill={()=>nav('bills')} onNewTask={()=>nav('tasks')}
       onPay={toggleBill} onToggleTask={toggleTask} onRefresh={()=>{}} onNotify={setNotice}/>}
   {screen==='overview'&&<div className="testdrive-view">
     <div className="page-heading"><div><div className="eyebrow">{tr('nav.overview')}</div><h1>{tr('demo.overview.title')}</h1><p>{tr('demo.overview.help')}</p></div></div>
     <div className="testdrive-stats">
      <div className="panel"><small>{tr('demo.overview.bills')}</small><strong>{billsOpen.length}</strong><span>{money(billsOpen.reduce((s,b)=>s+b.amount,0))}</span></div>
      <div className="panel"><small>{tr('demo.overview.tasks')}</small><strong>{tasksOpen.length}</strong><span>{copy.toOrganize}</span></div>
      <div className="panel"><small>{tr('demo.overview.shopping')}</small><strong>{data.shopping.filter(x=>!x.checked).length}</strong><span>{copy.sharedList}</span></div>
      <div className="panel"><small>{tr('demo.overview.important')}</small><strong>{briefing.length}</strong><span>{copy.fiveMinutes}</span></div>
     </div>
     <div className="panel testdrive-help"><h2>{tr('demo.overview.helpTitle')}</h2><p>{tr('demo.overview.guide')}</p><button className="btn btn-primary" onClick={()=>nav('dashboard')}>{tr('demo.overview.open')} <ChevronRight size={17}/></button></div>
   </div>}
   {screen==='bills'&&<div className="testdrive-view">
     <div className="page-heading"><div><div className="eyebrow">{copy.dueDates}</div><h1>{tr('demo.bill.title')}</h1><p>{tr('demo.bill.help')}</p></div></div>
     <div className="panel testdrive-list">{displayData.bills.slice().sort((a,b)=>a.due_date.localeCompare(b.due_date)).map(b=><div className="testdrive-line" key={b.id}>
      <span className={'testdrive-status '+(b.paid_at?'done':'open')}><ReceiptText size={20}/></span>
      <div className="testdrive-line-text"><b>{b.title}</b><small>{b.supplier} · {when(b.due_date)} · {tr(b.paid_at?'bill.paid':'bill.toPay')}</small></div>
      <strong>{money(b.amount)}</strong><button className="btn btn-soft" type="button" onClick={()=>toggleBill(b)}>{tr(b.paid_at?'demo.bill.reopen':'demo.bill.markPaid')}</button>
     </div>)}</div>
   </div>}
   {screen==='shopping'&&<div className="testdrive-view">
     <div className="page-heading"><div><div className="eyebrow">{copy.sharedSimulation}</div><h1>{tr('nav.shopping')}</h1><p>{tr('demo.shopping.help')}</p></div></div>
     <div className="panel testdrive-list">{displayData.shopping.map(item=><label key={item.id} className="testdrive-line testdrive-checkline"><input type="checkbox" checked={item.checked} onChange={()=>toggleShopping(item.id)}/><span className="testdrive-line-text"><b className={item.checked?'testdrive-crossed':''}>{item.title}</b><small>{item.quantity}</small></span><span>{tr(item.checked?'demo.shopping.bought':'demo.shopping.toBuy')}</span></label>)}</div>
   </div>}
   {screen==='tasks'&&<div className="testdrive-view">
     <div className="page-heading"><div><div className="eyebrow">{copy.dailyTasks}</div><h1>{tr('demo.tasks.title')}</h1><p>{tr('demo.tasks.help')}</p></div></div>
     <div className="panel testdrive-list">{displayData.tasks.map(task=><label key={task.id} className="testdrive-line testdrive-checkline"><input type="checkbox" checked={!!task.done_at} onChange={()=>toggleTask(task)}/><span className="testdrive-line-text"><b className={task.done_at?'testdrive-crossed':''}>{task.title}</b><small>{copy.taskDue.replace('{date}',when(task.due_date))}</small></span><span>{tr(task.done_at?'demo.tasks.complete':'demo.tasks.toDo')}</span></label>)}</div>
   </div>}
   {screen==='briefing'&&<div className="testdrive-view">
     <div className="page-heading"><div><div className="eyebrow">{copy.simpleSummary}</div><h1>{tr('nav.briefing')}</h1><p>{tr('demo.briefing.help')}</p></div></div>
     <div className="panel testdrive-list">{briefing.length?briefing.map((item,index)=><div className="testdrive-line" key={item.id}><span className="testdrive-rank">{index+1}</span><div className="testdrive-line-text"><b>{item.label}</b><small>{item.detail}</small></div><button type="button" className="btn btn-soft" onClick={()=>nav(item.section)}><ChevronRight size={17}/> {copy.open}</button></div>):<p>{tr('demo.briefing.empty')}</p>}</div>
   </div>}
  </main>
  <footer className="testdrive-footer">{tr('demo.footer')}</footer>
 </div>;
}
