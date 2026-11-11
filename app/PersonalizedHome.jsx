'use client';
import {useEffect,useMemo,useState} from 'react';
import {
  ArrowDown,ArrowUp,Bell,Check,CheckCircle2,ChevronRight,Clock,ClipboardCheck,
  ListChecks,Plus,ReceiptText,RotateCcw,Save,Settings2,ShoppingBasket,Wallet
} from 'lucide-react';
import {todayRome} from '../lib/dates.mjs';
import {useLanguage} from './LanguageProvider';
import {buildFiveMinuteBriefing} from '../lib/v21-core.mjs';
import {v21BriefingCopy} from '../lib/v21-briefing-copy.mjs';
import { friendlyError } from '../lib/friendly-error.mjs';
import {
  DEFAULT_HOME_PREFERENCES,HOME_WIDGETS,normalizeHomePreferences,
  moveHomeWidget,toggleHomeWidget
} from '../lib/home-preferences.mjs';

const DEMO_KEY='casainordine-home-v3-demo';
const blankExtras=()=>({shopping:[],assets:[],contracts:[],decisions:[],inventory:[]});

function HomeWidget({title,icon:Icon,count,actionLabel,onAction,children}){
 return <section className="panel home3-card">
  <div className="home3-card-head">
   <div className="home3-card-name"><span className="home3-card-icon"><Icon size={19}/></span><div><h2>{title}</h2>{count&&<small>{count}</small>}</div></div>
   <button type="button" className="home3-card-link" onClick={onAction}>{actionLabel}<ChevronRight size={15}/></button>
  </div>
  <div className="home3-card-body">{children}</div>
 </section>;
}

export default function PersonalizedHome({
 client,demo,user,homeId,canWrite,bills=[],tasks=[],displayName='',
 sampleExtras=null,onSampleShoppingChange=()=>{},onNavigate,onNewBill,onNewTask,onPay,onToggleTask,onRefresh,onNotify=()=>{}
}){
 const {t:tr,money,date,language}=useLanguage();
 const shortDate=iso=>date(iso,{day:'numeric',month:'short'});
 const [prefs,setPrefs]=useState(()=>normalizeHomePreferences(DEFAULT_HOME_PREFERENCES));
 const [savedPrefs,setSavedPrefs]=useState(()=>normalizeHomePreferences(DEFAULT_HOME_PREFERENCES));
 const [prefsLoading,setPrefsLoading]=useState(true);
 const [editing,setEditing]=useState(false);
 const [saving,setSaving]=useState(false);
 const [status,setStatus]=useState('');
 const [error,setError]=useState('');
 const [extras,setExtras]=useState(blankExtras);
 const [extraLoading,setExtraLoading]=useState(false);
 const [extraError,setExtraError]=useState('');
 const [refreshKey,setRefreshKey]=useState(0);
 const [shoppingBusy,setShoppingBusy]=useState(false);
 const selected=prefs.widgets;
 const expanded=prefs.layout==='expanded';
 const dirty=JSON.stringify(prefs)!==JSON.stringify(savedPrefs);
 const available=useMemo(()=>[
  ...selected,
  ...HOME_WIDGETS.map(x=>x.id).filter(id=>!selected.includes(id))
 ],[selected.join('|')]);

 useEffect(()=>{
  let active=true;
  const load=async()=>{
   setPrefsLoading(true);setEditing(false);setError('');setStatus('');
   let next=normalizeHomePreferences(null);
   if(demo){
    try{const stored=localStorage.getItem(DEMO_KEY);if(stored)next=normalizeHomePreferences(JSON.parse(stored));}catch{}
   } else if(client&&user?.id){
    const {data,error:loadError}=await client.from('user_home_preferences')
      .select('widget_order,layout').eq('user_id',user.id).maybeSingle();
    if(loadError && active)setError(tr('home.loadError')+': '+friendlyError(loadError,tr));
    else if(data)next=normalizeHomePreferences(data);
   }
   if(active){setPrefs(next);setSavedPrefs(next);setPrefsLoading(false);}
  };
  load();
  return()=>{active=false;};
 },[client,demo,user?.id]);

 useEffect(()=>{let active=true;const run=async()=>{
  if(demo||!client){if(active){setExtras(demo&&sampleExtras?sampleExtras:blankExtras());setExtraError('');setExtraLoading(false);}return;}
  setExtraLoading(true);setExtraError('');
  const scope=q=>homeId?q.eq('home_id',homeId):q.is('home_id',null);
  const work=[
   homeId?client.from('home_shopping').select('id,title,quantity,checked').eq('home_id',homeId).order('checked').order('created_at',{ascending:false}).limit(100):Promise.resolve({data:[],error:null}),
   scope(client.from('maintenance_assets').select('id,name,next_service_on')).order('created_at',{ascending:false}).limit(150),
   scope(client.from('home_contracts').select('id,supplier,renewal_on')).order('created_at',{ascending:false}).limit(150),
   scope(client.from('home_decisions').select('id,title,status,closes_on')).order('created_at',{ascending:false}).limit(150),
   scope(client.from('home_inventory_items').select('id,name,document_id,estimated_value')).order('created_at',{ascending:false}).limit(150)
  ];
  const results=await Promise.all(work);
  if(!active)return;
  setExtras({shopping:results[0].data||[],assets:results[1].data||[],contracts:results[2].data||[],decisions:results[3].data||[],inventory:results[4].data||[]});
  setExtraLoading(false);
  const first=results.find(r=>r.error);
  if(first){console.error('[home]',first.error?.message||first.error);setExtraError(tr('home.extraUnavailable'));}
 };run();return()=>{active=false};},[client,demo,homeId,refreshKey,sampleExtras]);
 const openBills=useMemo(()=>bills.filter(b=>!b.paid_at).slice().sort((a,b)=>(a.due_date||'9999').localeCompare(b.due_date||'9999')),[bills]);
 const openTasks=useMemo(()=>tasks.filter(t=>!t.done_at).slice().sort((a,b)=>(a.due_date||'9999').localeCompare(b.due_date||'9999')),[tasks]);
 const uncheckedShopping=extras.shopping.filter(x=>!x.checked);
 const briefing=useMemo(()=>buildFiveMinuteBriefing({
  bills,tasks,assets:extras.assets,contracts:extras.contracts,
  decisions:extras.decisions,inventory:extras.inventory,today:todayRome(),
  // Senza i testi della lingua scelta il riquadro usava quelli italiani di riserva.
  copy:v21BriefingCopy(language)
 }),[bills,tasks,extras,language]);
 const limit=expanded?5:3;
 const dueAmount=openBills.reduce((sum,b)=>sum+(Number(b.amount)||0),0);
 const urgent=openBills.filter(b=>b.due_date&&b.due_date<=todayRome()).length;
 const reset=()=>{setPrefs(normalizeHomePreferences(null));setStatus('');};
 const cancel=()=>{setPrefs(normalizeHomePreferences(savedPrefs));setEditing(false);setError('');};
 const save=async()=>{
  if(saving)return;
  const next=normalizeHomePreferences(prefs);
  setSaving(true);setError('');setStatus('');
  try{
   if(demo)localStorage.setItem(DEMO_KEY,JSON.stringify(next));
   else {
    if(!client||!user?.id)throw new Error(tr('home.signInToSave'));
    const {error:saveError}=await client.from('user_home_preferences').upsert({
     user_id:user.id,widget_order:next.widgets,layout:next.layout,updated_at:new Date().toISOString()
    },{onConflict:'user_id'});
    if(saveError)throw saveError;
   }
   setSavedPrefs(next);setPrefs(next);setEditing(false);setStatus(tr('home.editor.saved'));
   onNotify(tr('home.editor.saved'));
  }catch(e){setError(tr('home.saveError')+': '+friendlyError(e,tr));}
  finally{setSaving(false);}
 };
 const refresh=()=>{setRefreshKey(x=>x+1);onRefresh?.();};
 const markShopping=async item=>{
  if(!canWrite||shoppingBusy)return;
  if(demo){onSampleShoppingChange(item.id);return;}
  if(!client||!homeId)return;
  setShoppingBusy(true);
  try{
   const {error:updateError}=await client.from('home_shopping').update({checked:!item.checked}).eq('id',item.id).eq('home_id',homeId);
   if(updateError)throw updateError;
   setExtras(old=>({...old,shopping:old.shopping.map(x=>x.id===item.id?{...x,checked:!item.checked}:x)}));
   onNotify(tr('home.shoppingUpdated'));
  }catch(e){console.error('[home]',e?.message||e);setExtraError(tr('home.shoppingFailed'));}
  finally{setShoppingBusy(false);}
 };
 const cards={
  bills:<HomeWidget key="bills" icon={ReceiptText} title={tr('home.widget.bills')}
    count={tr('home.widget.bills.count',{count:openBills.length,amount:money(dueAmount)})}
    onAction={()=>onNavigate('bills')} actionLabel={tr('home.openAll')}>
    {urgent>0&&<p className="home3-alert"><Bell size={15}/> {tr('home.widget.bills.alert',{count:urgent})}</p>}
    {openBills.length?<div className="home3-rows">{openBills.slice(0,limit).map(b=><div className="home3-item" key={b.id}>
      <div><b>{b.title}</b><small>{b.supplier||b.category} · {shortDate(b.due_date)}</small></div>
      <div className="home3-item-actions"><strong>{money(Number(b.amount)||0)}</strong>
       <button type="button" className="home3-check" title={tr('home.bill.markPaid',{title:b.title})} aria-label={tr('home.bill.markPaid',{title:b.title})} disabled={!canWrite} onClick={()=>onPay(b)}><Check size={17}/></button>
      </div></div>)}</div>:<p className="home3-empty">{tr('home.widget.bills.empty')}</p>}
    <div className="home3-footer"><button type="button" className="home3-small-link" onClick={onNewBill} disabled={!canWrite}><Plus size={15}/> {tr('home.widget.bills.new')}</button></div>
   </HomeWidget>,
  shopping:<HomeWidget key="shopping" icon={ShoppingBasket} title={tr('home.widget.shopping')}
   count={homeId?tr('home.widget.shopping.count',{count:uncheckedShopping.length}):tr('home.widget.shopping.shared')}
   actionLabel={tr(homeId?'home.widget.shopping.open':'home.widget.shopping.newhome')} onAction={()=>onNavigate(homeId?'shopping':'household')}>
   {!homeId?<p className="home3-empty">{tr('home.widget.shopping.nohome')}</p>:
    extraLoading?<p className="home3-empty">{tr('general.loading')}</p>:
    uncheckedShopping.length?<div className="home3-rows">{uncheckedShopping.slice(0,limit).map(item=><label className="home3-item home3-shop-item" key={item.id}>
     <input type="checkbox" checked={false} disabled={!canWrite||shoppingBusy} onChange={()=>markShopping(item)}/>
     <span><b>{item.title}</b><small>{tr('home.shop.quantity',{quantity:item.quantity||'1'})}</small></span>
    </label>)}</div>:<p className="home3-empty">{tr('home.widget.shopping.empty')}</p>}
   </HomeWidget>,
  tasks:<HomeWidget key="tasks" icon={ListChecks} title={tr('home.widget.tasks')}
   count={tr('home.widget.tasks.count',{count:openTasks.length})} actionLabel={tr('home.openAll')} onAction={()=>onNavigate('tasks')}>
   {openTasks.length?<div className="home3-rows">{openTasks.slice(0,limit).map(t=><label key={t.id} className="home3-item home3-shop-item">
    <input type="checkbox" disabled={!canWrite} checked={false} onChange={()=>onToggleTask(t)}/>
    <span><b>{t.title}</b><small>{t.due_date?tr('home.task.deadline',{date:shortDate(t.due_date)}):tr('home.task.noDate')}</small></span>
   </label>)}</div>:<p className="home3-empty">{tr('home.widget.tasks.empty')}</p>}
   <div className="home3-footer"><button type="button" className="home3-small-link" disabled={!canWrite} onClick={onNewTask}><Plus size={15}/> {tr('home.widget.tasks.new')}</button></div>
   </HomeWidget>,
  five_minutes:<HomeWidget key="five_minutes" icon={ClipboardCheck} title={tr('home.widget.briefing')}
   count={tr('home.widget.briefing.count')} actionLabel={tr('home.widget.briefing.open')} onAction={()=>onNavigate('briefing')}>
   {extraLoading?<p className="home3-empty">{tr('home.widget.briefing.loading')}</p>:
    briefing.length?<ol className="home3-priorities">{briefing.slice(0,expanded?5:3).map(x=><li key={x.id}><button type="button" onClick={()=>onNavigate(x.section)}>{x.label}<ChevronRight size={14}/></button></li>)}</ol>:
    <p className="home3-empty">{tr('home.widget.briefing.empty')}</p>}
   </HomeWidget>
 };
 return <div className="home3">
  <div className="page-heading home3-heading">
   <div><div className="eyebrow">{tr('home.eyebrow')}</div><h1>{tr('home.greeting',{who:displayName?', '+displayName:''})} <span className="wave">✳</span></h1>
    <p>{tr('home.subtitle')}</p></div>
   <div className="home3-heading-actions">
    <button type="button" className="btn btn-soft" onClick={refresh}><RotateCcw size={16}/> {tr('general.update')}</button>
    <button type="button" className="btn btn-primary" onClick={()=>setEditing(old=>!old)} aria-expanded={editing} aria-controls="home3-editor"><Settings2 size={17}/> {tr('home.personalize')}</button>
   </div>
  </div>
  {status&&<p role="status" className="home3-success"><CheckCircle2 size={16}/>{status}</p>}
  {error&&<p role="alert" className="home3-warning">{error}</p>}
  {editing&&<section className="panel home3-editor" id="home3-editor" aria-label={tr('home.editor.title')}>
   <h2>{tr('home.editor.title')}</h2>
   <p>{tr('home.editor.help')}</p>
   <div className="home3-editor-list">
    {available.map(id=>{
     const item=HOME_WIDGETS.find(x=>x.id===id),index=selected.indexOf(id),enabled=index>=0;
     return <div className="home3-editor-row" key={id}>
      <label><input type="checkbox" checked={enabled} disabled={enabled&&selected.length===1} onChange={()=>{setPrefs(old=>toggleHomeWidget(old,id));setStatus('');}}/><span>{tr('home.widget.'+(id==='five_minutes'?'briefing':id))}</span></label>
      <div className="home3-order">
       <button type="button" title={tr('home.moveUp')+': '+item.title} aria-label={tr('home.moveUp')+': '+item.title} disabled={!enabled||index===0} onClick={()=>setPrefs(old=>moveHomeWidget(old,id,-1))}><ArrowUp size={17}/></button>
       <button type="button" title={tr('home.moveDown')+': '+item.title} aria-label={tr('home.moveDown')+': '+item.title} disabled={!enabled||index===selected.length-1} onClick={()=>setPrefs(old=>moveHomeWidget(old,id,1))}><ArrowDown size={17}/></button>
      </div>
     </div>;
    })}
   </div>
   <fieldset className="home3-layout">
    <legend>{tr('home.editor.layout')}</legend>
    <label><input type="radio" name="home-layout" checked={!expanded} onChange={()=>setPrefs(old=>({...old,layout:'compact'}))}/> {tr('home.editor.compact')}</label>
    <label><input type="radio" name="home-layout" checked={expanded} onChange={()=>setPrefs(old=>({...old,layout:'expanded'}))}/> {tr('home.editor.expanded')}</label>
   </fieldset>
   <div className="home3-editor-actions">
    <button type="button" className="btn btn-soft" onClick={reset}><RotateCcw size={15}/> {tr('home.editor.default')}</button>
    <button type="button" className="btn btn-soft" onClick={cancel}>{tr('general.cancel')}</button>
    <button type="button" className="btn btn-primary" disabled={saving||prefsLoading||!dirty} onClick={save}><Save size={16}/>{tr(saving?'home.editor.saving':'home.editor.save')}</button>
   </div>
   <small>{tr('home.editor.privacy')}</small>
  </section>}
  {extraError&&<p className="home3-warning" role="status">{extraError}</p>}
  {prefsLoading?<div className="panel home3-loading"><Clock size={18}/> {tr('home.loading')}</div>:
   <div className={'home3-grid '+(expanded?'home3-expanded':'home3-compact')}>
    {selected.map(id=>cards[id])}
   </div>}
  <div className="home3-bottom">
   <span><Wallet size={16}/> {tr('home.overview.hint')}</span>
   <button type="button" className="home3-small-link" onClick={()=>onNavigate('overview')}>{tr('home.seeAll')} <ChevronRight size={15}/></button>
  </div>
 </div>;
}
