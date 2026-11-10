'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  LayoutDashboard, ReceiptText, PlugZap, House, UploadCloud, Settings, Bell,
  Plus, Search, CheckCircle2, CalendarDays, LogOut, ArrowUpRight, TrendingDown,
  Wallet, LockKeyhole, Trash2, Mail, ShieldCheck, RefreshCcw, Link2,
  Menu, X, UserRound, Download, Cloud, Info, Clock, AlertCircle, Check,
  Filter, ChevronRight, Zap, CircleHelp, Send, Eye, EyeOff, FileImage, FileText, Users, ShoppingBasket, Car, Archive, BarChart3, Wrench, Building2, ClipboardList, ScanSearch
} from 'lucide-react';
import { db } from '../lib/supabase-browser';
import { addDaysISO, nextRecurringDue, todayRome, normalizeDate, euro } from '../lib/dates.mjs';
import { parseBillsCsv } from '../lib/csv.mjs';
import { parseRatePlanText } from '../lib/rate-plan.mjs';
import { extractBillFields } from '../lib/document-import.mjs';
import MailImporter from './MailImporter';
import HouseholdHub from './HouseholdHub';
import PushSettings from './PushSettings';
import { ForgotPasswordButton, PasswordRecoveryDialog, DeleteAccountPanel } from './AccountSecurity';
import CalendarFeed from './CalendarFeed';
import HomeExtra from './HomeExtra';
import V20Hub from './V20Hub';
import V21Hub from './V21Hub';
import PersonalizedHome from './PersonalizedHome';
import {useLanguage,LanguageSelector} from './LanguageProvider';
import SampleAccountSetup from './SampleAccountSetup';
import { downloadCalendar } from '../lib/calendar.mjs';
import { billFraudSignals } from '../lib/v20-core.mjs';

const categories = ['Luce','Gas','Acqua','Internet','Telefono','Rifiuti','Condominio','Affitto / Mutuo','Assicurazione','Tasse','Auto','Altro'];
const frequencies = [{value:'none',label:'Non ricorrente'},{value:'monthly',label:'Ogni mese'},{value:'bimonthly',label:'Ogni 2 mesi'},{value:'quarterly',label:'Ogni 3 mesi'},{value:'yearly',label:'Ogni anno'},{value:'biennial',label:'Ogni 2 anni'}];
const menu = [
  {id:'dashboard',title:'La mia Home',icon:LayoutDashboard},
  {id:'overview',title:'Panoramica completa',icon:BarChart3},
  {id:'bills',title:'Bollette',icon:ReceiptText},
  {id:'utilities',title:'Le mie utenze',icon:PlugZap},
  {id:'tasks',title:'Attività casa',icon:House},
  {id:'household',title:'Famiglia e inviti',icon:Users},
  {id:'budget',title:'Budget e spese',icon:Wallet},
  {id:'shopping',title:'Lista della spesa',icon:ShoppingBasket},
  {id:'vehicles',title:'Auto e scadenze',icon:Car},
  {id:'insights',title:'Consumi e previsioni',icon:BarChart3},
  {id:'archive',title:'Archivio documenti',icon:Archive},
  {id:'properties',title:'Immobili',icon:Building2},
  {id:'maintenance',title:'Manutenzioni',icon:Wrench},
  {id:'contracts',title:'Contratti',icon:ClipboardList},
  {id:'payments',title:'Ricevute',icon:CheckCircle2},
  {id:'alerts',title:'Notifiche e backup',icon:Bell},
  {id:'monitor',title:'Monitoraggio email',icon:Mail},
  {id:'fraud',title:'Controllo antifrode',icon:ShieldCheck},
  {id:'pagopa',title:'Avvisi pagoPA',icon:ReceiptText},
  {id:'history',title:'Cronologia e recupero',icon:Clock},
  {id:'moving',title:'Assistente trasloco',icon:House},
  {id:'savings',title:'Obiettivi risparmio',icon:Wallet},
  {id:'offline',title:'Bozze offline',icon:Cloud},
  {id:'briefing',title:'La casa in 5 minuti',icon:ClipboardList},
  {id:'tags',title:'QR degli oggetti',icon:ScanSearch},
  {id:'sos',title:'SOS Casa',icon:ShieldCheck},
  {id:'radar',title:'Radar incongruenze',icon:Search},
  {id:'simulator',title:'Simulatore spese',icon:BarChart3},
  {id:'passport',title:'Passaporto immobile',icon:FileText},
  {id:'vacation',title:'Modalità vacanza',icon:House},
  {id:'inventory',title:'Inventario assicurativo',icon:Archive},
  {id:'decisions',title:'Decisioni di famiglia',icon:Users},
  {id:'connect',title:'Importa e collega',icon:Link2},
  {id:'settings',title:'Impostazioni',icon:Settings},
];
const billDefault = {title:'',supplier:'',category:'Luce',amount:'',due_date:addDaysISO(todayRome(),7),paid:false};
const utilityDefault = {supplier:'',category:'Luce',account_reference:'',estimated_amount:'',frequency:'monthly',next_due_date:addDaysISO(todayRome(),14)};
const taskDefault = {title:'',due_date:addDaysISO(todayRome(),7),assigned_to:''};
const uuid = () => crypto.randomUUID();

function fakeData() {
  const today = todayRome();
  const bills = [
    {id:'demo-1',title:'Bolletta elettricità',supplier:'Energia di esempio',category:'Luce',amount:84.50,due_date:addDaysISO(today,3),paid_at:null,source:'manual',is_estimate:false},
    {id:'demo-2',title:'Fibra casa',supplier:'Internet di esempio',category:'Internet',amount:29.90,due_date:addDaysISO(today,8),paid_at:null,source:'recurring',is_estimate:true},
    {id:'demo-3',title:'Acqua e fognatura',supplier:'Acquedotto di esempio',category:'Acqua',amount:46.20,due_date:addDaysISO(today,16),paid_at:null,source:'csv',is_estimate:false},
    {id:'demo-4',title:'Gas',supplier:'Gas di esempio',category:'Gas',amount:97.80,due_date:addDaysISO(today,-5),paid_at:new Date().toISOString(),source:'manual',is_estimate:false},
  ];
  return {bills,utilities:[{id:'demo-u1',supplier:'Internet di esempio',category:'Internet',estimated_amount:29.9,frequency:'monthly',next_due_date:addDaysISO(today,38),billing_day:12,active:true,account_reference:'Codice cliente ••••42'}],
    tasks:[{id:'demo-t1',title:'Controllare il filtro del condizionatore',due_date:addDaysISO(today,5),done_at:null}],
    suppliers:[],summaries:[],profile:{full_name:'',reminders_enabled:true,auto_confirm_payments:false,summary_frequency:'off',summary_weekday:1,summary_month_day:1,email:''},reminders:[{id:'demo-rem1',reminder_date:today,email_sent_at:null,bills:{id:'demo-1',title:'Bolletta elettricità',due_date:addDaysISO(today,3),amount:84.50,paid_at:null}}]};
}

function Tag({children,tone='neutral'}) { return <span className={`tag tag-${tone}`}>{children}</span>; }
function Status({bill}) {
  const {t}=useLanguage();
  if (bill.paid_at) return <Tag tone="green"><Check size={12}/> {t('bill.paid')}</Tag>;
  const today = todayRome();
  if (bill.due_date < today) return <Tag tone="red">{t('bill.overdue')}</Tag>;
  if (bill.due_date <= addDaysISO(today,7)) return <Tag tone="amber">{t('bill.dueSoon')}</Tag>;
  return <Tag>{t('bill.toPay')}</Tag>;
}
function DateText({iso}) { const {date}=useLanguage(); return <>{date(iso,{day:'numeric',month:'short',year:'numeric'})}</>; }
function CategoryIcon({value}) {
  return <span className={`category-icon category-${['Luce','Gas','Acqua','Internet'].includes(value)?value.toLowerCase():'other'}`}>
    {value==='Luce'?<Zap size={19}/>:value==='Internet'?<Cloud size={18}/>:value==='Acqua'?<span>◒</span>:value==='Gas'?<span>♨</span>:<House size={18}/>}
  </span>;
}
function Toast({message,onClose}) { const {t}=useLanguage(); return message && <div className="toast" role="status">{message}<button onClick={onClose} aria-label={t('ui.close')}><X size={16}/></button></div>; }
function Empty({icon:Icon,title,body,action,button}) {return <div className="empty-state"><div className="empty-icon"><Icon size={24}/></div><h3>{title}</h3><p>{body}</p>{action&&<button className="btn btn-primary" onClick={action}><Plus size={16}/>{button}</button>}</div>;}

function Auth({client}) {
  const {t}=useLanguage();
  const [signup,setSignup] = useState(false);
  const [email,setEmail] = useState(''); const [password,setPassword] = useState('');
  const [error,setError] = useState(''); const [pending,setPending] = useState(false); const [info,setInfo] = useState('');
  async function submit(e) {
    e.preventDefault(); setError(''); setPending(true);
    const {data,error:err} = signup ? await client.auth.signUp({email,password}) : await client.auth.signInWithPassword({email,password});
    setPending(false);
    if (err) setError(err.message);
    else if (signup && !data.session) setError(t('auth.confirm'));
  }
  async function google() {
    const invite=new URLSearchParams(window.location.search).get('invite');
    if(invite && /^[a-f0-9]{64}$/.test(invite))sessionStorage.setItem('pending_house_invite',invite);
    const {error:err} = await client.auth.signInWithOAuth({provider:'google',options:{redirectTo:window.location.origin}});
    if (err) setError(err.message);
  }
  return <div className="auth-wrap"><div className="auth-decoration"><span className="auth-logo"><House size={23}/></span><p>{t('auth.brandLine')}</p><h1>{t('auth.tagline')}</h1><p className="auth-intro">{t('auth.intro')}</p><div className="auth-quote"><Bell size={21}/> {t('auth.reminder')}</div></div>
    <div className="auth-card"><LanguageSelector id="auth-language" className="auth-language" label={true}/><div className="brand auth-mobile"><span className="brand-icon"><House size={22}/></span><b>Casa<span>inOrdine</span></b></div><div className="eyebrow">{t('v32.notifications.authEyebrow')}</div><h2>{t(signup?'auth.signupTitle':'auth.title')}</h2><p className="muted">{t(signup?'auth.signupHelp':'auth.loginHelp')}</p>
      <form onSubmit={submit}><label>{t('auth.email')}<input type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="tu@esempio.it"/></label><label>{t('auth.password')}<input type="password" minLength={6} required value={password} onChange={e=>setPassword(e.target.value)} placeholder={t('auth.passwordHint')}/></label>{!signup&&<ForgotPasswordButton client={client} email={email} t={t} onMessage={message=>{setError('');setInfo(message);}}/>}<button className="btn btn-primary full" disabled={pending}>{t(pending?'auth.signingIn':signup?'auth.signUp':'auth.signIn')}<ChevronRight size={17}/></button></form>
      <div className="auth-separator">{t('auth.or')}</div><a className="btn btn-soft full" href="/prova" style={{textDecoration:'none',justifyContent:'center'}}><House size={18}/> {t('auth.demo')}</a><button className="btn btn-soft full" onClick={google}><span className="google-dot">G</span> {t('auth.google')}</button>
      {error&&<p className="auth-error">{error}</p>}{info&&!error&&<p className="auth-info" role="status">{info}</p>}<p className="auth-switch">{t(signup?'auth.hasAccount':'auth.noAccount')} <button onClick={()=>{setSignup(!signup);setError('');}}>{t(signup?'auth.signIn':'auth.signUp')}</button></p><p className="privacy-line"><LockKeyhole size={13}/> {t('auth.privacy')}</p>
    </div></div>;
}

// Esiti del ritorno da Google/Microsoft (app/api/mail/callback/route.js).
const MAIL_STATUS={connected:'Casella email collegata! Ora puoi cercare le bollette.',denied:'Autorizzazione annullata: la casella non è stata collegata.',expired:'Il collegamento è scaduto: riprova.',other_browser:'Per sicurezza il collegamento va completato nello stesso browser in cui l’hai avviato. Riprova dall’app; se usi l’app dalla schermata Home di iPhone e il problema continua, avvia il collegamento da Safari.',no_refresh:'Il provider non ha concesso l’accesso continuativo: rimuovi Casa in Ordine dalle app autorizzate del tuo account email e riprova.'};
function mailStatusMessage(status){return MAIL_STATUS[status]||'Collegamento della casella non riuscito: riprova più tardi.';}

export default function Page() {
  const {t:tr,money,locale}=useLanguage();
  const weekdayLabel=day=>new Intl.DateTimeFormat(locale,{weekday:'long',timeZone:'UTC'}).format(new Date(Date.UTC(2023,0,1+day)));
  const client = useMemo(()=>db(),[]), demo = !client;
  const [user,setUser] = useState(null), [initializing,setInitializing] = useState(!demo);
  const [data,setData] = useState({bills:[],utilities:[],tasks:[],suppliers:[],summaries:[],profile:null,reminders:[]});
  const [tab,setTab] = useState('dashboard'), [mobile,setMobile] = useState(false);
  useEffect(()=>{if(new URLSearchParams(window.location.search).has('asset'))setTab('tags')},[]);
  const [homes,setHomes] = useState([]),[activeHomeId,setActiveHomeId]=useState(null),[homeMembers,setHomeMembers]=useState([]);
  const homeMembership=homes.find(h=>h.home_id===activeHomeId);
  const canWrite=!activeHomeId||['owner','editor'].includes(homeMembership?.role);
  const [modal,setModal] = useState(null), [form,setForm] = useState({});
  const [toast,setToast] = useState(''),[busy,setBusy] = useState(false);
  const [search,setSearch] = useState(''), [billFilter,setBillFilter] = useState('all'), [bellOpen,setBellOpen] = useState(false);
  const [integration,setIntegration] = useState(null), [newToken,setNewToken] = useState('');
  const [documentState,setDocumentState] = useState({busy:false,message:''});
  const [mailRefresh,setMailRefresh]=useState(0);
  const [supplierForm,setSupplierForm]=useState({name:'',category:'Luce',sender_email:''});
  const [recovery,setRecovery]=useState(false);
  const [ratePlan,setRatePlan]=useState(null), [ratePaste,setRatePaste]=useState(''), [rateUnit,setRateUnit]=useState(''), [rateSupplier,setRateSupplier]=useState('Condominio'), [billPaste,setBillPaste]=useState('');

  const notify = txt=>{setToast(txt);};
  const reloadHomes=useCallback(async()=>{
    if(!client)return;
    const {data:membership,error}=await client.from('home_members').select('home_id,role,homes(id,name,owner_id)').order('joined_at');
    if(error){if(error.code!=='42P01')notify(tr('v32.flow.homesError',{error:error.message}));return;}
    const allowed=membership||[];
    setHomes(allowed);
    setActiveHomeId(old=>old && !allowed.some(h=>h.home_id===old)?null:old);
  },[client]);
  const reload = useCallback(async()=>{
    if (!client) return;
    const scope=q=>activeHomeId?q.eq('home_id',activeHomeId):q.is('home_id',null);
    const [b,u,t,p,r,sp,sm] = await Promise.all([
      scope(client.from('bills').select('*')).order('due_date',{ascending:true}),
      scope(client.from('utilities').select('*')).order('next_due_date',{ascending:true}),
      scope(client.from('house_tasks').select('*')).order('due_date',{ascending:true}),
      client.from('profiles').select('*').single(),
      client.from('reminders').select('*,bills(id,title,supplier,due_date,amount,paid_at,home_id)').order('created_at',{ascending:false}).limit(30),
      client.from('user_suppliers').select('*').order('created_at',{ascending:true}),
      client.from('bill_summaries').select('*').order('summary_date',{ascending:false}).limit(12)
    ]);
    const err = [b,u,t,p,r,sp,sm].find(x=>x.error);
    if (err) notify(tr('v32.flow.loadError',{error:err.error.message}));
    setData({bills:b.data||[],utilities:u.data||[],tasks:t.data||[],suppliers:sp.data||[],summaries:sm.data||[],profile:p.data||null,
      reminders:(r.data||[]).filter(item=>item.bills&&!item.bills.paid_at&&item.bills.home_id===activeHomeId)});
  },[client,activeHomeId]);
  useEffect(()=>{
    if(!client||!activeHomeId){setHomeMembers([]);return;}
    client.from('home_members').select('user_id,email,role').eq('home_id',activeHomeId).then(({data,error})=>{
      if(error)notify(error.message);else setHomeMembers(data||[]);
    });
  },[client,activeHomeId,homes]);

  useEffect(()=>{
    if (demo) {
      try { const saved=localStorage.getItem('casainordine-demo-v1');setData(saved?JSON.parse(saved):fakeData()); }
      catch {setData(fakeData());}
      return;
    }
    client.auth.getSession().then(({data:{session}})=>{setUser(session?.user||null);setInitializing(false);if(session){reload();reloadHomes();}});
    const {data:{subscription}} = client.auth.onAuthStateChange((event,session)=>{
      // Dopo un'uscita (anche per sessione scaduta) si ricarica la pagina: nello stato React
      // restano altrimenti chiave d'integrazione, testi incollati e moduli dell'account precedente.
      if(event==='SIGNED_OUT'){window.location.replace('/');return;}
      // Ritorno dal link 'Password dimenticata?': si chiede subito la nuova password.
      if(event==='PASSWORD_RECOVERY')setRecovery(true);
      setUser(session?.user||null); if(session) {setTimeout(()=>{reload();reloadHomes();},0);} else {setHomes([]);setActiveHomeId(null);setData({bills:[],utilities:[],tasks:[],suppliers:[],summaries:[],profile:null,reminders:[]});}
    });
    return ()=>subscription.unsubscribe();
  },[demo,client,reload,reloadHomes]);

  // Finestre: il focus entra nella finestra all'apertura e torna dov'era alla chiusura; Esc chiude.
  // Una bolletta letta da un documento non si chiude con Esc o col tocco sullo sfondo: si perderebbe
  // quanto estratto; resta il pulsante di chiusura.
  const dialogRef=useRef(null), dialogState=useRef({});
  dialogState.current={ratePlan:Boolean(ratePlan),documentBill:form.source==='document'};
  const dialogOpen=Boolean(modal||ratePlan);
  // L'ultimo elemento con il focus fuori dalle finestre: i campi con autoFocus prendono il focus
  // prima degli effetti, quindi activeElement all'apertura è già dentro la finestra.
  const lastFocus=useRef(null);
  useEffect(()=>{
    const onFocus=e=>{if(!e.target?.closest?.('.modal'))lastFocus.current=e.target;};
    document.addEventListener('focusin',onFocus);
    return ()=>document.removeEventListener('focusin',onFocus);
  },[]);
  useEffect(()=>{
    if(!dialogOpen)return;
    const previous=lastFocus.current;
    if(dialogRef.current&&!dialogRef.current.contains(document.activeElement))dialogRef.current.focus();
    const onKey=e=>{if(e.key!=='Escape')return;if(dialogState.current.ratePlan)setRatePlan(null);else if(!dialogState.current.documentBill)setModal(null);};
    document.addEventListener('keydown',onKey);
    return ()=>{document.removeEventListener('keydown',onKey);if(previous?.isConnected&&typeof previous.focus==='function')previous.focus();};
  },[dialogOpen]);
  async function signOut(){
    // Questo dispositivo smette di ricevere le notifiche dell'account che esce.
    try{
      const registration='serviceWorker' in navigator?await Promise.race([navigator.serviceWorker.ready,new Promise(done=>setTimeout(()=>done(null),1500))]):null;
      const subscription=await registration?.pushManager?.getSubscription();
      if(subscription){
        const {data:{session}}=await client.auth.getSession();
        await fetch('/api/push/subscribe',{method:'DELETE',headers:{Authorization:`Bearer ${session?.access_token||''}`,'Content-Type':'application/json'},body:JSON.stringify({endpoint:subscription.endpoint})}).catch(()=>{});
        await subscription.unsubscribe().catch(()=>{});
      }
    }catch{}
    // Solo questo dispositivo (prima l'uscita chiudeva la sessione su tutti). Senza rete
    // signOut restituisce un errore e lascia la sessione salvata: la si cancella comunque.
    const {error}=await client.auth.signOut({scope:'local'}).catch(e=>({error:e}));
    if(error){try{Object.keys(localStorage).filter(k=>/^sb-.+-auth-token/.test(k)).forEach(k=>localStorage.removeItem(k));}catch{}}
    window.location.replace('/');
  }
  function writeDemo(next) {setData(next);localStorage.setItem('casainordine-demo-v1',JSON.stringify(next));}
  function localUpdate(key,fn) {writeDemo({...data,[key]:fn(data[key])});}
  async function updateRow(table,id,patch,key=table) {
    if(!canWrite){notify(tr('v32.feedback.1'));return false;}
    if (demo) {localUpdate(key,rows=>rows.map(x=>x.id===id?{...x,...patch}:x));return true;}
    const {error} = await client.from(table).update(patch).eq('id',id);
    if(error) {notify(error.message);return false;} await reload();return true;
  }
  async function deleteRow(table,id,key=table) {
    if(!canWrite){notify(tr('v32.feedback.1'));return;}
    if (!window.confirm(tr('v32.flow.deleteConfirm'))) return;
    if(demo){localUpdate(key,rows=>rows.filter(x=>x.id!==id));notify(tr('v32.feedback.2'));return;}
    const {error}=await client.from(table).delete().eq('id',id);
    if(error)notify(error.message);else{await reload();notify(tr('v32.feedback.2'));}
  }
  async function saveBill(e) {
    e.preventDefault();if(!canWrite)return notify(tr('v32.feedback.3'));
    if(form.source==='document'&&['ricevuta','sollecito','nota_credito'].includes(form.import_document_type)){
      const label=form.import_document_type==='ricevuta'?tr('v32.flow.receiptLabel'):form.import_document_type==='nota_credito'?tr('v32.flow.creditNoteLabel'):tr('v32.flow.reminderLabel');
      if(!window.confirm(tr('v32.flow.documentConfirm',{kind:label})))return;
    }
    setBusy(true);
    const amount=Number(form.amount);
    if(!Number.isFinite(amount)||amount<0||!normalizeDate(form.due_date)){notify(tr('v32.feedback.4'));setBusy(false);return;}
    const item={title:form.title.trim(),supplier:form.supplier.trim(),category:form.category,amount,due_date:form.due_date,paid_at:form.paid?new Date().toISOString():null,is_estimate:false,source:form.source==='document'?'document':'manual',...(form.source==='document'&&form.external_id?{external_id:form.external_id}:{})};
    if(item.source==='document' && data.bills.some(b=>b.source==='document'&&b.external_id===item.external_id)){notify(tr('v32.feedback.5'));setBusy(false);return;}
    let savedBillId=null;
    if(demo)localUpdate('bills',x=>[...x,{...item,id:uuid()}]);
    else {const {data:created,error}=await client.from('bills').insert({...item,user_id:user.id,home_id:activeHomeId}).select('id').single(); if(error){notify(error.code==='23505'?tr('v32.payment.duplicate'):error.message);setBusy(false);return;}savedBillId=created.id;await reload();}
    let postSaveWarning='';
    // A detected Italian IBAN is hashed locally and never saved in full.
    // The security check only queues a review; it does not authorize the payee or confirm payment.
    if(savedBillId && form.ibanCandidate && !demo){
      try{
        const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(form.ibanCandidate));
        const ibanHash=Array.from(new Uint8Array(digest)).map(x=>x.toString(16).padStart(2,'0')).join('');
        const {data:past,error:pastErr}=await client.from('bill_security_reviews').select('bill_id,iban_fingerprint,review_status').eq('review_status','reviewed');
        if(pastErr)throw pastErr;
        const trusted=(past||[]).filter(x=>data.bills.some(b=>b.id===x.bill_id&&b.supplier===item.supplier)).map(x=>x.iban_fingerprint).filter(Boolean);
        const flags=billFraudSignals({...item,id:savedBillId},data.bills,{sender:form.mailSender||'',senderAuth:form.mailSenderAuth||'unknown',ibanFingerprint:ibanHash,historicalIbanFingerprints:trusted}).flags;
        const {error:riskError}=await client.from('bill_security_reviews').insert({user_id:user.id,home_id:activeHomeId,bill_id:savedBillId,iban_fingerprint:ibanHash,iban_suffix:form.ibanCandidate.slice(-4),sender:form.mailSender||'',sender_auth:form.mailSenderAuth||'unknown',risk_flags:flags,review_status:'pending'});
        if(riskError)throw riskError;
        if(flags.length)postSaveWarning=tr('v32.payment.fraudReview');
      }catch(err){postSaveWarning=tr('v32.payment.ibanFailure',{error:err.message});}
    }
    if(form.mail_doc_id && !demo){
      try {const {data:{session}}=await client.auth.getSession();const response=await fetch('/api/mail/documents',{method:'PATCH',headers:{Authorization:`Bearer ${session?.access_token||''}`,'Content-Type':'application/json'},body:JSON.stringify({id:form.mail_doc_id,action:'imported',bill_id:savedBillId})});const outcome=await response.json().catch(()=>({}));if(!response.ok)throw new Error(outcome.error||'Impossibile archiviare il documento importato');if(outcome.warning)postSaveWarning=[postSaveWarning,outcome.warning].filter(Boolean).join(' · ');setMailRefresh(x=>x+1);}catch(error){postSaveWarning=`Bolletta salvata; il documento email è ancora in attesa: ${error.message}`;}
    }
    setModal(null);setBusy(false);notify(postSaveWarning||tr('v32.payment.saved'));
  }
  async function saveUtility(e) {
    e.preventDefault();if(!canWrite)return notify(tr('v32.feedback.3'));setBusy(true);
    const estimated_amount=Number(form.estimated_amount);
    if(!Number.isFinite(estimated_amount)||estimated_amount<0||!normalizeDate(form.next_due_date)){notify(tr('v32.feedback.6'));setBusy(false);return;}
    const billing_day=Number(form.next_due_date.split('-')[2]);
    const item={supplier:form.supplier.trim(),category:form.category,account_reference:form.account_reference.trim(),estimated_amount,frequency:form.frequency,next_due_date:form.next_due_date,billing_day,active:true};
    const initialBill={title:`${item.category} · ${item.supplier}`,supplier:item.supplier,category:item.category,amount:estimated_amount,due_date:item.next_due_date,is_estimate:true,paid_at:null,source:'recurring'};
    const following=nextRecurringDue(item.next_due_date,item.frequency,billing_day);
    if(demo){const id=uuid(); writeDemo({...data,utilities:[...data.utilities,{...item,id,next_due_date:following||item.next_due_date}],bills:[...data.bills,{...initialBill,id:uuid(),utility_id:id}]});}
    else {
      const {data:created,error}=await client.from('utilities').insert({...item,user_id:user.id,home_id:activeHomeId}).select('id').single();
      if(error){notify(error.message);setBusy(false);return;}
      const {error:billError}=await client.from('bills').insert({...initialBill,utility_id:created.id,user_id:user.id,home_id:activeHomeId});
      if(billError){notify(tr('v32.flow.utilityPartial',{error:billError.message}));}
      else if(following){await client.from('utilities').update({next_due_date:following}).eq('id',created.id);}
      await reload();
    }
    setModal(null);setBusy(false);notify(tr('v32.feedback.7'));
  }
  async function saveTask(e) {
    e.preventDefault();if(!canWrite)return notify(tr('v32.feedback.3'));setBusy(true);
    const item={title:form.title.trim(),due_date:form.due_date||null,done_at:null,...(activeHomeId?{assigned_to:form.assigned_to||null}:{})};
    if(demo)localUpdate('tasks',x=>[...x,{...item,id:uuid()}]);
    else {const {error}=await client.from('house_tasks').insert({...item,user_id:user.id,home_id:activeHomeId});if(error){notify(error.message);setBusy(false);return;}await reload();}
    setModal(null);setBusy(false);notify(tr('v32.feedback.8'));
  }
  async function addSupplier(e){
    e.preventDefault();
    const name=supplierForm.name.trim(), address=supplierForm.sender_email.trim().toLowerCase();
    if(name.length<3||name.length>120){notify(tr('v32.feedback.9'));return;}
    if(address&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)){notify(tr('v32.feedback.10'));return;}
    if((data.suppliers||[]).some(s=>s.name.toLowerCase()===name.toLowerCase()&&s.category===supplierForm.category)){notify(tr('v32.feedback.11'));return;}
    const item={name,category:supplierForm.category,sender_email:address||null};
    if(demo)localUpdate('suppliers',rows=>[...(rows||[]),{id:uuid(),...item}]);
    else {const {error}=await client.from('user_suppliers').insert({...item,user_id:user.id});if(error){notify(error.message);return;}await reload();}
    setSupplierForm({...supplierForm,name:'',sender_email:''});notify(tr('v32.feedback.12'));
  }
  function prepareRatePlan(text,source,partial=false){
    const result=parseRatePlanText(text,{unitFilter:rateUnit});
    if(!result.rows.length){notify(tr('v32.flow.noRates'));return;}
    setRatePlan({rows:result.rows,warnings:[...result.warnings,...(partial?['PDF lungo: oltre le prime 8 pagine non sono state lette.']:[])],source});
    notify(tr('v32.import.rateProposed',{count:result.rows.length}));
  }
  async function importBillFromText(){
    if(billPaste.trim().length<25){notify(tr('v32.feedback.13'));return;}
    if(billPaste.length>60000){notify(tr('v32.feedback.14'));return;}
    const details=extractBillFields(billPaste);
    const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(billPaste));
    const fingerprint=Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,'0')).join('');
    if(data.bills.some(b=>b.source==='document'&&b.external_id===fingerprint)){notify(tr('v32.feedback.15'));return;}
    setForm({...billDefault,title:details.title,supplier:details.supplier,category:details.category,amount:details.amount??'',due_date:details.due_date||'',paid:false,source:'document',external_id:fingerprint,import_file:'Testo incollato',import_document_type:details.documentType,import_warnings:details.warnings,ibanCandidate:details.ibanCandidate});
    setModal('bill');notify(tr('v32.feedback.16'));
  }
  async function rateFileImport(event){
    const file=event.target.files?.[0];event.target.value='';if(!file)return;
    setDocumentState({busy:true,message:'Lettura del piano rate…'});
    try{const {readRatePlanDocument}=await import('../lib/document-reader.js');const result=await readRatePlanDocument(file,message=>setDocumentState({busy:true,message}));prepareRatePlan(result.text,file.name,result.partial);}
    catch(e){notify(tr('v32.import.rateReadError',{detail:e.message}));}
    finally{setDocumentState({busy:false,message:''});}
  }
  async function saveRatePlan(){
    if(!canWrite)return notify(tr('v32.feedback.3'));
    const selected=ratePlan?.rows.filter(r=>r.selected)||[];
    if(!selected.length){notify(tr('v32.feedback.17'));return;}
    if(selected.length>120){notify(tr('v32.feedback.18'));return;}
    const supplier=rateSupplier.trim()||'Condominio';
    if(selected.some(r=>!r.title.trim()||!normalizeDate(r.due_date)||!Number.isFinite(Number(r.amount))||Number(r.amount)<=0)){notify(tr('v32.feedback.19'));return;}
    const unique=new Set(selected.map(r=>`${r.due_date}:${Number(r.amount)}`));
    if(unique.size!==selected.length){notify(tr('v32.feedback.20'));return;}
    // Same imported rate is identified by source + date + amount; repeat uploads are idempotent.
    const items=selected.map(r=>({title:r.title.trim(),supplier,category:'Condominio',amount:Number(r.amount),due_date:r.due_date,paid_at:null,source:'document',is_estimate:false,
      external_id:`rate:${supplier.toLowerCase().slice(0,60)}:${r.due_date}:${Number(r.amount).toFixed(2)}`}));
    setBusy(true);
    try{
      const existing=new Set((data.bills||[]).filter(b=>b.source==='document'&&b.external_id?.startsWith('rate:')).map(b=>b.external_id));
      const todo=items.filter(b=>!existing.has(b.external_id));
      if(!todo.length){notify(tr('v32.feedback.21'));return;}
      if(demo)localUpdate('bills',rows=>[...rows,...todo.map(row=>({...row,id:uuid()}))]);
      else {const {error}=await client.from('bills').upsert(todo.map(item=>({...item,user_id:user.id,home_id:activeHomeId})),{onConflict:'user_id,source,external_id',ignoreDuplicates:true});if(error)throw error;await reload();}
      setRatePlan(null);notify(tr('v32.import.rateSaved',{count:todo.length}));
    }catch(e){notify(tr('v32.import.rateSaveError',{detail:e.message}));}
    finally{setBusy(false);}
  }
  async function updateSummaryPrefs(patch){
    if(demo){writeDemo({...data,profile:{...data.profile,...patch}});return;}
    const {error}=await client.from('profiles').update(patch).eq('id',user.id);
    if(error)notify(error.message);else await reload();
  }
  async function pay(bill) {const ok=await updateRow('bills',bill.id,{paid_at:bill.paid_at?null:new Date().toISOString()});if(ok)notify(bill.paid_at?tr('v32.payment.reopened'):tr('v32.payment.paid'));}
  async function toggleTask(t) {await updateRow('house_tasks',t.id,{done_at:t.done_at?null:new Date().toISOString()},'tasks');}
  async function csvImport(event) {
    if(!canWrite)return notify(tr('v32.feedback.3'));
    const file=event.target.files?.[0];if(!file)return;
    try {
      const text=await file.text(),{bills,errors}=parseBillsCsv(text);
      if(!bills.length) throw new Error(errors.slice(0,3).join(' · ') || 'Nessuna riga valida');
      if(!window.confirm(tr('v32.import.csvConfirm',{count:bills.length,excluded:errors.length?tr('v32.import.csvExcluded',{count:errors.length}):''})))return;
      if(demo)localUpdate('bills',x=>[...x,...bills.map(b=>({...b,id:uuid()}))]);
      else {const {error}=await client.from('bills').insert(bills.map(b=>({...b,user_id:user.id,home_id:activeHomeId})));if(error)throw error;await reload();}
      notify(tr('v32.import.csvSaved',{count:bills.length,ignored:errors.length?tr('v32.import.csvIgnored',{count:errors.length}):''}));
    } catch(e){notify(tr('v32.import.csvError',{detail:e.message}));}
    finally{event.target.value='';}
  }
  async function documentImport(event) {
    if(!canWrite)return notify(tr('v32.feedback.3'));
    const file=event.target.files?.[0];
    event.target.value='';
    if(!file||documentState.busy)return;
    if(file.size>15*1024*1024){notify(tr('v32.feedback.22'));return;}
    setDocumentState({busy:true,message:'Preparazione del documento…'});
    try{
      const {readBillDocument,documentFingerprint}=await import('../lib/document-reader.js');
      const fingerprint=await documentFingerprint(file);
      const already=data.bills.some(b=>b.source==='document'&&b.external_id===fingerprint);
      if(already){notify(tr('v32.feedback.23'));return;}
      if(!demo){
        const {data:existing,error}=await client.from('bills').select('id').eq('source','document').eq('external_id',fingerprint).maybeSingle();
        if(error)throw new Error(error.message);
        if(existing){notify(tr('v32.feedback.23'));return;}
      }
      const extracted=await readBillDocument(file,message=>setDocumentState({busy:true,message}));
      setForm({...billDefault,title:extracted.title,supplier:extracted.supplier,category:extracted.category,
        amount:extracted.amount??'',due_date:extracted.due_date||'',paid:false,
        source:'document',external_id:fingerprint,import_file:file.name,import_document_type:extracted.documentType,import_warnings:extracted.warnings,ibanCandidate:extracted.ibanCandidate});
      setModal('bill');
      notify(tr('v32.feedback.24'));
    }catch(error){notify(tr('v32.import.documentReadError',{detail:error.message}));}
    finally{setDocumentState({busy:false,message:''});}
  }
  async function reviewEmailDocument(document, file){
    setDocumentState({busy:true,message:'Lettura della bolletta ricevuta via email…'});
    try{
      const {readBillDocument,documentFingerprint}=await import('../lib/document-reader.js');
      const fingerprint=await documentFingerprint(file);
      if(data.bills.some(b=>b.source==='document'&&b.external_id===fingerprint)){
        notify(tr('v32.feedback.25'));return;
      }
      const {data:existing,error}=await client.from('bills').select('id').eq('source','document').eq('external_id',fingerprint).maybeSingle();
      if(error)throw error;
      if(existing){notify(tr('v32.feedback.26'));return;}
      const extracted=await readBillDocument(file,message=>setDocumentState({busy:true,message}));
      const suggested=document.suggestion||{};
      setForm({...billDefault,title:extracted.title||suggested.title||'',supplier:extracted.supplier||suggested.supplier||suggested.learned_supplier_hint||'',
        category:extracted.category!=='Altro'?extracted.category:(suggested.category||'Altro'),
        amount:extracted.amount??suggested.amount??'',due_date:extracted.due_date||suggested.due_date||'',
        paid:false,source:'document',external_id:fingerprint,mail_doc_id:document.id,import_file:file.name,
        import_document_type:extracted.documentType,ibanCandidate:extracted.ibanCandidate,mailSender:document.sender||'',mailSenderAuth:suggested.sender_auth==='reported_fail'?'fail':'unknown',import_warnings:[...(extracted.warnings||[]),...(suggested.learned_supplier_hint?[`Mittente associato in passato a ${suggested.learned_supplier_hint} (${suggested.sender_match==='exact'?'indirizzo esatto':'dominio'}). Controlla che sia lo stesso fornitore.`]:[]),...(suggested.sender_auth==='reported_fail'?['Attenzione: autenticazione del mittente non superata secondo gli header disponibili.']:[])]});
      setModal('bill');notify(tr('v32.feedback.27'));
    }catch(e){notify(tr('v32.import.emailReadError',{detail:e.message}));}
    finally{setDocumentState({busy:false,message:''});}
  }
  async function authApi(method='GET') {
    const {data:{session}}=await client.auth.getSession();
    const response=await fetch('/api/integration-key',{method,headers:{Authorization:`Bearer ${session?.access_token||''}`}});
    const payload=await response.json();if(!response.ok)throw new Error(payload.error||'Errore');return payload;
  }
  async function loadIntegration() {if(demo)return;try{setIntegration(await authApi());}catch(e){notify(e.message);}}
  async function generateToken() {try{const p=await authApi('POST');setNewToken(p.token);await loadIntegration();notify(tr('v32.feedback.28'));}catch(e){notify(e.message);}}
  async function revokeToken() {if(!window.confirm(tr('v32.flow.revokeConfirm')))return;try{await authApi('DELETE');setNewToken('');await loadIntegration();notify(tr('v32.feedback.29'));}catch(e){notify(e.message);}}
  async function toggleEmails() {
    const enabled=!data.profile?.reminders_enabled;
    if(demo){writeDemo({...data,profile:{...data.profile,reminders_enabled:enabled}});return;}
    const {error}=await client.from('profiles').update({reminders_enabled:enabled}).eq('id',user.id);
    if(error)notify(error.message);else await reload();
  }
  async function toggleAutoPayment() {
    const enabled=!data.profile?.auto_confirm_payments;
    if(demo){writeDemo({...data,profile:{...data.profile,auto_confirm_payments:enabled}});return;}
    const {error}=await client.from('profiles').update({auto_confirm_payments:enabled}).eq('id',user.id);
    if(error)notify(error.message);else await reload();
  }
  useEffect(()=>{if(tab==='connect'&&!demo&&user)loadIntegration();},[tab,user?.id]);
  useEffect(()=>{if('serviceWorker' in navigator&&location.protocol==='https:')navigator.serviceWorker.register('/sw.js').catch(()=>{});},[]);
  useEffect(()=>{if(new URLSearchParams(window.location.search).has('invite')||sessionStorage.getItem('pending_house_invite'))setTab('household');const mail=new URLSearchParams(window.location.search).get('mail');if(mail){setTab('connect');notify(mailStatusMessage(mail));window.history.replaceState({},'',window.location.pathname);}},[]);

  const today=todayRome(), soon=addDaysISO(today,7);
  const bills=data.bills||[], utilities=data.utilities||[],tasks=data.tasks||[],suppliers=data.suppliers||[];
  const open=bills.filter(b=>!b.paid_at), urgent=open.filter(b=>b.due_date<=soon);
  const currentMonth=today.slice(0,7), monthBills=bills.filter(b=>b.due_date.startsWith(currentMonth));
  const spent=monthBills.filter(b=>b.paid_at).reduce((a,b)=>a+Number(b.amount),0);
  const dueAmount=open.reduce((a,b)=>a+Number(b.amount),0);
  const overdue=open.filter(b=>b.due_date<today);
  const filteredBills=bills.filter(b=>{
    const q=search.trim().toLowerCase();
    if(q&&!`${b.title} ${b.supplier} ${b.category}`.toLowerCase().includes(q))return false;
    if(billFilter==='unpaid'&&b.paid_at)return false;
    if(billFilter==='paid'&&!b.paid_at)return false;
    if(billFilter==='soon'&&!!b.paid_at)return false;
    if(billFilter==='soon'&&b.due_date>soon)return false;
    return true;
  }).sort((a,b)=>a.due_date.localeCompare(b.due_date));
  const recentMonths=Array.from({length:6},(_,i)=>{const d=new Date(`${today.slice(0,7)}-01T12:00:00Z`);d.setUTCMonth(d.getUTCMonth()-5+i);return d.toISOString().slice(0,7);});
  const monthly=recentMonths.map(m=>({label:new Date(`${m}-01T12:00:00Z`).toLocaleDateString(locale,{month:'short',timeZone:'UTC'}), total:bills.filter(b=>b.due_date.startsWith(m)).reduce((sum,b)=>sum+Number(b.amount),0)}));
  const maxMonthly=Math.max(...monthly.map(x=>x.total),1);
  const displayName=(data.profile?.full_name||user?.email?.split('@')[0]||'').split(' ')[0];
  function openModal(type){if(!canWrite){notify(tr('v32.feedback.30'));return;}setForm({...({bill:billDefault,utility:utilityDefault,task:taskDefault}[type])});setModal(type);}
  function changePage(id){setTab(id);setMobile(false);setBellOpen(false);}
  function switchHome(id){setActiveHomeId(id||null);setTab(id?'dashboard':'household');setData(old=>({...old,bills:[],utilities:[],tasks:[],reminders:[]}));}
  // QR codes contain only the asset UUID. Resolve its home via RLS after login.
  // Never bypass the user's membership permissions or infer an inaccessible home.
  const assetHandled=useRef(false);
  useEffect(()=>{
    if(!client||!user||assetHandled.current)return;
    const ref=new URLSearchParams(window.location.search).get('asset');
    if(!ref||!/^[0-9a-f-]{36}$/i.test(ref))return;
    let current=true;
    client.from('maintenance_assets').select('home_id').eq('id',ref).maybeSingle().then(({data:asset,error})=>{
      if(!current||error||!asset)return;
      if(asset.home_id&& !homes.some(h=>h.home_id===asset.home_id))return;
      // Una volta sola: prima ogni ricarica delle case riportava l'utente sulla scheda QR.
      assetHandled.current=true;
      if((asset.home_id||null)!==(activeHomeId||null)){
        setActiveHomeId(asset.home_id||null);
        setData(old=>({...old,bills:[],utilities:[],tasks:[],reminders:[]}));
      }
      setTab('tags');
    });
    return()=>{current=false};
  },[client,user?.id,homes,activeHomeId]);


  if(initializing)return <div className="loading"><div className="brand-icon"><House size={26}/></div><p>{tr('v32.shell.loading')}</p></div>;
  if(!demo&&!user)return <Auth client={client}/>;
  return <div className="shell">
    {mobile&&<button className="mobile-backdrop" onClick={()=>setMobile(false)} aria-label={tr('ui.closeMenu')}/>}
    <aside className={`sidebar ${mobile?'sidebar-show':''}`}>
      <div className="brand"><span className="brand-icon"><House size={22}/></span><b>Casa<span>inOrdine</span></b></div>
      <div className="sidebar-label">{activeHomeId?homeMembership?.homes?.name||"CASA CONDIVISA":"SPAZIO PERSONALE"}</div><nav className="nav">{menu.map(({id,title,icon:Icon})=><button key={id} className={`nav-item ${tab===id?'active':''}`} onClick={()=>changePage(id)}><Icon size={19}/><span>{tr('nav.'+id)}</span>{tab===id&&<span className="nav-active-indicator"/>}</button>)}</nav>
      <div className="sidebar-spacer"/><div className="sidebar-info"><div className="sidebar-info-icon"><Bell size={18}/></div><b>{tr('v32.shell.reminderTitle')}</b><p>{tr('v32.shell.reminderHelp')}</p></div>
      <div className="sidebar-profile"><span className="avatar"><UserRound size={18}/></span><div className="profile-copy"><b>{demo?tr('v32.overview.demoMode'):user?.email?.split('@')[0]}</b><small>{demo?tr('v32.overview.localData'):tr('v32.overview.privateSpace')}</small></div>{!demo&&<button title={tr('ui.signOut')} className="icon-button" onClick={signOut}><LogOut size={17}/></button>}</div>
    </aside>
    <main className="main">
      <header className="topbar"><button className="icon-button burger" onClick={()=>setMobile(true)} aria-label={tr('ui.openMenu')}><Menu size={23}/></button><div className="crumb"><span>{activeHomeId?homeMembership?.homes?.name||tr('v32.overview.sharedHome'):tr('v32.overview.personalSpace')}</span><ChevronRight size={15}/><b>{tr('nav.'+tab)}</b></div>
        <div className="topbar-right"><LanguageSelector id="topbar-language" className="topbar-language" label={false}/><select className="house-switch" aria-label={tr('ui.selectSpace')} value={activeHomeId||''} onChange={e=>switchHome(e.target.value||null)}><option value="">{tr('general.private')}</option>{homes.map(h=><option key={h.home_id} value={h.home_id}>{h.homes?.name||tr('general.house')}</option>)}</select><span className="today-label"><CalendarDays size={16}/> <DateText iso={today}/></span><div className="bell-parent"><button className="icon-button bell-button" onClick={()=>setBellOpen(!bellOpen)} aria-label={tr('ui.reminders')}><Bell size={20}/>{data.reminders.length>0&&<span className="notification-dot"/>}</button>{bellOpen&&<div className="bell-popover"><b>{tr('v32.notifications.reminderHeading')}</b>{data.reminders.length?data.reminders.slice(0,6).map(r=><div className="bell-entry" key={r.id}><p><Bell size={14}/> <span><strong>{tr('v32.notifications.reminderQuestion')}</strong><span>{r.bills?.title||tr('v32.notifications.billFallback')} · {tr('v32.notifications.dueOn')} <DateText iso={r.bills?.due_date||r.reminder_date}/></span></span></p>{r.bills&&!r.bills.paid_at&&<button className="text-link" onClick={()=>{const b=bills.find(x=>x.id===r.bills.id);if(b)pay(b);setBellOpen(false);}}>{tr('v32.notifications.markPaid')} <Check size={13}/></button>}</div>):<p>{tr('v32.notifications.noReminders')}</p>}</div>}</div><span className="top-avatar"><UserRound size={18}/></span></div>
      </header>
      <div className="content">
        {activeHomeId&&!canWrite&&<div className="informative"><ShieldCheck size={17}/><p>{tr('v32.shell.readOnly')}</p></div>}
        {demo&&<div className="demo-banner"><Info size={17}/><div><b>{tr('v32.batch.demoTitle')}</b> {tr('v32.batch.demoHelp')}</div><button onClick={()=>{localStorage.removeItem('casainordine-demo-v1');setData(fakeData());notify(tr('v32.batch.demoResetDone'));}} >{tr('v32.batch.demoReset')}</button></div>}
        {['insights','archive','properties','maintenance','contracts','payments','alerts'].includes(tab)&&<HomeExtra client={client} demo={demo} user={user} homeId={activeHomeId} canWrite={canWrite} bills={bills} utilities={utilities} tab={tab} onNotify={notify} onRefresh={reload}/>}
        {['tags','sos','radar','simulator','passport','vacation','inventory','decisions','briefing'].includes(tab)&&<V21Hub client={client} user={user} homeId={activeHomeId} canWrite={canWrite} demo={demo} bills={bills} tasks={tasks} tab={tab} onNotify={notify}/>}
        {['monitor','fraud','pagopa','history','moving','savings','offline'].includes(tab)&&<V20Hub client={client} user={user} homeId={activeHomeId} canWrite={canWrite} demo={demo} bills={bills} utilities={utilities} tab={tab} onNotify={notify} onRefresh={reload}/>}
        {tab==='dashboard'&&<PersonalizedHome client={client} demo={demo} user={user} homeId={activeHomeId} canWrite={canWrite} bills={bills} tasks={tasks} displayName={displayName} onNavigate={changePage} onNewBill={()=>openModal('bill')} onNewTask={()=>openModal('task')} onPay={pay} onToggleTask={toggleTask} onRefresh={reload} onNotify={notify}/>}
        {tab==='overview'&&<>
          <div className="page-heading"><div><div className="eyebrow">{tr('overview.eyebrow')}</div><h1>{tr('home.greeting',{who:displayName?`, ${displayName}`:''})} <span className="wave">✳</span></h1><p>{tr('overview.subtitle')}</p></div><button className="btn btn-primary" onClick={()=>openModal('bill')}><Plus size={18}/> {tr('home.widget.bills.new')}</button></div>
          <div className="stat-grid"><div className="stat-card"><div className="stat-top"><span>{tr('overview.totalDue')}</span><span className="stat-icon coral"><Wallet size={20}/></span></div><strong>{money(dueAmount)}</strong><small><span className="small-dot orange"/>{tr('overview.openCount',{count:open.length})}</small></div>
            <div className="stat-card"><div className="stat-top"><span>{tr('overview.dueSoon')}</span><span className="stat-icon amber"><Clock size={20}/></span></div><strong>{urgent.length}</strong><small>{tr(urgent.length?'overview.attention':'overview.allGood')}</small></div>
            <div className="stat-card"><div className="stat-top"><span>{tr('overview.paidMonth')}</span><span className="stat-icon green"><CheckCircle2 size={20}/></span></div><strong>{money(spent)}</strong><small><span className="small-dot green"/> {tr('overview.paidDetail')}</small></div>
            <div className="stat-card"><div className="stat-top"><span>{tr('overview.utilities')}</span><span className="stat-icon blue"><PlugZap size={20}/></span></div><strong>{utilities.length}</strong><small>{tr('overview.activeCount',{count:utilities.filter(u=>u.active).length})}</small></div>
          </div>
          {!suppliers.length&&<section className="panel quick-panel setup-suppliers"><div className="quick-icon"><Mail size={21}/></div><div><b>{tr('overview.suppliers')}</b><p>{tr('overview.suppliersHelp')}</p></div><button className="btn btn-soft" onClick={()=>changePage('utilities')}>{tr('overview.configure')} <ChevronRight size={16}/></button></section>}
          {overdue.length>0&&<div className="overdue-notice"><AlertCircle size={19}/><p>{tr(overdue.length===1?'v32.overview.overdueSingle':'v32.overview.overduePlural',{count:overdue.length})}</p><button onClick={()=>{setBillFilter('unpaid');changePage('bills');}}>{tr('v32.batch.viewBills')} <ChevronRight size={15}/></button></div>}
          <div className="dashboard-columns"><section className="panel"><div className="panel-header"><div><h2>{tr('overview.nextDue')}</h2><p>{tr('overview.nextDueHelp')}</p></div><button className="text-link" onClick={()=>changePage('bills')}>{tr('v32.batch.viewAll')} <ArrowUpRight size={16}/></button></div>
            <div className="mini-bills">{open.length?open.slice().sort((a,b)=>a.due_date.localeCompare(b.due_date)).slice(0,5).map(b=><div className="mini-bill" key={b.id}><CategoryIcon value={b.category}/><div className="mini-bill-info"><b>{b.title}</b><small>{b.supplier||tr('billCategory.'+b.category)} · <DateText iso={b.due_date}/></small></div><div className="mini-end"><b>{money(b.amount)}</b><Status bill={b}/></div><button className="mini-pay" title={tr('ui.markPaid')} onClick={()=>pay(b)}><Check size={17}/></button></div>):<Empty icon={ReceiptText} title={tr('ui.noBillsDue')} body={tr('v32.batch.noBillsHelp')} action={()=>openModal('bill')} button={tr('v32.batch.addBill')}/>}</div>
          </section><section className="panel chart-panel"><div className="panel-header"><div><h2>{tr('overview.spending')}</h2><p>{tr('overview.spendingHelp')}</p></div><span className="chart-pill"><TrendingDown size={15}/> {tr('v32.batch.homeSpending')}</span></div><div className="chart-total">{money(monthly.reduce((s,x)=>s+x.total,0))}<small>{tr('overview.totalPeriod')}</small></div><div className="bars">{monthly.map((m,i)=><div className="bar-col" key={i}><div className="bar-track"><span className="bar-fill" style={{height:`${Math.max(m.total/maxMonthly*100,m.total?5:2)}%`}} title={money(m.total)}/></div><small>{m.label}</small></div>)}</div></section></div>
          {!!data.summaries?.length&&<section className="panel recap-home"><b><CalendarDays size={18}/> {tr('v32.batch.lastSummary')}</b><p><DateText iso={data.summaries[0].summary_date}/> · {tr('v32.overview.summaryDue',{count:data.summaries[0].bill_count,amount:money(data.summaries[0].total_amount)})}</p></section>}
          <div className="home-bottom"><div className="quick-panel"><div className="quick-icon"><PlugZap size={21}/></div><div><b>{tr('v32.batch.addRecurring')}</b><p>{tr('v32.batch.recurringHelp')}</p></div><button className="btn btn-soft" onClick={()=>openModal('utility')}>{tr('v32.overview.add')} <Plus size={16}/></button></div><div className="quick-panel"><div className="quick-icon lavender"><House size={21}/></div><div><b>{tr('v32.batch.tasksTitle')}</b><p>{tr('v32.batch.tasksHelp')}</p></div><button className="btn btn-soft" onClick={()=>changePage('tasks')}>{tr('v32.overview.open')} <ChevronRight size={16}/></button></div></div>
        </>}
        {tab==='bills'&&<><div className="page-heading"><div><div className="eyebrow">{tr('bills.eyebrow')}</div><h1>{tr('bills.heading')}</h1><p>{tr('bills.help')}</p></div><div className="heading-actions"><label className="btn btn-soft upload-label"><FileImage size={17}/> {tr('bills.upload')}<input type="file" accept=".pdf,application/pdf,.jpg,.jpeg,image/jpeg,.png,image/png,.webp,image/webp" onChange={documentImport} disabled={documentState.busy} hidden/></label><button className="btn btn-primary" onClick={()=>openModal('bill')}><Plus size={18}/> {tr('bills.add')}</button></div></div>
          <section className="panel padded"><div className="table-controls"><div className="searchbox"><Search size={18}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder={tr('bills.search')}/></div><div className="filter-tabs">{[['all',tr('general.all')],['unpaid',tr('bills.filter.unpaid')],['soon',tr('bills.filter.soon')],['paid',tr('bills.filter.paid')]].map(([k,label])=><button key={k} onClick={()=>setBillFilter(k)} className={billFilter===k?'selected':''}>{label}</button>)}</div></div>
            {filteredBills.length?<div className="table-scroll"><table className="bills-table"><thead><tr><th>{tr('bills.column.bill')}</th><th>{tr('bills.column.due')}</th><th>{tr('bills.column.amount')}</th><th>{tr('bills.column.status')}</th><th>{tr('bills.column.actions')}</th></tr></thead><tbody>{filteredBills.map(b=><tr key={b.id}><td><div className="table-identity"><CategoryIcon value={b.category}/><div><b>{b.title}</b><small>{b.supplier||tr('billCategory.'+b.category)} {b.is_estimate?' · '+tr('bills.estimated'):''}</small></div></div></td><td><DateText iso={b.due_date}/></td><td className="amount-cell">{money(b.amount)}</td><td><Status bill={b}/></td><td><div className="actions"><button className={`action-btn ${b.paid_at?'muted-action':'pay-action'}`} title={b.paid_at?tr('demo.bill.reopen'):tr('demo.bill.markPaid')} onClick={()=>pay(b)}>{b.paid_at?<RefreshCcw size={16}/>:<Check size={17}/>}</button><button className="action-btn muted-action" title={tr('ui.delete')} onClick={()=>deleteRow('bills',b.id)}><Trash2 size={16}/></button></div></td></tr>)}</tbody></table></div>:<Empty icon={Filter} title={tr('bills.empty.title')} body={tr('bills.empty.help')} action={()=>openModal('bill')} button="Nuova bolletta"/>}</section>
        </>}
        {tab==='utilities'&&<><div className="page-heading"><div><div className="eyebrow">{tr('utilities.eyebrow')}</div><h1>{tr('utilities.heading')}</h1><p>{tr('utilities.help')}</p></div><button className="btn btn-primary" onClick={()=>openModal('utility')}><Plus size={18}/> {tr('utilities.new')}</button></div>
          <section className="panel supplier-panel"><div className="panel-header"><div><h2>{tr('utilities.supplierHeading')}</h2><p>{tr('utilities.supplierHelp')}</p></div></div>
            <form className="supplier-form" onSubmit={addSupplier}><label>{tr('utilities.supplier')}<input required maxLength={120} placeholder="Es. Enel Energia" value={supplierForm.name} onChange={e=>setSupplierForm({...supplierForm,name:e.target.value})}/></label>
            <label>{tr('utilities.service')}<select value={supplierForm.category} onChange={e=>setSupplierForm({...supplierForm,category:e.target.value})}>{categories.map(cat=><option key={cat} value={cat}>{tr('billCategory.'+cat)}</option>)}</select></label>
            <label>{tr('utilities.sender')}<input type="email" placeholder="bollette@esempio.it" value={supplierForm.sender_email} onChange={e=>setSupplierForm({...supplierForm,sender_email:e.target.value})}/></label><button className="btn btn-primary" type="submit"><Plus size={17}/> {tr('utilities.add')}</button></form>
            <div className="supplier-list">{suppliers.map(sp=><div className="supplier-row" key={sp.id}><span><b>{sp.name}</b><small>{tr('billCategory.'+sp.category)}{sp.sender_email?` · ${sp.sender_email}`:''}</small></span><button className="icon-button danger" title={tr('ui.deleteSupplier')} onClick={()=>deleteRow('user_suppliers',sp.id,'suppliers')}><Trash2 size={16}/></button></div>)}{!suppliers.length&&<p className="muted" style={{padding:'0 20px 16px'}}>{tr('utilities.noSuppliers')}</p>}</div>
            <p className="helper-text" style={{padding:'0 20px 18px'}}>{tr('utilities.supplierPrivacy')}</p>
          </section>
          {utilities.length?<div className="utility-grid">{utilities.map(u=><div className="utility-card" key={u.id}><div className="utility-card-head"><CategoryIcon value={u.category}/><span><Tag tone={u.active?'green':'neutral'}>{u.active?tr('utilities.active'):tr('utilities.paused')}</Tag></span></div><h3>{u.supplier}</h3><p>{tr('billCategory.'+u.category)} {u.account_reference&&`· ${u.account_reference}`}</p><div className="utility-detail"><span>{tr('utilities.estimated')}</span><strong>{money(u.estimated_amount)}</strong></div><div className="utility-detail"><span>{tr('utilities.frequency')}</span><strong>{frequencies.some(x=>x.value===u.frequency)?tr('billFrequency.'+u.frequency):'—'}</strong></div><div className="utility-detail"><span>{tr('utilities.next')}</span><strong><DateText iso={u.next_due_date}/></strong></div><div className="utility-footer"><button className="btn btn-soft" onClick={()=>updateRow('utilities',u.id,{active:!u.active})}>{u.active?tr('utilities.pause'):tr('utilities.resume')}</button><button className="icon-button danger" title={tr('ui.deleteUtility')} onClick={()=>deleteRow('utilities',u.id)}><Trash2 size={17}/></button></div></div>)}</div>:<div className="panel"><Empty icon={PlugZap} title={tr('ui.addFirstUtility')} body={tr('utilities.empty')} action={()=>openModal('utility')} button={tr('utilities.addUtility')}/></div>}
          <div className="informative"><Info size={19}/><p>{tr('utilities.disclaimer')}</p></div>
        </>}
        {tab==='tasks'&&<><div className="page-heading"><div><div className="eyebrow">{tr('tasks.eyebrow')}</div><h1>{tr('tasks.heading')}</h1><p>{tr('tasks.help')}</p></div><button className="btn btn-primary" onClick={()=>openModal('task')}><Plus size={18}/> {tr('home.widget.tasks.new')}</button></div><section className="panel tasks-panel">{tasks.length?tasks.slice().sort((a,b)=>(a.done_at?1:0)-(b.done_at?1:0)).map(t=><div className="task-row" key={t.id}><button className={`task-check ${t.done_at?'done':''}`} onClick={()=>toggleTask(t)} aria-label={tr('tasks.complete')}>{t.done_at&&<Check size={16}/>}</button><div className={`task-title ${t.done_at?'completed':''}`}><b>{t.title}</b><small>{t.due_date?<>{tr('tasks.due')} <DateText iso={t.due_date}/></>:tr('home.task.noDate')}{t.assigned_to?` · Assegnata a ${homeMembers.find(m=>m.user_id===t.assigned_to)?.email||'membro'}`:''}</small></div>{t.done_at?<Tag tone="green">{tr('tasks.done')}</Tag>:t.due_date<today?<Tag tone="red">{tr('tasks.late')}</Tag>:<Tag>{tr('tasks.todo')}</Tag>}<button className="icon-button danger" onClick={()=>deleteRow('house_tasks',t.id,'tasks')} title={tr('ui.delete')}><Trash2 size={17}/></button></div>):<Empty icon={House} title={tr('tasks.empty.title')} body={tr('tasks.empty.help')} action={()=>openModal('task')} button="Aggiungi attività"/>}</section></>}
        {tab==='connect'&&<><div className="page-heading"><div><div className="eyebrow">{tr('connect.eyebrow')}</div><h1>{tr('connect.title')}</h1><p>{tr('connect.help')}</p></div></div>
          {!demo?<MailImporter client={client} notify={notify} onReview={reviewEmailDocument} onPaymentsChanged={reload} bills={bills} refresh={mailRefresh}/>:<section className="panel mail-panel"><h2>{tr('connect.demoMailTitle')}</h2><p>{tr('connect.demoMailHelp')}</p></section>}
          <div className="connect-grid"><section className="panel connect-card document-card"><span className="connect-icon"><FileImage size={25}/></span><Tag tone="green">{tr('connect.recommended')}</Tag><h2>{tr('connect.uploadTitle')}</h2><p>{tr('connect.uploadHelp')}</p><label className="btn btn-primary upload-label"><UploadCloud size={17}/> {documentState.busy?tr('connect.analyzing'):tr('connect.selectImage')}<input type="file" accept=".pdf,application/pdf,.jpg,.jpeg,image/jpeg,.png,image/png,.webp,image/webp" onChange={documentImport} disabled={documentState.busy} hidden/></label>{documentState.busy&&<div className="import-progress" role="status"><RefreshCcw size={15} className="spin"/>{documentState.message}</div>}<p className="document-privacy"><ShieldCheck size={16}/> {tr('connect.privacy')}</p></section>
          <section className="panel connect-card"><span className="connect-icon lilac"><RefreshCcw size={24}/></span><Tag tone="green">{tr('connect.scheduled')}</Tag><h2>{tr('connect.recurring')}</h2><p>{tr('connect.recurringHelp')}</p><button className="btn btn-soft" onClick={()=>openModal('utility')}><Plus size={17}/> {tr('connect.configureUtility')}</button></section></div>
          <details className="csv-secondary"><summary><FileText size={18}/> {tr('billPaste.title')}</summary><p>{tr('billPaste.help')}</p><textarea className="bill-paste" rows={5} value={billPaste} onChange={e=>setBillPaste(e.target.value)} placeholder={tr('billPaste.placeholder')}/><button className="btn btn-soft" onClick={importBillFromText}>{tr('billPaste.recognize')}</button></details>
          <section className="panel rate-import-panel"><div className="panel-header"><div><h2>{tr('rateImport.title')}</h2><p>{tr('rateImport.help')}</p></div></div>
            <div className="rate-import-controls"><label>{tr('rateImport.supplier')}<input maxLength={120} value={rateSupplier} onChange={e=>setRateSupplier(e.target.value)} placeholder={tr('rateImport.supplierPlaceholder')}/></label><label>{tr('rateImport.unit')}<input value={rateUnit} onChange={e=>setRateUnit(e.target.value)} placeholder={tr('rateImport.unitPlaceholder')}/></label></div>
            <div className="rate-import-controls"><label className="btn btn-primary upload-label"><FileImage size={16}/> {tr('rateImport.upload')}<input hidden type="file" accept=".pdf,application/pdf,.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" onChange={rateFileImport} disabled={documentState.busy}/></label><span>{tr('rateImport.localPrivacy')}</span></div>
            <details className="rate-paste"><summary>{tr('rateImport.paste')}</summary><textarea rows={4} value={ratePaste} onChange={e=>setRatePaste(e.target.value)} placeholder="Rata 1 - 10/12/2026 - € 125,00\nRata 2 - 10/03/2027 - € 125,00"/><button className="btn btn-soft" onClick={()=>prepareRatePlan(ratePaste,tr('rateImport.pastedSource'))}>{tr('rateImport.recognize')}</button></details>
            {documentState.busy&&<p className="import-progress">{documentState.message}</p>}
          </section>
          <details className="csv-secondary"><summary><FileText size={18}/> {tr('connect.csvTitle')}</summary><p>{tr('connect.csvHelp')}</p><div className="csv-actions"><label className="btn btn-soft upload-label"><UploadCloud size={16}/> {tr('connect.csvSelect')}<input type="file" accept=".csv,text/csv" onChange={csvImport} hidden/></label><button className="text-link" onClick={()=>{const csv='fornitore;importo;scadenza;categoria;descrizione;stato\nEsempio Energia;75,50;25/11/2026;Luce;Bolletta luce;da pagare\n';const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='esempio-bollette.csv';a.click();URL.revokeObjectURL(url);}}><Download size={16}/> {tr('connect.csvExample')}</button></div></details>
          <section className="panel api-panel"><div className="api-head"><div className="connect-icon turquoise"><Link2 size={23}/></div><div><h2>{tr('connect.apiTitle')}</h2><p>{tr('connect.apiHelp')}</p></div><Tag tone={integration?.connected?'green':'neutral'}>{integration?.connected?tr('connect.keyActive'):tr('connect.optional')}</Tag></div>
          {demo?<div className="api-muted"><LockKeyhole size={17}/> {tr('connect.keyDemo')}</div>:<><div className="api-buttons"><button className="btn btn-primary" onClick={generateToken}>{integration?.connected?tr('connect.keyRegenerate'):tr('connect.keyGenerate')}</button>{integration?.connected&&<button className="btn btn-soft danger-text" onClick={revokeToken}>{tr('connect.keyRevoke')}</button>}</div>
            {newToken&&<div className="token-box"><label>{tr('connect.keyOnce')}</label><code>{newToken}</code><button className="btn btn-soft" onClick={()=>{navigator.clipboard.writeText(newToken);notify(tr('connect.keyCopied'));}}>{tr('connect.keyCopy')}</button></div>}
            <div className="endpoint-box"><small>{tr('connect.endpoint')}</small><code>{typeof window!=='undefined'?window.location.origin:''}/api/ingest</code><small>{tr('connect.method')}</small></div><details className="api-example"><summary>{tr('connect.example')}</summary><pre>{JSON.stringify({external_id:'fattura-2026-001',title:'Bolletta luce',supplier:'Mio fornitore',category:'Luce',amount:89.50,due_date:'2026-11-25',paid:false},null,2)}</pre></details>
          </>}
          <div className="api-footnote"><ShieldCheck size={18}/> {tr('connect.keyWarning')}</div></section>
          <div className="informative"><Info size={19}/><p>{tr('connect.gmailNotice')}</p></div>
        </>}
        {['household','budget','shopping','vehicles'].includes(tab)&&<><div className="page-heading"><div><div className="eyebrow">{tr('v32.batch.familyEyebrow')}</div><h1>{tr('nav.'+tab)}</h1><p>{activeHomeId?`${homeMembership?.homes?.name||tr('general.house')} · ${tr('v32.overview.familyRole'+(homeMembership?.role==='owner'?'Owner':homeMembership?.role==='editor'?'Editor':homeMembership?.role==='viewer'?'Viewer':'Member'))}`:tr('v32.batch.familyHelp')}</p></div></div>
          <HouseholdHub client={client} demo={demo} user={user} homes={homes} homeId={activeHomeId} role={homeMembership?.role} onChangeHome={switchHome} onHomesReload={async()=>{await reloadHomes();await reload();}} onNotify={notify} section={tab} bills={bills}/></>}
        {tab==='settings'&&<><div className="page-heading"><div><div className="eyebrow">{tr('settings.eyebrow')}</div><h1>{tr('nav.settings')}</h1><p>{tr('settings.help')}</p></div></div>{!demo&&user&&<SampleAccountSetup client={client} user={user} homes={homes} onNotify={notify} onCreated={async id=>{await reloadHomes();setActiveHomeId(id);setTab('dashboard');}}/>}<section className="panel settings-panel lang-settings"><div className="settings-heading"><span className="settings-icon"><Settings size={20}/></span><div><h2>{tr('settings.language')}</h2><p>{tr('settings.language.help')}</p></div></div><LanguageSelector label={false} id="settings-language"/><p className="muted">{tr('general.currencyNote')}</p></section><div className="settings-grid"><section className="panel settings-panel"><div className="settings-heading"><span className="settings-icon"><Bell size={20}/></span><div><h2>{tr('settings.reminders')}</h2><p>{tr('settings.remindersHelp')}</p></div></div><div className="setting-row"><div><b>{tr('settings.remindersEnabled')}</b><small>{tr('settings.remindersChannels')}</small></div><button className={`toggle ${data.profile?.reminders_enabled?'on':''}`} onClick={toggleEmails} aria-label={tr('settings.toggleReminders')} aria-pressed={!!data.profile?.reminders_enabled}><span/></button></div><div className="setting-row"><div><b>{tr('settings.reminderAdvance')}</b><small>{tr('settings.unpaidNote')}</small></div><Tag tone="green">{tr('settings.threeDays')}</Tag></div><div className="summary-settings"><h3>{tr('settings.monthSummary')}</h3><p>{tr('settings.monthSummaryHelp')}</p>
            <label>{tr('settings.summaryFrequency')}<select value={data.profile?.summary_frequency||'off'} onChange={e=>updateSummaryPrefs({summary_frequency:e.target.value})}>{[['off','Disattivato'],['daily','Ogni giorno'],['weekly','Ogni settimana'],['biweekly','Ogni 2 settimane'],['monthly','Ogni mese']].map(([v])=><option value={v} key={v}>{tr('settings.freq.'+v)}</option>)}</select></label>
            {['weekly','biweekly'].includes(data.profile?.summary_frequency)&&<label>{tr('settings.weekday')}<select value={data.profile?.summary_weekday??1} onChange={e=>updateSummaryPrefs({summary_weekday:Number(e.target.value)})}>{[0,1,2,3,4,5,6].map(i=><option key={i} value={i}>{weekdayLabel(i)}</option>)}</select></label>}
            {data.profile?.summary_frequency==='monthly'&&<label>{tr('settings.monthDay')}<input type="number" min="1" max="28" value={data.profile?.summary_month_day??1} onChange={e=>{const d=Number(e.target.value);if(d>=1&&d<=28)updateSummaryPrefs({summary_month_day:d});}}/></label>}
            <small>{tr('settings.summaryNote')}</small></div>
            {!demo&&<><PushSettings client={client} onNotify={notify}/><CalendarFeed client={client} onNotify={notify}/></>}<div className="summary-settings"><h3>{tr('settings.phoneCalendar')}</h3><p>{tr('settings.exportHelp')}</p><button className="btn btn-soft" onClick={()=>downloadCalendar(bills.filter(b=>!b.paid_at),activeHomeId?'scadenze-casa':'scadenze-personali')}><CalendarDays size={16}/> {tr('settings.exportCalendar')}</button></div><div className="setting-row"><div><b>{tr('settings.autoPayment')}</b><small>{tr('settings.autoPaymentHelp')}</small></div><button className={`toggle ${data.profile?.auto_confirm_payments?'on':''}`} onClick={toggleAutoPayment} aria-label={tr('settings.autoPaymentToggle')} aria-pressed={!!data.profile?.auto_confirm_payments}><span/></button></div></section>
          <section className="panel settings-panel"><div className="settings-heading"><span className="settings-icon"><LockKeyhole size={20}/></span><div><h2>{tr('settings.privacyHeading')}</h2><p>{tr('settings.privacyHelp')}</p></div></div><div className="setting-row"><div><b>{tr('settings.account')}</b><small>{demo?tr('settings.demoLocal'):user?.email||tr('settings.personalAccount')}</small></div><ShieldCheck size={20} className="subtle-green"/></div><div className="setting-row"><div><b>{tr('settings.sharing')}</b><small>{tr('settings.sharingHelp')}</small></div><button className="btn btn-soft" onClick={()=>changePage('household')}>{tr('settings.manageHomes')}</button></div>{!demo&&<button className="btn btn-soft" onClick={signOut}><LogOut size={17}/> {tr('settings.signout')}</button>}</section></div>{!demo&&user&&<DeleteAccountPanel client={client} user={user} t={tr} onNotify={notify}/>}</>}
      </div>
    </main>
    {recovery&&<PasswordRecoveryDialog client={client} t={tr} onDone={message=>{setRecovery(false);notify(message);}}/>}
    {ratePlan&&<div className="modal-overlay"><div className="modal rate-modal" role="dialog" aria-modal="true" aria-labelledby="rate-modal-title" tabIndex={-1} ref={dialogRef}><div className="modal-head"><div><div className="eyebrow">{tr('rates.eyebrow')}</div><h2 id="rate-modal-title">{tr('rates.count',{count:ratePlan.rows.length})}</h2></div><button className="icon-button" onClick={()=>setRatePlan(null)} aria-label={tr('ui.close')}><X size={20}/></button></div>
      <div className="rate-modal-body"><p>{tr('rates.source',{source:ratePlan.source})}</p>{ratePlan.warnings.map((w,i)=><p className="rate-warning" key={i}><AlertCircle size={15}/> {w}</p>)}
      <div className="table-scroll"><table className="bills-table"><thead><tr><th>{tr('rates.use')}</th><th>{tr('rates.description')}</th><th>{tr('rates.due')}</th><th>{tr('rates.amount')}</th></tr></thead><tbody>{ratePlan.rows.map((r,i)=><tr key={i}><td><input type="checkbox" checked={r.selected} onChange={e=>setRatePlan({...ratePlan,rows:ratePlan.rows.map((x,j)=>j===i?{...x,selected:e.target.checked}:x)})}/></td><td><input aria-label={tr('rates.itemDescription',{number:i+1})} value={r.title} onChange={e=>setRatePlan({...ratePlan,rows:ratePlan.rows.map((x,j)=>j===i?{...x,title:e.target.value}:x)})}/></td><td><input type="date" aria-label={tr('rates.itemDate',{number:i+1})} value={r.due_date} onChange={e=>setRatePlan({...ratePlan,rows:ratePlan.rows.map((x,j)=>j===i?{...x,due_date:e.target.value}:x)})}/></td><td><input type="number" min="0.01" step="0.01" aria-label={tr('rates.itemAmount',{number:i+1})} value={r.amount} onChange={e=>setRatePlan({...ratePlan,rows:ratePlan.rows.map((x,j)=>j===i?{...x,amount:e.target.value}:x)})}/></td></tr>)}</tbody></table></div>
      <div className="modal-actions"><button className="btn btn-soft" onClick={()=>setRatePlan(null)}>{tr('general.cancel')}</button><button className="btn btn-primary" disabled={busy} onClick={saveRatePlan}>{busy?tr('form.saving'):tr('rates.saveSelected')} <Check size={16}/></button></div></div></div></div>}
    {modal&&<div className="modal-overlay" onMouseDown={e=>{if(e.target===e.currentTarget&&form.source!=='document')setModal(null);}}><div className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" tabIndex={-1} ref={dialogRef}><div className="modal-head"><div><div className="eyebrow">{tr(modal==='bill'?(form.source==='document'?'form.eyebrowDocument':'form.eyebrowBill'):modal==='utility'?'form.eyebrowUtility':'form.eyebrowTask')}</div><h2 id="modal-title">{tr(modal==='bill'?(form.source==='document'?'form.reviewBill':'form.addBill'):modal==='utility'?'form.connectUtility':'form.addTask')}</h2></div><button className="icon-button" onClick={()=>setModal(null)} aria-label={tr('ui.close')}><X size={21}/></button></div>
      <form onSubmit={modal==='bill'?saveBill:modal==='utility'?saveUtility:saveTask} className="modal-form">
        {modal==='bill'&&<>{form.source==='document'&&<div className="document-review"><div className="document-review-head"><FileText size={19}/><div><b>{tr('form.documentRead',{name:form.import_file})}</b><small>{tr('form.ocrHelp')}</small></div></div>{form.import_warnings?.length>0&&<ul>{form.import_warnings.map((warning,index)=><li key={index}>{warning}</li>)}</ul>}</div>}<label>{tr('form.description')} <input required maxLength={180} autoFocus value={form.title||''} onChange={e=>setForm({...form,title:e.target.value})} placeholder={tr('form.billPlaceholder')}/></label><label>{tr('form.supplier')} <input maxLength={120} value={form.supplier||''} onChange={e=>setForm({...form,supplier:e.target.value})} placeholder={tr('form.supplierPlaceholder')}/></label><div className="form-row"><label>{tr('form.category')} <select value={form.category} onChange={e=>setForm({...form,category:e.target.value})}>{categories.map(c=><option key={c} value={c}>{tr('billCategory.'+c)}</option>)}</select></label><label>{tr('form.amount')} <input required type="number" min="0" step="0.01" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})} placeholder={new Intl.NumberFormat(locale,{minimumFractionDigits:2,maximumFractionDigits:2}).format(0)}/></label></div><label>{tr('form.dueDate')} <input type="date" required value={form.due_date} onChange={e=>setForm({...form,due_date:e.target.value})}/></label><label className="checkbox-label"><input type="checkbox" checked={!!form.paid} onChange={e=>setForm({...form,paid:e.target.checked})}/> {tr('form.paid')}</label></>}
        {modal==='utility'&&<><label>{tr('form.supplierName')} <input autoFocus required maxLength={120} value={form.supplier||''} onChange={e=>setForm({...form,supplier:e.target.value})} placeholder={tr('form.internetPlaceholder')}/></label><div className="form-row"><label>{tr('form.category')}<select value={form.category} onChange={e=>setForm({...form,category:e.target.value})}>{categories.map(c=><option key={c} value={c}>{tr('billCategory.'+c)}</option>)}</select></label><label>{tr('form.estimatedAmount')}<input required type="number" step="0.01" min="0" value={form.estimated_amount} onChange={e=>setForm({...form,estimated_amount:e.target.value})} placeholder={new Intl.NumberFormat(locale,{minimumFractionDigits:2,maximumFractionDigits:2}).format(0)}/></label></div><label>{tr('form.accountReference')}<input maxLength={120} value={form.account_reference||''} onChange={e=>setForm({...form,account_reference:e.target.value})} placeholder={tr('form.passwordWarning')}/></label><div className="form-row"><label>{tr('form.frequency')}<select value={form.frequency} onChange={e=>setForm({...form,frequency:e.target.value})}>{frequencies.map(f=><option key={f.value} value={f.value}>{tr('billFrequency.'+f.value)}</option>)}</select></label><label>{tr('form.firstDue')}<input type="date" required value={form.next_due_date} onChange={e=>setForm({...form,next_due_date:e.target.value})}/></label></div><p className="helper-text"><Info size={15}/> {tr('form.estimateHelp')}</p></>}
        {modal==='task'&&<><label>{tr('form.task')}<input autoFocus required maxLength={180} value={form.title||''} onChange={e=>setForm({...form,title:e.target.value})} placeholder={tr('form.taskPlaceholder')}/></label><label>{tr('form.taskDate')}<input type="date" value={form.due_date||''} onChange={e=>setForm({...form,due_date:e.target.value})}/></label>{activeHomeId&&<label>{tr('form.assignTo')}<select value={form.assigned_to||''} onChange={e=>setForm({...form,assigned_to:e.target.value})}><option value="">{tr('form.unassigned')}</option>{homeMembers.map(m=><option key={m.user_id} value={m.user_id}>{m.email}</option>)}</select></label>}</>}
        <div className="modal-actions"><button type="button" className="btn btn-soft" onClick={()=>setModal(null)}>{tr('general.cancel')}</button><button className="btn btn-primary" type="submit" disabled={busy}>{tr(busy?'form.saving':modal==='bill'?'form.confirmSave':modal==='utility'?'form.addUtility':'form.saveTask')}<Check size={17}/></button></div>
      </form></div></div>}
    <Toast message={toast} onClose={()=>setToast('')}/>
  </div>;
}
