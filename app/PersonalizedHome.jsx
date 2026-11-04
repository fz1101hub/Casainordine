'use client';
import {useEffect,useMemo,useState} from 'react';
import {
  ArrowDown,ArrowUp,Bell,Check,CheckCircle2,ChevronRight,Clock,ClipboardCheck,
  ListChecks,Plus,ReceiptText,RotateCcw,Save,Settings2,ShoppingBasket,Wallet
} from 'lucide-react';
import {todayRome,euro} from '../lib/dates.mjs';
import {buildFiveMinuteBriefing} from '../lib/v21-core.mjs';
import {
  DEFAULT_HOME_PREFERENCES,HOME_WIDGETS,normalizeHomePreferences,
  moveHomeWidget,toggleHomeWidget
} from '../lib/home-preferences.mjs';

const DEMO_KEY='casainordine-home-v3-demo';
const blankExtras=()=>({shopping:[],assets:[],contracts:[],decisions:[],inventory:[]});
const shortDate=date=>date?new Date(date+'T12:00:00Z').toLocaleDateString('it-IT',{day:'numeric',month:'short',timeZone:'UTC'}):'Senza data';

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
 onNavigate,onNewBill,onNewTask,onPay,onToggleTask,onRefresh,onNotify=()=>{}
}){
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
    if(loadError && active)setError('Non riesco a leggere le preferenze personali: '+loadError.message);
    else if(data)next=normalizeHomePreferences(data);
   }
   if(active){setPrefs(next);setSavedPrefs(next);setPrefsLoading(false);}
  };
  load();
  return()=>{active=false;};
 },[client,demo,user?.id]);

 useEffect(()=>{let active=true;const run=async()=>{
  if(demo||!client){if(active){setExtras(blankExtras());setExtraLoading(false);}return;}
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
  if(first)setExtraError('Alcuni dati non sono disponibili: '+first.error.message);
 };run();return()=>{active=false};},[client,demo,homeId,refreshKey]);
 const openBills=useMemo(()=>bills.filter(b=>!b.paid_at).slice().sort((a,b)=>(a.due_date||'9999').localeCompare(b.due_date||'9999')),[bills]);
 const openTasks=useMemo(()=>tasks.filter(t=>!t.done_at).slice().sort((a,b)=>(a.due_date||'9999').localeCompare(b.due_date||'9999')),[tasks]);
 const uncheckedShopping=extras.shopping.filter(x=>!x.checked);
 const briefing=useMemo(()=>buildFiveMinuteBriefing({
  bills,tasks,assets:extras.assets,contracts:extras.contracts,
  decisions:extras.decisions,inventory:extras.inventory,today:todayRome()
 }),[bills,tasks,extras]);
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
    if(!client||!user?.id)throw new Error('Accedi per salvare le preferenze.');
    const {error:saveError}=await client.from('user_home_preferences').upsert({
     user_id:user.id,widget_order:next.widgets,layout:next.layout,updated_at:new Date().toISOString()
    },{onConflict:'user_id'});
    if(saveError)throw saveError;
   }
   setSavedPrefs(next);setPrefs(next);setEditing(false);setStatus('Home personale salvata.');
   onNotify('Le preferenze della tua Home sono state salvate.');
  }catch(e){setError('Salvataggio non riuscito: '+(e.message||'Riprova.'));}
  finally{setSaving(false);}
 };
 const refresh=()=>{setRefreshKey(x=>x+1);onRefresh?.();};
 const markShopping=async item=>{
  if(!client||!homeId||!canWrite||shoppingBusy)return;
  setShoppingBusy(true);
  try{
   const {error:updateError}=await client.from('home_shopping').update({checked:!item.checked}).eq('id',item.id).eq('home_id',homeId);
   if(updateError)throw updateError;
   setExtras(old=>({...old,shopping:old.shopping.map(x=>x.id===item.id?{...x,checked:!item.checked}:x)}));
   onNotify('Lista della spesa aggiornata.');
  }catch(e){setExtraError(e.message||'Non è stato possibile aggiornare la lista.');}
  finally{setShoppingBusy(false);}
 };
 const cards={
  bills:<HomeWidget key="bills" icon={ReceiptText} title="Bollette e scadenze"
    count={openBills.length+' aperte · '+euro(dueAmount)+' da pagare'}
    onAction={()=>onNavigate('bills')} actionLabel="Vedi tutte">
    {urgent>0&&<p className="home3-alert"><Bell size={15}/> {urgent} {urgent===1?'bolletta scaduta o in scadenza oggi':'bollette scadute o in scadenza oggi'}</p>}
    {openBills.length?<div className="home3-rows">{openBills.slice(0,limit).map(b=><div className="home3-item" key={b.id}>
      <div><b>{b.title}</b><small>{b.supplier||b.category} · {shortDate(b.due_date)}</small></div>
      <div className="home3-item-actions"><strong>{euro(Number(b.amount)||0)}</strong>
       <button type="button" className="home3-check" title="Segna pagata" aria-label={'Segna pagata: '+b.title} disabled={!canWrite} onClick={()=>onPay(b)}><Check size={17}/></button>
      </div></div>)}</div>:<p className="home3-empty">Nessuna bolletta aperta. Le prossime scadenze appariranno qui.</p>}
    <div className="home3-footer"><button type="button" className="home3-small-link" onClick={onNewBill} disabled={!canWrite}><Plus size={15}/> Nuova bolletta</button></div>
   </HomeWidget>,
  shopping:<HomeWidget key="shopping" icon={ShoppingBasket} title="Lista della spesa"
   count={homeId?uncheckedShopping.length+' prodotti da comprare':'Disponibile nelle case condivise'}
   actionLabel={homeId?'Apri lista':'Crea una casa'} onAction={()=>onNavigate(homeId?'shopping':'household')}>
   {!homeId?<p className="home3-empty">Seleziona o crea una casa condivisa per gestire la spesa con la famiglia.</p>:
    extraLoading?<p className="home3-empty">Caricamento lista…</p>:
    uncheckedShopping.length?<div className="home3-rows">{uncheckedShopping.slice(0,limit).map(item=><label className="home3-item home3-shop-item" key={item.id}>
     <input type="checkbox" checked={false} disabled={!canWrite||shoppingBusy} onChange={()=>markShopping(item)}/>
     <span><b>{item.title}</b><small>Quantità: {item.quantity||'1'}</small></span>
    </label>)}</div>:<p className="home3-empty">La spesa è in ordine. Nessun prodotto ancora da acquistare.</p>}
   </HomeWidget>,
  tasks:<HomeWidget key="tasks" icon={ListChecks} title="Attività da fare"
   count={openTasks.length+' attività aperte'} actionLabel="Vedi tutte" onAction={()=>onNavigate('tasks')}>
   {openTasks.length?<div className="home3-rows">{openTasks.slice(0,limit).map(t=><label key={t.id} className="home3-item home3-shop-item">
    <input type="checkbox" disabled={!canWrite} checked={false} onChange={()=>onToggleTask(t)}/>
    <span><b>{t.title}</b><small>{t.due_date?'Entro il '+shortDate(t.due_date):'Senza scadenza'}</small></span>
   </label>)}</div>:<p className="home3-empty">Non ci sono attività in sospeso.</p>}
   <div className="home3-footer"><button type="button" className="home3-small-link" disabled={!canWrite} onClick={onNewTask}><Plus size={15}/> Nuova attività</button></div>
   </HomeWidget>,
  five_minutes:<HomeWidget key="five_minutes" icon={ClipboardCheck} title="La casa in 5 minuti"
   count="Le azioni più importanti" actionLabel="Apri riepilogo" onAction={()=>onNavigate('briefing')}>
   {extraLoading?<p className="home3-empty">Preparazione del riepilogo…</p>:
    briefing.length?<ol className="home3-priorities">{briefing.slice(0,expanded?5:3).map(x=><li key={x.id}><button type="button" onClick={()=>onNavigate(x.section)}>{x.label}<ChevronRight size={14}/></button></li>)}</ol>:
    <p className="home3-empty">Nessuna azione urgente rilevata nei dati registrati.</p>}
   </HomeWidget>
 };
 return <div className="home3">
  <div className="page-heading home3-heading">
   <div><div className="eyebrow">LA MIA HOME · VERSIONE 3.0</div><h1>Buongiorno{displayName?', '+displayName:''} <span className="wave">✳</span></h1>
    <p>Le cose che contano per te, nell'ordine che preferisci.</p></div>
   <div className="home3-heading-actions">
    <button type="button" className="btn btn-soft" onClick={refresh}><RotateCcw size={16}/> Aggiorna</button>
    <button type="button" className="btn btn-primary" onClick={()=>setEditing(old=>!old)} aria-expanded={editing} aria-controls="home3-editor"><Settings2 size={17}/> Personalizza</button>
   </div>
  </div>
  {status&&<p role="status" className="home3-success"><CheckCircle2 size={16}/>{status}</p>}
  {error&&<p role="alert" className="home3-warning">{error}</p>}
  {editing&&<section className="panel home3-editor" id="home3-editor" aria-label="Modifica la tua Home">
   <h2>Scegli cosa vedere per primo</h2>
   <p>Spunta i moduli che vuoi mostrare. Usa le frecce per cambiare l'ordine. Le modifiche saranno solo tue, anche nelle case condivise.</p>
   <div className="home3-editor-list">
    {available.map(id=>{
     const item=HOME_WIDGETS.find(x=>x.id===id),index=selected.indexOf(id),enabled=index>=0;
     return <div className="home3-editor-row" key={id}>
      <label><input type="checkbox" checked={enabled} disabled={enabled&&selected.length===1} onChange={()=>{setPrefs(old=>toggleHomeWidget(old,id));setStatus('');}}/><span>{item.title}</span></label>
      <div className="home3-order">
       <button type="button" title={'Sposta in alto '+item.title} aria-label={'Sposta in alto '+item.title} disabled={!enabled||index===0} onClick={()=>setPrefs(old=>moveHomeWidget(old,id,-1))}><ArrowUp size={17}/></button>
       <button type="button" title={'Sposta in basso '+item.title} aria-label={'Sposta in basso '+item.title} disabled={!enabled||index===selected.length-1} onClick={()=>setPrefs(old=>moveHomeWidget(old,id,1))}><ArrowDown size={17}/></button>
      </div>
     </div>;
    })}
   </div>
   <fieldset className="home3-layout">
    <legend>Come vuoi visualizzarli?</legend>
    <label><input type="radio" name="home-layout" checked={!expanded} onChange={()=>setPrefs(old=>({...old,layout:'compact'}))}/> Compatto — solo le informazioni essenziali</label>
    <label><input type="radio" name="home-layout" checked={expanded} onChange={()=>setPrefs(old=>({...old,layout:'expanded'}))}/> Dettagliato — più informazioni e spazio</label>
   </fieldset>
   <div className="home3-editor-actions">
    <button type="button" className="btn btn-soft" onClick={reset}><RotateCcw size={15}/> Ripristina proposta iniziale</button>
    <button type="button" className="btn btn-soft" onClick={cancel}>Annulla</button>
    <button type="button" className="btn btn-primary" disabled={saving||prefsLoading||!dirty} onClick={save}><Save size={16}/>{saving?'Salvataggio…':'Salva la mia Home'}</button>
   </div>
   <small>Non vengono modificati i dati, i permessi o le preferenze degli altri utenti.</small>
  </section>}
  {extraError&&<p className="home3-warning" role="status">{extraError}</p>}
  {prefsLoading?<div className="panel home3-loading"><Clock size={18}/> Caricamento della tua Home…</div>:
   <div className={'home3-grid '+(expanded?'home3-expanded':'home3-compact')}>
    {selected.map(id=>cards[id])}
   </div>}
  <div className="home3-bottom">
   <span><Wallet size={16}/> La panoramica completa rimane sempre disponibile nel menu.</span>
   <button type="button" className="home3-small-link" onClick={()=>onNavigate('overview')}>Apri panoramica completa <ChevronRight size={15}/></button>
  </div>
 </div>;
}
