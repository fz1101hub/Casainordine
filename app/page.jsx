'use client';
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import {
  LayoutDashboard, ReceiptText, PlugZap, House, UploadCloud, Settings, Bell,
  Plus, Search, CheckCircle2, CalendarDays, LogOut, ArrowUpRight, TrendingDown,
  Wallet, LockKeyhole, Trash2, Mail, ShieldCheck, RefreshCcw, Link2,
  Menu, X, UserRound, Download, Cloud, Info, Clock, AlertCircle, Check,
  Filter, ChevronRight, Zap, CircleHelp, Send, Eye, EyeOff, FileImage, FileText, Users, ShoppingBasket, Car, Archive, BarChart3, Wrench, Building2, ClipboardList, ScanSearch, HardHat, SunSnow, Sprout, PawPrint, Landmark, HeartPulse, IdCard, CalendarRange, Package, Hammer, PiggyBank, KeyRound, Gauge
} from 'lucide-react';
import { db } from '../lib/supabase-browser';
import { addDaysISO, nextRecurringDue, todayRome, normalizeDate, euro } from '../lib/dates.mjs';
import { BILL_CATEGORIES } from '../lib/bill-categories.mjs';
// Lettura di CSV, piani rate e documenti: moduli scaricati solo quando servono (import()).
import { billTitle } from '../lib/bill-title.mjs';
import { selectAll } from '../lib/select-all.mjs';
import { textMatches } from '../lib/search-text.mjs';
import { downloadCalendar } from '../lib/calendar-download.js';
import { ForgotPasswordButton, PasswordRecoveryDialog, DeleteAccountPanel } from './AccountSecurity';
import { MIN_PASSWORD_LENGTH, passwordTooShort, markPasswordUpgrade, clearPasswordUpgrade, needsPasswordUpgrade } from '../lib/password-policy.mjs';
import { MENU_TOP, MENU_GROUPS, MENU_BOTTOM, toggleGroup, withPageGroup, readOpenGroups, saveOpenGroups } from '../lib/menu-groups.mjs';
import PersonalizedHome from './PersonalizedHome';
import {useLanguage,LanguageSelector} from './LanguageProvider';
import {useLocalizedTitle} from './LocalizedTitle';
import UniversalSearch from './UniversalSearch';
import {localizeMainDemo} from '../lib/v32-demo-fixture-labels.mjs';
import { friendlyError, apiErrorText, apiText, authErrorKey, shownError } from '../lib/friendly-error.mjs';
import { memberName } from '../lib/member-names.mjs';
import dynamic from 'next/dynamic';
import { askConfirm, askText } from './ConfirmDialog';
import DecimalInput from './DecimalInput';

// Le sezioni che non si vedono all'avvio si scaricano solo quando si aprono (secondo audit, A1):
// prima arrivavano tutte insieme alla prima apertura dell'app.
function SectionLoading(){const {t}=useLanguage();return <p className="import-progress" role="status">{t('general.loading')}</p>;}
const lazy=load=>dynamic(load,{loading:()=><SectionLoading/>});
const MailImporter=lazy(()=>import('./MailImporter'));
const HouseholdHub=lazy(()=>import('./HouseholdHub'));
const PushSettings=lazy(()=>import('./PushSettings'));
const CalendarFeed=lazy(()=>import('./CalendarFeed'));
const ConfigStatus=lazy(()=>import('./ConfigStatus'));
const HomeExtra=lazy(()=>import('./HomeExtra'));
const Automations=lazy(()=>import('./Automations'));
const Professionals=lazy(()=>import('./Professionals'));
const Seasonal=lazy(()=>import('./Seasonal'));
const Stock=lazy(()=>import('./Stock'));
const Garden=lazy(()=>import('./Garden'));
const Pets=lazy(()=>import('./Pets'));
const FamilyDocuments=lazy(()=>import('./FamilyDocuments'));
const Installments=lazy(()=>import('./Installments'));
const Taxes=lazy(()=>import('./Taxes'));
const Health=lazy(()=>import('./Health'));
const Projects=lazy(()=>import('./Projects'));
const ReplacementFund=lazy(()=>import('./ReplacementFund'));
const Rental=lazy(()=>import('./Rental'));
const Control=lazy(()=>import('./Control'));
const V20Hub=lazy(()=>import('./V20Hub'));
const V21Hub=lazy(()=>import('./V21Hub'));
const SampleAccountSetup=lazy(()=>import('./SampleAccountSetup'));

const categories = BILL_CATEGORIES;
const frequencies = [{value:'none'},{value:'monthly'},{value:'bimonthly'},{value:'quarterly'},{value:'yearly'},{value:'biennial'}];
const menu = [
  {id:'dashboard',icon:LayoutDashboard},
  {id:'overview',icon:BarChart3},
  {id:'control',icon:Gauge},
  {id:'bills',icon:ReceiptText},
  {id:'utilities',icon:PlugZap},
  {id:'tasks',icon:House},
  {id:'seasonal',icon:SunSnow},
  {id:'garden',icon:Sprout},
  {id:'pets',icon:PawPrint},
  {id:'health',icon:HeartPulse},
  {id:'iddocs',icon:IdCard},
  {id:'installments',icon:CalendarRange},
  {id:'household',icon:Users},
  {id:'budget',icon:Wallet},
  {id:'shopping',icon:ShoppingBasket},
  {id:'stock',icon:Package},
  {id:'vehicles',icon:Car},
  {id:'insights',icon:BarChart3},
  {id:'archive',icon:Archive},
  {id:'properties',icon:Building2},
  {id:'maintenance',icon:Wrench},
  {id:'professionals',icon:HardHat},
  {id:'projects',icon:Hammer},
  {id:'replacement',icon:PiggyBank},
  {id:'rental',icon:KeyRound},
  {id:'contracts',icon:ClipboardList},
  {id:'payments',icon:CheckCircle2},
  {id:'alerts',icon:Bell},
  {id:'automations',icon:Zap},
  {id:'monitor',icon:Mail},
  {id:'fraud',icon:ShieldCheck},
  {id:'taxes',icon:Landmark},
  {id:'pagopa',icon:ReceiptText},
  {id:'history',icon:Clock},
  {id:'moving',icon:House},
  {id:'savings',icon:Wallet},
  {id:'offline',icon:Cloud},
  {id:'briefing',icon:ClipboardList},
  {id:'tags',icon:ScanSearch},
  {id:'sos',icon:ShieldCheck},
  {id:'radar',icon:Search},
  {id:'simulator',icon:BarChart3},
  {id:'passport',icon:FileText},
  {id:'vacation',icon:House},
  {id:'inventory',icon:Archive},
  {id:'decisions',icon:Users},
  {id:'connect',icon:Link2},
  {id:'settings',icon:Settings},
];
const menuIcons = Object.fromEntries(menu.map(({id,icon})=>[id,icon]));
const BILL_PAGE = 100;
const NOT_NAMES = new Set(['info','admin','contact','contatti','mail','email','posta','casa','home','test','user','utente','noreply','famiglia','family','office','ufficio','amministrazione','account','hello','ciao','support']);
function nameFromEmail(email){
  const first=String(email||'').split('@')[0].split(/[._+\-]/)[0]||'';
  if(!/^[a-zàèéìòù]{2,20}$/i.test(first)||NOT_NAMES.has(first.toLowerCase()))return '';
  return first[0].toUpperCase()+first.slice(1).toLowerCase();
}
const billDefault = {title:'',supplier:'',category:'Luce',amount:'',due_date:addDaysISO(todayRome(),7),paid:false};
// Dati in più letti da un documento (lib/document-import.mjs): periodo e consumo si salvano con la
// bolletta (servono ai grafici dei consumi), POD e PDR si mostrano solo per controllo.
const documentExtras = x => ({period_start:x?.period_start||'',period_end:x?.period_end||'',consumption_value:x?.consumption_value??'',
  consumption_unit:x?.consumption_unit||'',import_pod:x?.pod||'',import_pdr:x?.pdr||''});
const utilityDefault = {supplier:'',category:'Luce',account_reference:'',estimated_amount:'',frequency:'monthly',next_due_date:addDaysISO(todayRome(),14)};
const taskDefault = {title:'',due_date:addDaysISO(todayRome(),7),assigned_to:''};
const uuid = () => crypto.randomUUID();

function fakeData() {
  const today = todayRome();
  const bills = [
    {id:'demo-1',title:'Bolletta luce',supplier:'Energia Esempio',category:'Luce',amount:84.50,due_date:addDaysISO(today,3),paid_at:null,source:'manual',is_estimate:false},
    {id:'demo-2',title:'Fibra internet',supplier:'Rete Demo',category:'Internet',amount:29.90,due_date:addDaysISO(today,8),paid_at:null,source:'recurring',is_estimate:true},
    {id:'demo-3',title:'Acqua e fognatura',supplier:'Acquedotto Esempio',category:'Acqua',amount:46.20,due_date:addDaysISO(today,16),paid_at:null,source:'csv',is_estimate:false},
    {id:'demo-4',title:'Bolletta gas',supplier:'Gas di Prova',category:'Gas',amount:97.80,due_date:addDaysISO(today,-5),paid_at:new Date().toISOString(),source:'manual',is_estimate:false},
  ];
  return {bills,utilities:[{id:'demo-u1',supplier:'Rete Demo',category:'Internet',estimated_amount:29.9,frequency:'monthly',next_due_date:addDaysISO(today,38),billing_day:12,active:true,account_reference:'••••42'}],
    tasks:[{id:'demo-t1',title:'Pulire il filtro del climatizzatore',due_date:addDaysISO(today,5),done_at:null}],
    suppliers:[],summaries:[],profile:{full_name:'',reminders_enabled:true,reminder_emails:true,auto_confirm_payments:false,summary_frequency:'off',summary_weekday:1,summary_month_day:1,email:''},reminders:[{id:'demo-rem1',reminder_date:today,email_sent_at:null,bills:{id:'demo-1',title:'Bolletta luce',due_date:addDaysISO(today,3),amount:84.50,paid_at:null}}]};
}

// Conservare il file originale delle bollette lette da PDF o foto: scelta ricordata su questo dispositivo (di base sì).
const KEEP_FILE_KEY='casainordine-keep-file';
function keepFilePreference(){try{return localStorage.getItem(KEEP_FILE_KEY)!=='0';}catch{return true;}}
function saveKeepFilePreference(keep){try{localStorage.setItem(KEEP_FILE_KEY,keep?'1':'0');}catch{}}
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
// La data di oggi in alto: la pagina viene preparata al momento della pubblicazione, quindi la
// mostriamo solo nel browser, altrimenti dal giorno dopo React segnala una pagina diversa.
function TodayText({iso}) { const [ready,setReady]=useState(false); useEffect(()=>{setReady(true);},[]); return ready?<DateText iso={iso}/>:null; }
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
    e.preventDefault(); setError('');
    // Password nuove: almeno 8 caratteri. Chi ne ha già una più corta entra e poi la cambia.
    if (signup && passwordTooShort(password)) { setError(t('auth.passwordTooShort')); return; }
    const upgrade = !signup && passwordTooShort(password);
    if (upgrade) markPasswordUpgrade(sessionStorage, email);
    setPending(true);
    const {data,error:err} = signup ? await client.auth.signUp({email,password}) : await client.auth.signInWithPassword({email,password});
    setPending(false);
    if (err) { if (upgrade) clearPasswordUpgrade(sessionStorage); setError(t(authErrorKey(err))); }
    else if (signup && !data.session) setError(t('auth.confirm'));
  }
  async function google() {
    const invite=new URLSearchParams(window.location.search).get('invite');
    if(invite && /^[a-f0-9]{64}$/.test(invite))sessionStorage.setItem('pending_house_invite',invite);
    const {error:err} = await client.auth.signInWithOAuth({provider:'google',options:{redirectTo:window.location.origin}});
    if (err) setError(t(authErrorKey(err)));
  }
  return <div className="auth-wrap"><div className="auth-decoration"><span className="auth-logo"><House size={23}/></span><p>{t('auth.brandLine')}</p><h1>{t('auth.tagline')}</h1><p className="auth-intro">{t('auth.intro')}</p><div className="auth-quote"><Bell size={21}/> {t('auth.reminder')}</div></div>
    <div className="auth-card"><LanguageSelector id="auth-language" className="auth-language" label={true}/><div className="brand auth-mobile"><span className="brand-icon"><House size={22}/></span><b>Casa<span>inOrdine</span></b></div><div className="eyebrow">{t('v32.notifications.authEyebrow')}</div><h2>{t(signup?'auth.signupTitle':'auth.title')}</h2><p className="muted">{t(signup?'auth.signupHelp':'auth.loginHelp')}</p>
      <form onSubmit={submit}><label>{t('auth.email')}<input type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder={t('ui.emailPlaceholder')}/></label><label>{t('auth.password')}<input type="password" minLength={signup?MIN_PASSWORD_LENGTH:undefined} autoComplete={signup?'new-password':'current-password'} required value={password} onChange={e=>setPassword(e.target.value)} placeholder={signup?t('auth.passwordHint'):undefined}/></label>{!signup&&<ForgotPasswordButton client={client} email={email} t={t} onMessage={message=>{setError('');setInfo(message);}}/>}<button className="btn btn-primary full" disabled={pending}>{t(pending?'auth.signingIn':signup?'auth.signUp':'auth.signIn')}<ChevronRight size={17}/></button></form>
      <div className="auth-separator">{t('auth.or')}</div><a className="btn btn-soft full" href="/prova" style={{textDecoration:'none',justifyContent:'center'}}><House size={18}/> {t('auth.demo')}</a><button className="btn btn-soft full" onClick={google}><span className="google-dot">G</span> {t('auth.google')}</button>
      {error&&<p className="auth-error">{error}</p>}{info&&!error&&<p className="auth-info" role="status">{info}</p>}<p className="auth-switch">{t(signup?'auth.hasAccount':'auth.noAccount')} <button onClick={()=>{setSignup(!signup);setError('');}}>{t(signup?'auth.signIn':'auth.signUp')}</button></p><p className="privacy-line"><LockKeyhole size={13}/> {t('auth.privacy')}</p>
    </div></div>;
}

// Esiti del ritorno da Google/Microsoft (app/api/mail/callback/route.js).
const MAIL_STATUS={connected:'mail.status.connected',denied:'mail.status.denied',expired:'mail.status.expired',other_browser:'mail.status.otherBrowser',no_refresh:'mail.status.noRefresh'};
function mailStatusMessage(status,tr){return tr(MAIL_STATUS[status]||'mail.status.failed');}

export default function Page() {
  const {t:tr,money,locale,language,date:formatDay}=useLanguage();
  useLocalizedTitle('meta.title','meta.description');
  const weekdayLabel=day=>new Intl.DateTimeFormat(locale,{weekday:'long',timeZone:'UTC'}).format(new Date(Date.UTC(2023,0,1+day)));
  const client = useMemo(()=>db(),[]), demo = !client;
  const [user,setUser] = useState(null), [initializing,setInitializing] = useState(!demo);
  const [data,setData] = useState({bills:[],utilities:[],tasks:[],suppliers:[],summaries:[],profile:null,reminders:[]});
  const [tab,setTab] = useState('dashboard'), [mobile,setMobile] = useState(false);
  useEffect(()=>{if(new URLSearchParams(window.location.search).has('asset'))setTab('tags')},[]);
  const [homes,setHomes] = useState([]),[activeHomeId,setActiveHomeId]=useState(null),[homeMembers,setHomeMembers]=useState([]),[formerMembers,setFormerMembers]=useState([]);
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
  const [capture,setCapture]=useState(null),[captureIntent,setCaptureIntent]=useState(null);
  // File letto per la bolletta in corso (da conservare nell'archivio) e bollette che hanno il file originale.
  const [documentFile,setDocumentFile]=useState(null),[billFiles,setBillFiles]=useState(()=>new Map());
  const [ratePlan,setRatePlan]=useState(null), [ratePaste,setRatePaste]=useState(''), [rateUnit,setRateUnit]=useState(''), [rateSupplier,setRateSupplier]=useState('Condominio'), [billPaste,setBillPaste]=useState('');

  const notify = txt=>{setToast(txt);};
  const homesSeq=useRef(0), dataSeq=useRef(0), dataHome=useRef(undefined);
  // Dati caricati almeno una volta: prima «Per cominciare» compariva per un attimo anche a chi ha già
  // bollette, mentre si caricavano.
  const [dataLoaded,setDataLoaded]=useState(false);
  // Ultimo caricamento dei dati riuscito (per ricaricare tornando all'app, vedi più sotto).
  const lastLoad=useRef(Date.now());
  const reloadHomes=useCallback(async()=>{
    if(!client)return;
    const seq=++homesSeq.current;
    // Solo le proprie appartenenze: le regole di accesso mostrano anche gli altri membri delle
    // proprie case, e senza questo filtro chi legge o modifica risultava con il ruolo del
    // proprietario (la sua riga viene prima) e vedeva la stessa casa più volte.
    const {data:{session}}=await client.auth.getSession();
    const uid=session?.user?.id;if(!uid)return;
    const {data:membership,error}=await client.from('home_members').select('home_id,role,homes(id,name,owner_id)').eq('user_id',uid).order('joined_at');
    if(seq!==homesSeq.current)return;
    if(error){if(error.code!=='42P01')notify(tr('v32.flow.homesError',{error:friendlyError(error,tr)}));return;}
    const allowed=membership||[];
    setHomes(allowed);
    setActiveHomeId(old=>old && !allowed.some(h=>h.home_id===old)?null:old);
  },[client]);
  const reload = useCallback(async()=>{
    if (!client) return;
    const seq=++dataSeq.current;
    const scope=q=>activeHomeId?q.eq('home_id',activeHomeId):q.is('home_id',null);
    // Bollette, utenze e attività possono superare le 1000 righe (il massimo di Supabase per richiesta):
    // si leggono a pagine (lib/select-all.mjs), con l'id come ultimo ordine.
    const all=(table,order)=>selectAll(count=>scope(client.from(table).select('*',count?{count:'exact'}:undefined)).order(order,{ascending:true}).order('id',{ascending:true}));
    const [b,u,t,p,r,sp,sm] = await Promise.all([
      all('bills','due_date'),
      all('utilities','next_due_date'),
      all('house_tasks','due_date'),
      client.from('profiles').select('*').single(),
      client.from('reminders').select('*,bills(id,title,supplier,due_date,amount,paid_at,home_id)').order('created_at',{ascending:false}).limit(30),
      client.from('user_suppliers').select('*').order('created_at',{ascending:true}),
      client.from('bill_summaries').select('*').order('summary_date',{ascending:false}).limit(12)
    ]);
    // Cambiando casa in fretta può arrivare per ultima la risposta della casa precedente: si scarta,
    // altrimenti le sue bollette comparirebbero (e si segnerebbero pagate) sotto la casa nuova.
    if (seq!==dataSeq.current) return;
    lastLoad.current=Date.now();
    const err = [b,u,t,p,r,sp,sm].find(x=>x.error);
    // Con un errore (per esempio rete assente) restano i dati già mostrati della STESSA casa: le
    // liste vuote farebbero credere che non ci sia nessuna bolletta da pagare. Quelli di un'altra
    // casa invece non devono restare sotto il nome di questa.
    if (err) {
      notify(tr('v32.flow.loadError',{error:friendlyError(err.error,tr)}));
      if (dataHome.current===(activeHomeId||null)) return;
    }
    dataHome.current=err?undefined:(activeHomeId||null);
    if(!err)setDataLoaded(true);
    setData({bills:b.data||[],utilities:u.data||[],tasks:t.data||[],suppliers:sp.data||[],summaries:sm.data||[],profile:p.data||null,
      reminders:(r.data||[]).filter(item=>item.bills&&!item.bills.paid_at&&item.bills.home_id===activeHomeId)});
  },[client,activeHomeId]);
  // Tornando all'app (scheda o telefono riaperti) dopo almeno un minuto si ricaricano i dati: un altro
  // membro della casa può aver pagato, aggiunto o eliminato qualcosa nel frattempo.
  useEffect(()=>{
    if(demo||!client)return;
    const onVisible=()=>{if(document.visibilityState==='visible'&&user&&Date.now()-lastLoad.current>=60_000){lastLoad.current=Date.now();reloadRef.current();reloadHomesRef.current();}};
    document.addEventListener('visibilitychange',onVisible);
    return()=>document.removeEventListener('visibilitychange',onVisible);
  },[demo,client,user]);
  // Cambio di casa: si ricaricano solo i dati, senza rifare la sottoscrizione all'autenticazione
  // (prima ogni cambio la rifaceva e i dati venivano caricati due volte).
  const reloadRef=useRef(reload), reloadHomesRef=useRef(reloadHomes), firstHome=useRef(true);
  reloadRef.current=reload; reloadHomesRef.current=reloadHomes;
  useEffect(()=>{
    if(firstHome.current){firstHome.current=false;return;}
    if(!demo&&client&&user)reload();
  },[reload]);
  useEffect(()=>{
    if(!client||!activeHomeId){setHomeMembers([]);setFormerMembers([]);return;}
    let current=true;
    // Ex membri (v4.1): le attività assegnate a chi è uscito mostrano «Nome (ex membro)».
    client.from('home_former_members').select('user_id,display_name').eq('home_id',activeHomeId).then(({data,error})=>{if(current)setFormerMembers(error?[]:data||[]);});
    client.from('home_members').select('user_id,email,role').eq('home_id',activeHomeId).then(({data,error})=>{
      if(!current)return;
      if(error)notify(friendlyError(error,tr));else setHomeMembers(data||[]);
    });
    return ()=>{current=false;};
  },[client,activeHomeId,homes]);

  useEffect(()=>{
    if (demo) {
      try { const saved=localStorage.getItem('casainordine-demo-v1');setData(saved?JSON.parse(saved):fakeData()); }
      catch {setData(fakeData());}
      return;
    }
    client.auth.getSession().then(({data:{session}})=>{setUser(session?.user||null);setInitializing(false);if(session){reloadRef.current();reloadHomesRef.current();}});
    const {data:{subscription}} = client.auth.onAuthStateChange((event,session)=>{
      // Dopo un'uscita (anche per sessione scaduta) si ricarica la pagina: nello stato React
      // restano altrimenti chiave d'integrazione, testi incollati e moduli dell'account precedente.
      if(event==='SIGNED_OUT'){window.location.replace('/');return;}
      // Ritorno dal link 'Password dimenticata?': si chiede subito la nuova password.
      if(event==='PASSWORD_RECOVERY')setRecovery(true);
      // Accesso con una password più corta della regola attuale: si chiede di sceglierne una nuova.
      else if(session&&needsPasswordUpgrade(sessionStorage,session.user?.email))setRecovery('upgrade');
      setUser(session?.user||null);
      // Il rinnovo del token (circa ogni ora) non richiede di ricaricare tutto. INITIAL_SESSION arriva
      // all'apertura con la stessa sessione di getSession() qui sopra, che ha già caricato i dati:
      // prima a ogni apertura tutto si scaricava due volte (scripts/prove-telefono-lento.mjs).
      if(session) {if(event!=='TOKEN_REFRESHED'&&event!=='INITIAL_SESSION')setTimeout(()=>{reloadRef.current();reloadHomesRef.current();},0);} else {setHomes([]);setActiveHomeId(null);setData({bills:[],utilities:[],tasks:[],suppliers:[],summaries:[],profile:null,reminders:[]});}
    });
    return ()=>subscription.unsubscribe();
  },[demo,client]);

  // Finestre: il focus entra nella finestra all'apertura e torna dov'era alla chiusura; Esc chiude.
  // Una bolletta letta da un documento non si chiude con Esc o col tocco sullo sfondo: si perderebbe
  // quanto estratto; resta il pulsante di chiusura.
  const dialogRef=useRef(null), dialogState=useRef({});
  dialogState.current={capture:Boolean(capture),ratePlan:Boolean(ratePlan),documentBill:form.source==='document'};
  // Quale finestra è aperta: passando da una all'altra (scelta del documento → bolletta) il fuoco segue la nuova.
  const dialogOpen=capture?'capture':ratePlan?'rates':modal||'';
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
    const onKey=e=>{if(e.key!=='Escape')return;if(dialogState.current.capture)setCapture(null);else if(dialogState.current.ratePlan)setRatePlan(null);else if(!dialogState.current.documentBill)setModal(null);};
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
  // Due persone nella stessa casa (scripts/prove-due-persone.mjs): l'altra può aver già cambiato o
  // eliminato la voce mentre questa pagina mostrava i dati vecchi. guard: condizione sul valore che
  // la pagina vedeva (per esempio «ancora da pagare»). Se nessuna riga cambia lo si dice e si
  // ricaricano i dati, invece di confermare un'operazione che non è avvenuta o di sovrascrivere.
  async function updateRow(table,id,patch,key=table,guard=q=>q) {
    if(!canWrite){notify(tr('v32.feedback.1'));return false;}
    if (demo) {localUpdate(key,rows=>rows.map(x=>x.id===id?{...x,...patch}:x));return true;}
    const {data,error} = await guard(client.from(table).update(patch).eq('id',id)).select('id');
    if(error) {notify(friendlyError(error,tr));return false;}
    await reload();
    if(!data?.length){notify(tr('v32.flow.changedByOther'));return false;}
    return true;
  }
  async function deleteRow(table,id,key=table) {
    if(!canWrite){notify(tr('v32.feedback.1'));return;}
    if (!(await askConfirm(tr('v32.flow.deleteConfirm'),{danger:true}))) return;
    if(demo){localUpdate(key,rows=>rows.filter(x=>x.id!==id));notify(tr('v32.feedback.2'));return;}
    const {data,error}=await client.from(table).delete().eq('id',id).select('id');
    if(error)notify(friendlyError(error,tr));else{await reload();notify(tr(data?.length?'v32.feedback.2':'v32.flow.changedByOther'));}
  }
  // Bollette con il file originale nell'archivio (home_documents.bill_id): pulsante per riscaricarlo.
  async function loadBillFiles(){
    if(demo||!user||!client)return;
    const {data:rows,error}=await selectAll(count=>client.from('home_documents').select('id,bill_id,name,storage_path,mime_type,created_at',count?{count:'exact'}:undefined).not('bill_id','is',null).order('created_at',{ascending:true}).order('id',{ascending:true}));
    if(error)return;
    const map=new Map();for(const d of rows||[])map.set(d.bill_id,d);
    setBillFiles(map);
  }
  // Solo quando si apre «Bollette», dopo il caricamento dei dati: una lettura in più all'avvio non serve.
  const billsOpen=tab==='bills';
  useEffect(()=>{if(billsOpen&&dataLoaded)loadBillFiles();},[billsOpen,dataLoaded,demo,user?.id,activeHomeId,data.bills.length]); // eslint-disable-line react-hooks/exhaustive-deps
  async function downloadBillFile(bill){
    const doc=billFiles.get(bill.id);if(!doc)return;
    try{const {downloadStoredFile}=await import('../lib/file-download.js');await downloadStoredFile(client,{path:doc.storage_path,name:doc.name,type:doc.mime_type});}
    catch(err){notify(tr('extra.archive.unavailable',{error:friendlyError(err,tr)}));}
  }
  async function saveBill(e) {
    e.preventDefault();if(!canWrite)return notify(tr('v32.feedback.3'));
    if(form.source==='document'&&['ricevuta','sollecito','nota_credito'].includes(form.import_document_type)){
      const label=form.import_document_type==='ricevuta'?tr('v32.flow.receiptLabel'):form.import_document_type==='nota_credito'?tr('v32.flow.creditNoteLabel'):tr('v32.flow.reminderLabel');
      if(!(await askConfirm(tr('v32.flow.documentConfirm',{kind:label}))))return;
    }
    setBusy(true);
    const amount=Number(form.amount);
    if(!Number.isFinite(amount)||amount<0||!normalizeDate(form.due_date)){notify(tr('v32.feedback.4'));setBusy(false);return;}
    const item={title:form.title.trim(),supplier:form.supplier.trim(),category:form.category,amount,due_date:form.due_date,paid_at:form.paid?new Date().toISOString():null,is_estimate:false,source:form.source==='document'?'document':'manual',...(form.source==='document'&&form.external_id?{external_id:form.external_id}:{})};
    if(item.source==='document'){
      // Periodo e consumo letti dal documento (e controllati nel modulo): solo se coerenti, come chiede il database.
      const start=normalizeDate(form.period_start),end=normalizeDate(form.period_end),value=Number(form.consumption_value);
      if(start&&end&&start<=end)Object.assign(item,{period_start:start,period_end:end});
      if(form.consumption_value!==''&&Number.isFinite(value)&&value>=0&&['kWh','Smc','m³'].includes(form.consumption_unit))Object.assign(item,{consumption_value:value,consumption_unit:form.consumption_unit});
    }
    if(item.source==='document' && data.bills.some(b=>b.source==='document'&&b.external_id===item.external_id)){notify(tr('v32.feedback.5'));setBusy(false);return;}
    let savedBillId=null;
    if(demo)localUpdate('bills',x=>[...x,{...item,id:uuid()}]);
    else {const {data:created,error}=await client.from('bills').insert({...item,user_id:user.id,home_id:activeHomeId}).select('id').single(); if(error){notify(error.code==='23505'?tr('v32.payment.duplicate'):friendlyError(error,tr));setBusy(false);return;}savedBillId=created.id;await reload();}
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
        const {billFraudSignals}=await import('../lib/v20-core.mjs');
        const flags=billFraudSignals({...item,id:savedBillId},data.bills,{sender:form.mailSender||'',senderAuth:form.mailSenderAuth||'unknown',ibanFingerprint:ibanHash,historicalIbanFingerprints:trusted}).flags;
        const {error:riskError}=await client.from('bill_security_reviews').insert({user_id:user.id,home_id:activeHomeId,bill_id:savedBillId,iban_fingerprint:ibanHash,iban_suffix:form.ibanCandidate.slice(-4),sender:form.mailSender||'',sender_auth:form.mailSenderAuth||'unknown',risk_flags:flags,review_status:'pending'});
        if(riskError)throw riskError;
        if(flags.length)postSaveWarning=tr('v32.payment.fraudReview');
      }catch(err){postSaveWarning=tr('v32.payment.ibanFailure',{error:friendlyError(err,tr)});}
    }
    // File originale nell'archivio, collegato alla bolletta: si riscarica dalla riga della bolletta.
    if(item.source==='document'&&!demo)saveKeepFilePreference(form.keep_file!==false);
    if(savedBillId&&item.source==='document'&&form.keep_file!==false&&documentFile?.file&&documentFile.external_id===item.external_id){
      try{
        const {uploadHouseDocument}=await import('../lib/document-upload.mjs');
        await uploadHouseDocument(client,{file:documentFile.file,userId:user.id,homeId:activeHomeId||null,docType:'bolletta',notes:item.title,billId:savedBillId});
        await loadBillFiles();
      }catch(err){postSaveWarning=[postSaveWarning,tr('bill.fileNotKept',{error:friendlyError(err,tr)})].filter(Boolean).join(' ');}
    }
    if(item.source==='document')setDocumentFile(null);
    if(form.mail_doc_id && !demo){
      try {const {data:{session}}=await client.auth.getSession();const response=await fetch('/api/mail/documents',{method:'PATCH',headers:{Authorization:`Bearer ${session?.access_token||''}`,'Content-Type':'application/json'},body:JSON.stringify({id:form.mail_doc_id,action:'imported',bill_id:savedBillId})});const outcome=await response.json().catch(()=>({}));if(!response.ok)throw shownError(apiErrorText(outcome,tr,'import.mailArchiveFailed'));const warning=apiText(outcome.warning,tr);if(warning)postSaveWarning=[postSaveWarning,warning].filter(Boolean).join(' · ');setMailRefresh(x=>x+1);}catch(error){postSaveWarning=tr('import.mailStillPending',{detail:friendlyError(error,tr)});}
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
      if(error){notify(friendlyError(error,tr));setBusy(false);return;}
      const {error:billError}=await client.from('bills').insert({...initialBill,utility_id:created.id,user_id:user.id,home_id:activeHomeId});
      if(billError){notify(tr('v32.flow.utilityPartial',{error:billError.message}));}
      else if(following){await client.from('utilities').update({next_due_date:following}).eq('id',created.id);}
      await reload();
    }
    setModal(null);setBusy(false);notify(tr('v32.feedback.7'));
  }
  // Attività aggiunta da un'altra sezione (programma stagionale): titolo e scadenza già pronti.
  async function addTaskQuick({title,due_date}) {
    if(!canWrite){notify(tr('v32.feedback.3'));return false;}
    const item={title:String(title||'').trim().slice(0,200),due_date:due_date||null,done_at:null};
    if(!item.title)return false;
    if(demo){localUpdate('tasks',x=>[...x,{...item,id:uuid()}]);return true;}
    const {error}=await client.from('house_tasks').insert({...item,user_id:user.id,home_id:activeHomeId});
    if(error){notify(friendlyError(error,tr));return false;}
    await reload();return true;
  }
  async function saveTask(e) {
    e.preventDefault();if(!canWrite)return notify(tr('v32.feedback.3'));setBusy(true);
    const item={title:form.title.trim(),due_date:form.due_date||null,done_at:null,...(activeHomeId?{assigned_to:form.assigned_to||null}:{})};
    if(demo)localUpdate('tasks',x=>[...x,{...item,id:uuid()}]);
    else {const {error}=await client.from('house_tasks').insert({...item,user_id:user.id,home_id:activeHomeId});if(error){notify(friendlyError(error,tr));setBusy(false);return;}await reload();}
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
    else {const {error}=await client.from('user_suppliers').insert({...item,user_id:user.id});if(error){notify(friendlyError(error,tr));return;}await reload();}
    setSupplierForm({...supplierForm,name:'',sender_email:''});notify(tr('v32.feedback.12'));
  }
  async function prepareRatePlan(text,source,partial=false){
    const {parseRatePlanText}=await import('../lib/rate-plan.mjs');
    const result=parseRatePlanText(text,{unitFilter:rateUnit,t:tr});
    if(!result.rows.length){notify(tr('v32.flow.noRates'));return;}
    setRatePlan({rows:result.rows,warnings:[...result.warnings,...(partial?[tr('import.pdfTruncated')]:[])],source});
    notify(tr('v32.import.rateProposed',{count:result.rows.length}));
  }
  async function importBillFromText(){
    if(billPaste.trim().length<25){notify(tr('v32.feedback.13'));return;}
    if(billPaste.length>60000){notify(tr('v32.feedback.14'));return;}
    const {extractBillFields}=await import('../lib/document-import.mjs');
    const details=extractBillFields(billPaste);
    const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(billPaste));
    const fingerprint=Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,'0')).join('');
    if(data.bills.some(b=>b.source==='document'&&b.external_id===fingerprint)){notify(tr('v32.feedback.15'));return;}
    setForm({...billDefault,title:billTitle(tr,details),supplier:details.supplier,category:details.category,amount:details.amount??'',due_date:details.due_date||'',paid:false,source:'document',external_id:fingerprint,import_file:'Testo incollato',import_document_type:details.documentType,import_warnings:details.warnings.map(key=>tr(key)),ibanCandidate:details.ibanCandidate});
    setModal('bill');notify(tr('v32.feedback.16'));
  }
  async function rateFileImport(event){
    const file=event.target.files?.[0];event.target.value='';if(!file)return;
    setDocumentState({busy:true,message:tr('import.readingRatePlan')});
    try{const {readRatePlanDocument}=await import('../lib/document-reader.js');const result=await readRatePlanDocument(file,progress=>setDocumentState({busy:true,message:tr(progress.key,progress.params)}));prepareRatePlan(result.text,file.name,result.partial);}
    catch(e){notify(tr('v32.import.rateReadError',{detail:friendlyError(e,tr)}));}
    finally{setDocumentState({busy:false,message:''});}
  }
  async function saveRatePlan(){
    if(!canWrite)return notify(tr('v32.feedback.3'));
    const selected=ratePlan?.rows.filter(r=>r.selected)||[];
    if(!selected.length){notify(tr('v32.feedback.17'));return;}
    if(selected.length>120){notify(tr('v32.feedback.18'));return;}
    const supplier=rateSupplier.trim()||'Condominio';
    if(selected.some(r=>!r.title.trim()||!normalizeDate(r.due_date)||!Number.isFinite(Number(r.amount))||Number(r.amount)<=0)){notify(tr('v32.feedback.19'));return;}
    // Only rows that are identical in everything (title, date, amount) are duplicates.
    const unique=new Set(selected.map(r=>`${r.title.trim().toLowerCase()}:${r.due_date}:${Number(r.amount)}`));
    if(unique.size!==selected.length){notify(tr('v32.feedback.20'));return;}
    // A rate is identified by supplier + date + amount, plus its position among rates with the same
    // date and amount (e.g. 'Rata 1 ordinaria' and 'Rata 1 straordinaria'): both are saved, and
    // importing the same plan again stays idempotent.
    const {rateItemsWithKeys}=await import('../lib/rate-plan.mjs');
    const items=rateItemsWithKeys(selected,supplier);
    setBusy(true);
    try{
      const existing=new Set((data.bills||[]).filter(b=>b.source==='document'&&b.external_id?.startsWith('rate:')).map(b=>b.external_id));
      const todo=items.filter(b=>!existing.has(b.external_id));
      if(!todo.length){notify(tr('v32.feedback.21'));return;}
      if(demo)localUpdate('bills',rows=>[...rows,...todo.map(row=>({...row,id:uuid()}))]);
      else {const {error}=await client.from('bills').upsert(todo.map(item=>({...item,user_id:user.id,home_id:activeHomeId})),{onConflict:'user_id,source,external_id',ignoreDuplicates:true});if(error)throw error;await reload();}
      setRatePlan(null);notify(tr('v32.import.rateSaved',{count:todo.length}));
    }catch(e){notify(tr('v32.import.rateSaveError',{detail:friendlyError(e,tr)}));}
    finally{setBusy(false);}
  }
  async function updateSummaryPrefs(patch){
    if(demo){writeDemo({...data,profile:{...data.profile,...patch}});return;}
    const {error}=await client.from('profiles').update(patch).eq('id',user.id);
    if(error)notify(friendlyError(error,tr));else await reload();
  }
  // Solo se la bolletta è ancora com'era sullo schermo: se un altro membro l'ha già segnata pagata,
  // non si sovrascrive la sua data e si avvisa (niente doppio pagamento senza saperlo).
  async function pay(bill) {const ok=await updateRow('bills',bill.id,{paid_at:bill.paid_at?null:new Date().toISOString()},'bills',q=>bill.paid_at?q.not('paid_at','is',null):q.is('paid_at',null));if(ok)notify(bill.paid_at?tr('v32.payment.reopened'):tr('v32.payment.paid'));}
  async function toggleTask(t) {await updateRow('house_tasks',t.id,{done_at:t.done_at?null:new Date().toISOString()},'tasks',q=>t.done_at?q.not('done_at','is',null):q.is('done_at',null));}
  const categoryCode=value=>{const v=String(value||'').trim().toLowerCase();return categories.find(c=>c.toLowerCase()===v||tr('billCategory.'+c).toLowerCase()===v)||'Altro';};
  // Estratto conto: le uscite che corrispondono a una bolletta da pagare la segnano pagata, gli altri
  // pagamenti di bollette diventano bollette già pagate; il resto (spesa, carburante, prelievi) no.
  async function importBankStatement(bank,statement){
    const plan=bank.billPaymentsFromBank(statement,data.bills);
    if(!plan.paid.length&&!plan.added.length)throw shownError(tr(plan.already?'v32.import.bankAlready':'v32.import.bankNothing'));
    const line=(day,supplier,amount,what)=>`• ${formatDay(day,{day:'numeric',month:'short'})} · ${supplier} · ${money(amount)} — ${what}`;
    const list=[...plan.paid.map(p=>line(p.row.date,p.bill.supplier||p.bill.title,p.row.amount,tr('v32.import.bankMarkPaid'))),
      ...plan.added.map(b=>line(b.due_date,b.supplier,b.amount,tr('v32.import.bankAdd')))];
    const shown=list.slice(0,12).join('\n')+(list.length>12?'\n…':'')+(plan.already?'\n'+tr('v32.import.bankAlreadyCount',{count:plan.already}):'');
    if(!(await askConfirm(tr('v32.import.bankConfirm',{paid:plan.paid.length,added:plan.added.length,skipped:plan.skipped,list:shown}))))return;
    const added=plan.added.map(({description,...b})=>({...b,title:billTitle(tr,{category:b.category,supplier:b.supplier})}));
    if(demo){
      const paidAt=new Map(plan.paid.map(p=>[p.bill.id,`${p.row.date}T12:00:00.000Z`]));
      localUpdate('bills',x=>{const known=new Set(x.map(b=>b.external_id).filter(Boolean));
        return [...x.map(b=>paidAt.has(b.id)&&!b.paid_at?{...b,paid_at:paidAt.get(b.id)}:b),...added.filter(b=>!known.has(b.external_id)).map(b=>({...b,id:uuid()}))];});
    } else {
      for(const p of plan.paid){const {error}=await client.from('bills').update({paid_at:`${p.row.date}T12:00:00.000Z`}).eq('id',p.bill.id).is('paid_at',null);if(error)throw error;}
      if(added.length){const {error}=await client.from('bills').upsert(added.map(b=>({...b,user_id:user.id,home_id:activeHomeId})),{onConflict:'user_id,source,external_id',ignoreDuplicates:true});if(error)throw error;}
      await reload();
    }
    notify(tr('v32.import.bankSaved',{paid:plan.paid.length,added:added.length}));
  }
  async function csvImport(event) {
    if(!canWrite)return notify(tr('v32.feedback.3'));
    const file=event.target.files?.[0];if(!file)return;
    try {
      const [{parseBillsCsv},bank]=await Promise.all([import('../lib/csv.mjs'),import('../lib/bank-csv.mjs')]);
      // UTF-8 o Windows-1252 (CSV salvati da Excel e da molte banche): prima «Società» diventava «Soci�t�».
      const text=bank.decodeCsvBytes(await file.arrayBuffer());
      let parsed;
      try{parsed=parseBillsCsv(text);}
      catch(csvError){
        // Non è un elenco di bollette: forse è l'estratto conto della banca o di PayPal.
        const statement=csvError?.i18nKey==='csv.columnsRequired'?bank.parseBankStatement(text):null;
        if(!statement)throw csvError;
        await importBankStatement(bank,statement);return;
      }
      const errors=parsed.errors.map(e=>tr(e.key,e.params));
      // Categorie scritte nella lingua dell'app («Electricity», «Strom»…) → codice; il titolo mancante si propone.
      const bills=parsed.bills.map(b=>{const category=categoryCode(b.category);return {...b,category,title:b.title||billTitle(tr,{category,supplier:b.supplier})};});
      // shownError: il motivo (righe non valide) si mostra; con un Error semplice compariva l'errore generico.
      if(!bills.length) throw shownError(errors.slice(0,3).join(' · ') || tr('csv.noValidRows'));
      if(!(await askConfirm(tr('v32.import.csvConfirm',{count:bills.length,excluded:errors.length?tr('v32.import.csvExcluded',{count:errors.length}):''}))))return;
      if(demo)localUpdate('bills',x=>[...x,...bills.map(b=>({...b,id:uuid()}))]);
      else {const {error}=await client.from('bills').insert(bills.map(b=>({...b,user_id:user.id,home_id:activeHomeId})));if(error)throw error;await reload();}
      notify(tr('v32.import.csvSaved',{count:bills.length,ignored:errors.length?tr('v32.import.csvIgnored',{count:errors.length}):''}));
    } catch(e){notify(tr('v32.import.csvError',{detail:friendlyError(e,tr)}));}
    finally{event.target.value='';}
  }
  async function documentImport(event) {
    if(!canWrite)return notify(tr('v32.feedback.3'));
    const original=event.target.files?.[0];
    event.target.value='';
    if(!original||documentState.busy)return;
    // Le foto pesanti si riducono prima di leggerle (lib/image-prepare.js): il limite di 15 MB vale per i PDF.
    const photo=/^image\//i.test(original.type)||/\.(heic|heif|jpe?g|png|webp)$/i.test(original.name);
    if(original.size>(photo?60:15)*1024*1024){notify(tr(photo?'photo.tooLarge':'v32.feedback.22'));return;}
    setDocumentState({busy:true,message:tr('import.preparing')});
    try{
      const {readBillDocument,documentFingerprint}=await import('../lib/document-reader.js');
      // L'impronta è quella del file scelto, così lo stesso file si riconosce anche se va convertito.
      const fingerprint=await documentFingerprint(original);
      const already=data.bills.some(b=>b.source==='document'&&b.external_id===fingerprint);
      if(already){notify(tr('v32.feedback.23'));return;}
      if(!demo){
        const {data:existing,error}=await client.from('bills').select('id').eq('source','document').eq('external_id',fingerprint).maybeSingle();
        if(error)throw error;
        if(existing){notify(tr('v32.feedback.23'));return;}
      }
      const {preparePhoto}=await import('../lib/image-prepare.js');
      const file=(await preparePhoto(original,{onProgress:progress=>setDocumentState({busy:true,message:tr(progress.key,progress.params)})})).file;
      if(file.size>15*1024*1024){notify(tr('v32.feedback.22'));return;}
      const extracted=await readBillDocument(file,progress=>setDocumentState({busy:true,message:tr(progress.key,progress.params)}));
      // Acquisizione unica (Fase 2): si propone dove salvarlo; decide la persona (finestra «capture»).
      const {captureProposal}=await import('../lib/capture.mjs');
      const proposal=captureProposal(extracted.text,extracted,data.bills);
      setCapture({file,fingerprint,extracted,choice:demo?'bill':proposal.suggested,...proposal});
    }catch(error){notify(tr('v32.import.documentReadError',{detail:friendlyError(error,tr)}));}
    finally{setDocumentState({busy:false,message:''});}
  }
  // Dopo la scelta nella finestra dell'acquisizione unica: bolletta → modulo della bolletta;
  // ricevuta o prova d'acquisto → la sezione giusta, con i campi letti e il file da conservare.
  function continueCapture(){
    const c=capture;if(!c)return;setCapture(null);
    if(c.choice==='bill'){
      const extracted=c.extracted;
      setDocumentFile({file:c.file,external_id:c.fingerprint});
      setForm({...billDefault,...documentExtras(extracted),title:billTitle(tr,extracted),supplier:extracted.supplier,category:extracted.category,
        amount:extracted.amount??'',due_date:extracted.due_date||'',paid:false,keep_file:keepFilePreference(),
        source:'document',external_id:c.fingerprint,import_file:c.file.name,import_document_type:extracted.documentType,import_warnings:extracted.warnings.map(key=>tr(key)),ibanCandidate:extracted.ibanCandidate});
      setModal('bill');notify(tr('v32.feedback.24'));return;
    }
    setCaptureIntent({kind:c.choice,fields:c.choice==='receipt'?c.receipt:c.purchase,file:c.file});
    changePage(c.choice==='receipt'?'payments':'maintenance');
  }
  async function reviewEmailDocument(document, file){
    setDocumentState({busy:true,message:tr('import.readingEmailBill')});
    try{
      const {readBillDocument,documentFingerprint}=await import('../lib/document-reader.js');
      const fingerprint=await documentFingerprint(file);
      if(data.bills.some(b=>b.source==='document'&&b.external_id===fingerprint)){
        notify(tr('v32.feedback.25'));return;
      }
      const {data:existing,error}=await client.from('bills').select('id').eq('source','document').eq('external_id',fingerprint).maybeSingle();
      if(error)throw error;
      if(existing){notify(tr('v32.feedback.26'));return;}
      const extracted=await readBillDocument(file,progress=>setDocumentState({busy:true,message:tr(progress.key,progress.params)}));
      setDocumentFile({file,external_id:fingerprint});
      const suggested=document.suggestion||{};
      const supplier=extracted.supplier||suggested.supplier||suggested.learned_supplier_hint||'',category=extracted.category!=='Altro'?extracted.category:(suggested.category||'Altro');
      setForm({...billDefault,...documentExtras({...suggested,...Object.fromEntries(Object.entries(extracted).filter(([,v])=>v!==null&&v!==''))}),title:billTitle(tr,{category,supplier}),supplier,
        category,
        amount:extracted.amount??suggested.amount??'',due_date:extracted.due_date||suggested.due_date||'',
        paid:false,keep_file:keepFilePreference(),source:'document',external_id:fingerprint,mail_doc_id:document.id,import_file:file.name,
        import_document_type:extracted.documentType,ibanCandidate:extracted.ibanCandidate,mailSender:document.sender||'',mailSenderAuth:suggested.sender_auth==='reported_fail'?'fail':'unknown',import_warnings:[...(extracted.warnings||[]).map(key=>tr(key)),...(suggested.learned_supplier_hint?[tr(suggested.sender_match==='exact'?'import.senderHintExact':'import.senderHintDomain',{supplier:suggested.learned_supplier_hint})]:[]),...(suggested.sender_auth==='reported_fail'?[tr('import.senderAuthFailed')]:[])]});
      setModal('bill');notify(tr('v32.feedback.27'));
    }catch(e){notify(tr('v32.import.emailReadError',{detail:friendlyError(e,tr)}));}
    finally{setDocumentState({busy:false,message:''});}
  }
  async function authApi(method='GET') {
    const {data:{session}}=await client.auth.getSession();
    const response=await fetch('/api/integration-key',{method,headers:{Authorization:`Bearer ${session?.access_token||''}`}});
    const payload=await response.json().catch(()=>({}));if(!response.ok)throw shownError(apiErrorText(payload,tr));return payload;
  }
  async function loadIntegration() {if(demo)return;try{setIntegration(await authApi());}catch(e){notify(friendlyError(e,tr));}}
  async function generateToken() {try{const p=await authApi('POST');setNewToken(p.token);await loadIntegration();notify(tr('v32.feedback.28'));}catch(e){notify(friendlyError(e,tr));}}
  async function revokeToken() {if(!(await askConfirm(tr('v32.flow.revokeConfirm'),{danger:true})))return;try{await authApi('DELETE');setNewToken('');await loadIntegration();notify(tr('v32.feedback.29'));}catch(e){notify(friendlyError(e,tr));}}
  async function toggleEmails() {
    const enabled=!data.profile?.reminders_enabled;
    if(demo){writeDemo({...data,profile:{...data.profile,reminders_enabled:enabled}});return;}
    const {error}=await client.from('profiles').update({reminders_enabled:enabled}).eq('id',user.id);
    if(error)notify(friendlyError(error,tr));else await reload();
  }
  // Email dei promemoria: scelta personale, separata dai promemoria nell'app e dalle push.
  async function toggleReminderEmails() {
    const enabled=data.profile?.reminder_emails===false;
    if(demo){writeDemo({...data,profile:{...data.profile,reminder_emails:enabled}});return;}
    const {error}=await client.from('profiles').update({reminder_emails:enabled}).eq('id',user.id);
    if(error)notify(friendlyError(error,tr));else await reload();
  }
  async function toggleAutoPayment() {
    const enabled=!data.profile?.auto_confirm_payments;
    if(demo){writeDemo({...data,profile:{...data.profile,auto_confirm_payments:enabled}});return;}
    const {error}=await client.from('profiles').update({auto_confirm_payments:enabled}).eq('id',user.id);
    if(error)notify(friendlyError(error,tr));else await reload();
  }
  useEffect(()=>{if(tab==='connect'&&!demo&&user)loadIntegration();},[tab,user?.id]);
  useEffect(()=>{if('serviceWorker' in navigator&&location.protocol==='https:')navigator.serviceWorker.register('/sw.js').catch(()=>{});},[]);
  useEffect(()=>{if(new URLSearchParams(window.location.search).has('invite')||sessionStorage.getItem('pending_house_invite'))setTab('household');const mail=new URLSearchParams(window.location.search).get('mail');if(mail){setTab('connect');notify(mailStatusMessage(mail,tr));window.history.replaceState({},'',window.location.pathname);}},[]);

  const today=todayRome(), soon=addDaysISO(today,7);
  // Nella prova senza account i dati di esempio si mostrano nella lingua scelta; quelli salvati restano invariati.
  const shown=demo?localizeMainDemo(data,tr):data;
  const bills=shown.bills||[], utilities=shown.utilities||[],tasks=shown.tasks||[],suppliers=shown.suppliers||[];
  const open=bills.filter(b=>!b.paid_at), urgent=open.filter(b=>b.due_date<=soon);
  const currentMonth=today.slice(0,7), monthBills=bills.filter(b=>b.due_date.startsWith(currentMonth));
  const spent=monthBills.filter(b=>b.paid_at).reduce((a,b)=>a+Number(b.amount),0);
  const dueAmount=open.reduce((a,b)=>a+Number(b.amount),0);
  const overdue=open.filter(b=>b.due_date<today);
  // Elenco delle bollette con anni di storico (scripts/prove-molti-dati.mjs): prima 3000 righe in
  // ordine dalla più vecchia, 10 s per aprire l'elenco su un telefono lento e più di 1 s per lettera
  // nella ricerca. Ora: prima le bollette da pagare (dalla scadenza più vicina), poi le pagate dalla più
  // recente; 100 righe alla volta; filtro ricalcolato solo quando servono; ricerca «differita».
  const deferredSearch=useDeferredValue(search);
  const filteredBills=useMemo(()=>{
    const q=deferredSearch.trim();
    return bills.filter(b=>{
      if(q&&!textMatches(`${b.title} ${b.supplier} ${b.category} ${tr('billCategory.'+b.category)}`,q))return false;
      if(billFilter==='unpaid'&&b.paid_at)return false;
      if(billFilter==='paid'&&!b.paid_at)return false;
      if(billFilter==='soon'&&!!b.paid_at)return false;
      if(billFilter==='soon'&&b.due_date>soon)return false;
      return true;
    }).sort((a,b)=>Boolean(a.paid_at)-Boolean(b.paid_at)||(a.paid_at?b.due_date.localeCompare(a.due_date):a.due_date.localeCompare(b.due_date)));
  },[bills,deferredSearch,billFilter,soon,tr]);
  const [billRows,setBillRows]=useState(BILL_PAGE);
  useEffect(()=>{setBillRows(BILL_PAGE);},[deferredSearch,billFilter,activeHomeId]);
  const visibleBills=filteredBills.slice(0,billRows);
  const recentMonths=Array.from({length:6},(_,i)=>{const d=new Date(`${today.slice(0,7)}-01T12:00:00Z`);d.setUTCMonth(d.getUTCMonth()-5+i);return d.toISOString().slice(0,7);});
  const monthly=recentMonths.map(m=>({label:new Date(`${m}-01T12:00:00Z`).toLocaleDateString(locale,{month:'short',timeZone:'UTC'}), total:bills.filter(b=>b.due_date.startsWith(m)).reduce((sum,b)=>sum+Number(b.amount),0)}));
  const maxMonthly=Math.max(...monthly.map(x=>x.total),1);
  // Nome nel saluto: quello del profilo; senza, dall'indirizzo email solo se sembra un nome
  // («mario.rossi82» → «Mario»; «info», «x7» o «casa.rossi» no). Prima «Buongiorno, mario.rossi82!».
  const displayName=(data.profile?.full_name||'').trim().split(/\s+/)[0]||nameFromEmail(user?.email);
  function openModal(type){if(!canWrite){notify(tr('v32.feedback.30'));return;}setForm({...({bill:billDefault,utility:utilityDefault,task:taskDefault}[type])});setModal(type);}
  function changePage(id){setTab(id);setMobile(false);setBellOpen(false);}
  // Menu in gruppi: quelli aperti si ricordano su questo dispositivo; il gruppo della pagina aperta
  // si apre da solo, anche quando ci si arriva da un pulsante della pagina.
  const [openGroups,setOpenGroups]=useState([]);
  function changeGroups(next){setOpenGroups(next);saveOpenGroups(localStorage,next);}
  useEffect(()=>{setOpenGroups(old=>withPageGroup(old.length?old:readOpenGroups(localStorage),tab));},[tab]);
  function navButton(id){const Icon=menuIcons[id]||House;return <button key={id} className={`nav-item ${tab===id?'active':''}`} aria-current={tab===id?'page':undefined} onClick={()=>changePage(id)}><Icon size={19}/><span>{tr('nav.'+id)}</span>{tab===id&&<span className="nav-active-indicator"/>}</button>;}
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
    {/* Primo tasto Tab: salta le voci del menu (WCAG 2.4.1). */}
    <a className="skip-link" href="#contenuto">{tr('ui.skipToContent')}</a>
    {mobile&&<button className="mobile-backdrop" onClick={()=>setMobile(false)} aria-label={tr('ui.closeMenu')}/>}
    <aside className={`sidebar ${mobile?'sidebar-show':''}`}>
      <div className="brand"><span className="brand-icon"><House size={22}/></span><b>Casa<span>inOrdine</span></b></div>
      <div className="sidebar-label">{activeHomeId?homeMembership?.homes?.name||tr('v32.overview.sharedHome').toUpperCase():tr('v32.overview.personalSpace').toUpperCase()}</div><nav className="nav" aria-label={tr('ui.mainMenu')}>{MENU_TOP.map(navButton)}{MENU_GROUPS.map(group=>{const open=openGroups.includes(group.id);return <div key={group.id} className="nav-group"><button type="button" className="nav-group-head" aria-expanded={open} aria-controls={`nav-group-${group.id}`} onClick={()=>changeGroups(toggleGroup(openGroups,group.id))}><span>{tr('nav.group.'+group.id)}</span><ChevronRight size={15} aria-hidden="true"/></button><div id={`nav-group-${group.id}`} className="nav-group-items" hidden={!open}>{group.items.map(navButton)}</div></div>;})}{MENU_BOTTOM.map(navButton)}</nav>
      <div className="sidebar-spacer"/><div className="sidebar-info"><div className="sidebar-info-icon"><Bell size={18}/></div><b>{tr('v32.shell.reminderTitle')}</b><p>{tr('v32.shell.reminderHelp')}</p></div>
      <div className="sidebar-profile"><span className="avatar"><UserRound size={18}/></span><div className="profile-copy"><b>{demo?tr('v32.overview.demoMode'):user?.email?.split('@')[0]}</b><small>{demo?tr('v32.overview.localData'):tr('v32.overview.privateSpace')}</small></div>{!demo&&<button title={tr('ui.signOut')} className="icon-button" onClick={signOut}><LogOut size={17}/></button>}</div>
    </aside>
    <main className="main">
      <header className="topbar"><button className="icon-button burger" onClick={()=>setMobile(true)} aria-label={tr('ui.openMenu')}><Menu size={23}/></button><div className="crumb"><span>{activeHomeId?homeMembership?.homes?.name||tr('v32.overview.sharedHome'):tr('v32.overview.personalSpace')}</span><ChevronRight size={15}/><b>{tr('nav.'+tab)}</b></div>
        <div className="topbar-right"><UniversalSearch client={client} userId={user?.id} homeId={activeHomeId} spaceName={activeHomeId?homeMembership?.homes?.name||tr('general.house'):tr('v32.overview.personalSpace')} demoData={demo?{bills:shown.bills,tasks:shown.tasks,utilities:shown.utilities}:null} localData={{bills:shown.bills,tasks:shown.tasks,utilities:shown.utilities}} onOpen={changePage}/><LanguageSelector id="topbar-language" className="topbar-language" label={false}/><select className="house-switch" aria-label={tr('ui.selectSpace')} value={activeHomeId||''} onChange={e=>switchHome(e.target.value||null)}><option value="">{tr('general.private')}</option>{homes.map(h=><option key={h.home_id} value={h.home_id}>{h.homes?.name||tr('general.house')}</option>)}</select><span className="today-label"><CalendarDays size={16}/> <TodayText iso={today}/></span><div className="bell-parent"><button className="icon-button bell-button" onClick={()=>setBellOpen(!bellOpen)} aria-label={tr('ui.reminders')}><Bell size={20}/>{data.reminders.length>0&&<span className="notification-dot"/>}</button>{bellOpen&&<div className="bell-popover"><b>{tr('v32.notifications.reminderHeading')}</b>{shown.reminders.length?shown.reminders.slice(0,6).map(r=><div className="bell-entry" key={r.id}><p><Bell size={14}/> <span><strong>{tr('v32.notifications.reminderQuestion')}</strong><span>{r.bills?.title||tr('v32.notifications.billFallback')} · {tr('v32.notifications.dueOn')} <DateText iso={r.bills?.due_date||r.reminder_date}/></span></span></p>{r.bills&&!r.bills.paid_at&&<button className="text-link" onClick={()=>{const b=bills.find(x=>x.id===r.bills.id);if(b)pay(b);setBellOpen(false);}}>{tr('v32.notifications.markPaid')} <Check size={13}/></button>}</div>):<p>{tr('v32.notifications.noReminders')}</p>}</div>}</div><span className="top-avatar"><UserRound size={18}/></span></div>
      </header>
      <div className="content" id="contenuto" tabIndex={-1}>
        {activeHomeId&&!canWrite&&<div className="informative"><ShieldCheck size={17}/><p>{tr('v32.shell.readOnly')}</p></div>}
        {demo&&<div className="demo-banner"><Info size={17}/><div><b>{tr('v32.batch.demoTitle')}</b> {tr('v32.batch.demoHelp')}</div><button onClick={()=>{localStorage.removeItem('casainordine-demo-v1');setData(fakeData());notify(tr('v32.batch.demoResetDone'));}} >{tr('v32.batch.demoReset')}</button></div>}
        {['insights','archive','properties','maintenance','contracts','payments','alerts'].includes(tab)&&<HomeExtra client={client} demo={demo} user={user} homeId={activeHomeId} canWrite={canWrite} bills={bills} utilities={utilities} tab={tab} onNotify={notify} onRefresh={reload} intent={captureIntent} onIntentUsed={()=>setCaptureIntent(null)}/>}
        {tab==='control'&&<Control client={client} demo={demo} user={user} homeId={activeHomeId} bills={bills} tasks={tasks} onOpen={changePage}/>}
        {tab==='rental'&&<Rental client={client} demo={demo} user={user} homeId={activeHomeId} canWrite={canWrite} onNotify={notify}/>}
        {tab==='replacement'&&<ReplacementFund client={client} demo={demo} user={user} homeId={activeHomeId} canWrite={canWrite} onNotify={notify}/>}
        {tab==='projects'&&<Projects client={client} demo={demo} user={user} homeId={activeHomeId} canWrite={canWrite} onNotify={notify}/>}
        {tab==='stock'&&<Stock client={client} demo={demo} user={user} homeId={activeHomeId} canWrite={canWrite} onNotify={notify}/>}
        {tab==='garden'&&<Garden client={client} demo={demo} user={user} homeId={activeHomeId} canWrite={canWrite} onNotify={notify}/>}
        {tab==='pets'&&<Pets client={client} demo={demo} user={user} homeId={activeHomeId} canWrite={canWrite} onNotify={notify}/>}
        {tab==='iddocs'&&<FamilyDocuments client={client} demo={demo} user={user} homeId={activeHomeId} canWrite={canWrite} onNotify={notify}/>}
        {tab==='installments'&&<Installments client={client} demo={demo} user={user} homeId={activeHomeId} canWrite={canWrite} onNotify={notify}/>}
        {tab==='taxes'&&<Taxes client={client} demo={demo} user={user} homeId={activeHomeId} canWrite={canWrite} onNotify={notify}/>}
        {tab==='health'&&<Health client={client} demo={demo} user={user} homeId={activeHomeId} canWrite={canWrite} onNotify={notify}/>}
        {tab==='seasonal'&&<Seasonal client={client} demo={demo} user={user} homeId={activeHomeId} canWrite={canWrite} onNotify={notify} onAddTask={addTaskQuick}/>}
        {tab==='professionals'&&<Professionals client={client} demo={demo} user={user} homeId={activeHomeId} canWrite={canWrite} onNotify={notify}/>}
        {tab==='automations'&&<Automations client={client} demo={demo} user={user} homeId={activeHomeId} canWrite={canWrite} bills={bills} onNotify={notify}/>}
        {['tags','sos','radar','simulator','passport','vacation','inventory','decisions','briefing'].includes(tab)&&<V21Hub client={client} user={user} homeId={activeHomeId} homeName={homeMembership?.homes?.name||''} canWrite={canWrite} demo={demo} bills={bills} tasks={tasks} tab={tab} onNotify={notify}/>}
        {['monitor','fraud','pagopa','history','moving','savings','offline'].includes(tab)&&<V20Hub client={client} user={user} homeId={activeHomeId} canWrite={canWrite} demo={demo} bills={bills} utilities={utilities} tab={tab} onNotify={notify} onRefresh={reload}/>}
        {tab==='dashboard'&&<PersonalizedHome client={client} demo={demo} user={user} homeId={activeHomeId} canWrite={canWrite} bills={bills} utilities={utilities} tasks={tasks} loaded={demo||dataLoaded} displayName={displayName} onNavigate={changePage} onNewBill={()=>openModal('bill')} onNewTask={()=>openModal('task')} onPay={pay} onToggleTask={toggleTask} onRefresh={reload} onNotify={notify}/>}
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
        {tab==='bills'&&<><div className="page-heading"><div><div className="eyebrow">{tr('bills.eyebrow')}</div><h1>{tr('bills.heading')}</h1><p>{tr('bills.help')}</p></div><div className="heading-actions"><label className="btn btn-soft upload-label"><FileImage size={17}/> {tr('bills.upload')}<input type="file" accept=".pdf,application/pdf,.jpg,.jpeg,image/jpeg,.png,image/png,.webp,image/webp,.heic,.heif,image/heic,image/heif" onChange={documentImport} disabled={documentState.busy} hidden/></label><button className="btn btn-primary" onClick={()=>openModal('bill')}><Plus size={18}/> {tr('bills.add')}</button></div></div>
          <section className="panel padded"><div className="table-controls"><div className="searchbox"><Search size={18} aria-hidden="true"/><input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder={tr('bills.search')} aria-label={tr('bills.search')}/></div><div className="filter-tabs">{[['all',tr('general.all')],['unpaid',tr('bills.filter.unpaid')],['soon',tr('bills.filter.soon')],['paid',tr('bills.filter.paid')]].map(([k,label])=><button key={k} onClick={()=>setBillFilter(k)} className={billFilter===k?'selected':''}>{label}</button>)}</div></div>
            {filteredBills.length?<div className="table-scroll"><table className="bills-table"><thead><tr><th>{tr('bills.column.bill')}</th><th>{tr('bills.column.due')}</th><th>{tr('bills.column.amount')}</th><th>{tr('bills.column.status')}</th><th>{tr('bills.column.actions')}</th></tr></thead><tbody>{visibleBills.map(b=><tr key={b.id}><td><div className="table-identity"><CategoryIcon value={b.category}/><div><b>{b.title}</b><small>{b.supplier||tr('billCategory.'+b.category)} {b.is_estimate?' · '+tr('bills.estimated'):''}</small></div></div></td><td><DateText iso={b.due_date}/></td><td className="amount-cell">{money(b.amount)}</td><td><Status bill={b}/></td><td><div className="actions"><button className={`action-btn ${b.paid_at?'muted-action':'pay-action'}`} title={b.paid_at?tr('demo.bill.reopen'):tr('demo.bill.markPaid')} onClick={()=>pay(b)}>{b.paid_at?<RefreshCcw size={16}/>:<Check size={17}/>}</button>{billFiles.has(b.id)&&<button className="action-btn muted-action" title={tr('bill.downloadFile',{name:billFiles.get(b.id).name})} aria-label={tr('bill.downloadFile',{name:billFiles.get(b.id).name})} onClick={()=>downloadBillFile(b)}><Download size={16}/></button>}<button className="action-btn muted-action" title={tr('ui.delete')} onClick={()=>deleteRow('bills',b.id)}><Trash2 size={16}/></button></div></td></tr>)}</tbody></table>{filteredBills.length>visibleBills.length&&<div className="bills-more"><button type="button" className="btn btn-soft" onClick={()=>setBillRows(n=>n+BILL_PAGE)}>{tr('bills.showMore',{count:Math.min(BILL_PAGE,filteredBills.length-visibleBills.length)})}</button><small className="muted">{tr('bills.shownOf',{shown:visibleBills.length,total:filteredBills.length})}</small></div>}</div>:<Empty icon={Filter} title={tr('bills.empty.title')} body={tr('bills.empty.help')} action={()=>openModal('bill')} button={tr('form.addBill')}/>}</section>
        </>}
        {tab==='utilities'&&<><div className="page-heading"><div><div className="eyebrow">{tr('utilities.eyebrow')}</div><h1>{tr('utilities.heading')}</h1><p>{tr('utilities.help')}</p></div><button className="btn btn-primary" onClick={()=>openModal('utility')}><Plus size={18}/> {tr('utilities.new')}</button></div>
          <section className="panel supplier-panel"><div className="panel-header"><div><h2>{tr('utilities.supplierHeading')}</h2><p>{tr('utilities.supplierHelp')}</p></div></div>
            <form className="supplier-form" onSubmit={addSupplier}><label>{tr('utilities.supplier')}<input required maxLength={120} placeholder={tr('utilities.supplierExample')} value={supplierForm.name} onChange={e=>setSupplierForm({...supplierForm,name:e.target.value})}/></label>
            <label>{tr('utilities.service')}<select value={supplierForm.category} onChange={e=>setSupplierForm({...supplierForm,category:e.target.value})}>{categories.map(cat=><option key={cat} value={cat}>{tr('billCategory.'+cat)}</option>)}</select></label>
            <label>{tr('utilities.sender')}<input type="email" placeholder={tr('utilities.senderPlaceholder')} value={supplierForm.sender_email} onChange={e=>setSupplierForm({...supplierForm,sender_email:e.target.value})}/></label><button className="btn btn-primary" type="submit"><Plus size={17}/> {tr('utilities.add')}</button></form>
            <div className="supplier-list">{suppliers.map(sp=><div className="supplier-row" key={sp.id}><span><b>{sp.name}</b><small>{tr('billCategory.'+sp.category)}{sp.sender_email?` · ${sp.sender_email}`:''}</small></span><button className="icon-button danger" title={tr('ui.deleteSupplier')} onClick={()=>deleteRow('user_suppliers',sp.id,'suppliers')}><Trash2 size={16}/></button></div>)}{!suppliers.length&&<p className="muted" style={{padding:'0 20px 16px'}}>{tr('utilities.noSuppliers')}</p>}</div>
            <p className="helper-text" style={{padding:'0 20px 18px'}}>{tr('utilities.supplierPrivacy')}</p>
          </section>
          {utilities.length?<div className="utility-grid">{utilities.map(u=><div className="utility-card" key={u.id}><div className="utility-card-head"><CategoryIcon value={u.category}/><span><Tag tone={u.active?'green':'neutral'}>{u.active?tr('utilities.active'):tr('utilities.paused')}</Tag></span></div><h3>{u.supplier}</h3><p>{tr('billCategory.'+u.category)} {u.account_reference&&`· ${u.account_reference}`}</p><div className="utility-detail"><span>{tr('utilities.estimated')}</span><strong>{money(u.estimated_amount)}</strong></div><div className="utility-detail"><span>{tr('utilities.frequency')}</span><strong>{frequencies.some(x=>x.value===u.frequency)?tr('billFrequency.'+u.frequency):'—'}</strong></div><div className="utility-detail"><span>{tr('utilities.next')}</span><strong><DateText iso={u.next_due_date}/></strong></div><div className="utility-footer"><button className="btn btn-soft" onClick={()=>updateRow('utilities',u.id,{active:!u.active})}>{u.active?tr('utilities.pause'):tr('utilities.resume')}</button><button className="icon-button danger" title={tr('ui.deleteUtility')} onClick={()=>deleteRow('utilities',u.id)}><Trash2 size={17}/></button></div></div>)}</div>:<div className="panel"><Empty icon={PlugZap} title={tr('ui.addFirstUtility')} body={tr('utilities.empty')} action={()=>openModal('utility')} button={tr('utilities.addUtility')}/></div>}
          <div className="informative"><Info size={19}/><p>{tr('utilities.disclaimer')}</p></div>
        </>}
        {tab==='tasks'&&<><div className="page-heading"><div><div className="eyebrow">{tr('tasks.eyebrow')}</div><h1>{tr('tasks.heading')}</h1><p>{tr('tasks.help')}</p></div><button className="btn btn-primary" onClick={()=>openModal('task')}><Plus size={18}/> {tr('home.widget.tasks.new')}</button></div><section className="panel tasks-panel">{tasks.length?tasks.slice().sort((a,b)=>(a.done_at?1:0)-(b.done_at?1:0)).map(t=><div className="task-row" key={t.id}><button className={`task-check ${t.done_at?'done':''}`} onClick={()=>toggleTask(t)} aria-label={tr('tasks.complete')}>{t.done_at&&<Check size={16}/>}</button><div className={`task-title ${t.done_at?'completed':''}`}><b>{t.title}</b><small>{t.due_date?<>{tr('tasks.due')} <DateText iso={t.due_date}/></>:tr('home.task.noDate')}{t.assigned_to?' · '+tr('tasks.assignedTo',{name:homeMembers.find(m=>m.user_id===t.assigned_to)?.email||memberName(t.assigned_to,{former:formerMembers,formerLabel:tr('family.formerMember')})}):''}</small></div>{t.done_at?<Tag tone="green">{tr('tasks.done')}</Tag>:t.due_date<today?<Tag tone="red">{tr('tasks.late')}</Tag>:<Tag>{tr('tasks.todo')}</Tag>}<button className="icon-button danger" onClick={()=>deleteRow('house_tasks',t.id,'tasks')} title={tr('ui.delete')}><Trash2 size={17}/></button></div>):<Empty icon={House} title={tr('tasks.empty.title')} body={tr('tasks.empty.help')} action={()=>openModal('task')} button={tr('home.widget.tasks.new')}/>}</section></>}
        {tab==='connect'&&<><div className="page-heading"><div><div className="eyebrow">{tr('connect.eyebrow')}</div><h1>{tr('connect.title')}</h1><p>{tr('connect.help')}</p></div></div>
          {!demo?<MailImporter client={client} notify={notify} onReview={reviewEmailDocument} onPaymentsChanged={reload} bills={bills} refresh={mailRefresh}/>:<section className="panel mail-panel"><h2>{tr('connect.demoMailTitle')}</h2><p>{tr('connect.demoMailHelp')}</p></section>}
          <div className="connect-grid"><section className="panel connect-card document-card"><span className="connect-icon"><FileImage size={25}/></span><Tag tone="green">{tr('connect.recommended')}</Tag><h2>{tr('connect.uploadTitle')}</h2><p>{tr('connect.uploadHelp')}</p><label className="btn btn-primary upload-label"><UploadCloud size={17}/> {documentState.busy?tr('connect.analyzing'):tr('connect.selectImage')}<input type="file" accept=".pdf,application/pdf,.jpg,.jpeg,image/jpeg,.png,image/png,.webp,image/webp,.heic,.heif,image/heic,image/heif" onChange={documentImport} disabled={documentState.busy} hidden/></label>{documentState.busy&&<div className="import-progress" role="status"><RefreshCcw size={15} className="spin"/>{documentState.message}</div>}<p className="document-privacy"><ShieldCheck size={16}/> {tr('connect.privacy')}</p></section>
          <section className="panel connect-card"><span className="connect-icon lilac"><RefreshCcw size={24}/></span><Tag tone="green">{tr('connect.scheduled')}</Tag><h2>{tr('connect.recurring')}</h2><p>{tr('connect.recurringHelp')}</p><button className="btn btn-soft" onClick={()=>openModal('utility')}><Plus size={17}/> {tr('connect.configureUtility')}</button></section></div>
          <details className="csv-secondary"><summary><FileText size={18}/> {tr('billPaste.title')}</summary><p>{tr('billPaste.help')}</p><textarea className="bill-paste" rows={5} value={billPaste} onChange={e=>setBillPaste(e.target.value)} placeholder={tr('billPaste.placeholder')}/><button className="btn btn-soft" onClick={importBillFromText}>{tr('billPaste.recognize')}</button></details>
          <section className="panel rate-import-panel"><div className="panel-header"><div><h2>{tr('rateImport.title')}</h2><p>{tr('rateImport.help')}</p></div></div>
            <div className="rate-import-controls"><label>{tr('rateImport.supplier')}<input maxLength={120} value={rateSupplier} onChange={e=>setRateSupplier(e.target.value)} placeholder={tr('rateImport.supplierPlaceholder')}/></label><label>{tr('rateImport.unit')}<input value={rateUnit} onChange={e=>setRateUnit(e.target.value)} placeholder={tr('rateImport.unitPlaceholder')}/></label></div>
            <div className="rate-import-controls"><label className="btn btn-primary upload-label"><FileImage size={16}/> {tr('rateImport.upload')}<input hidden type="file" accept=".pdf,application/pdf,.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp,.heic,.heif,image/heic,image/heif" onChange={rateFileImport} disabled={documentState.busy}/></label><span>{tr('rateImport.localPrivacy')}</span></div>
            <details className="rate-paste"><summary>{tr('rateImport.paste')}</summary><textarea rows={4} value={ratePaste} onChange={e=>setRatePaste(e.target.value)} placeholder={tr('rates.pastePlaceholder')}/><button className="btn btn-soft" onClick={()=>prepareRatePlan(ratePaste,tr('rateImport.pastedSource'))}>{tr('rateImport.recognize')}</button></details>
            {documentState.busy&&<p className="import-progress">{documentState.message}</p>}
          </section>
          <details className="csv-secondary"><summary><FileText size={18}/> {tr('connect.csvTitle')}</summary><p>{tr('connect.csvHelp')}</p><div className="csv-actions"><label className="btn btn-soft upload-label"><UploadCloud size={16}/> {tr('connect.csvSelect')}<input type="file" accept=".csv,text/csv" onChange={csvImport} hidden/></label><button className="text-link" onClick={()=>{const csv=tr('csv.templateHeader')+'\n'+tr('csv.templateRow')+'\n';const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=tr('csv.templateFile')+'.csv';a.click();URL.revokeObjectURL(url);}}><Download size={16}/> {tr('connect.csvExample')}</button></div></details>
          <section className="panel api-panel"><div className="api-head"><div className="connect-icon turquoise"><Link2 size={23}/></div><div><h2>{tr('connect.apiTitle')}</h2><p>{tr('connect.apiHelp')}</p></div><Tag tone={integration?.connected?'green':'neutral'}>{integration?.connected?tr('connect.keyActive'):tr('connect.optional')}</Tag></div>
          {demo?<div className="api-muted"><LockKeyhole size={17}/> {tr('connect.keyDemo')}</div>:<><div className="api-buttons"><button className="btn btn-primary" onClick={generateToken}>{integration?.connected?tr('connect.keyRegenerate'):tr('connect.keyGenerate')}</button>{integration?.connected&&<button className="btn btn-soft danger-text" onClick={revokeToken}>{tr('connect.keyRevoke')}</button>}</div>
            {newToken&&<div className="token-box"><label>{tr('connect.keyOnce')}</label><code>{newToken}</code><button className="btn btn-soft" onClick={()=>{navigator.clipboard.writeText(newToken);notify(tr('connect.keyCopied'));}}>{tr('connect.keyCopy')}</button></div>}
            <div className="endpoint-box"><small>{tr('connect.endpoint')}</small><code>{typeof window!=='undefined'?window.location.origin:''}/api/ingest</code><small>{tr('connect.method')}</small></div><details className="api-example"><summary>{tr('connect.example')}</summary><pre>{JSON.stringify({external_id:'2026-001',title:tr('billTitle.Luce'),supplier:'Energia Esempio',category:'Luce',amount:89.50,due_date:'2026-11-25',paid:false},null,2)}</pre></details>
          </>}
          <div className="api-footnote"><ShieldCheck size={18}/> {tr('connect.keyWarning')}</div></section>
          <div className="informative"><Info size={19}/><p>{tr('connect.gmailNotice')}</p></div>
        </>}
        {['household','budget','shopping','vehicles'].includes(tab)&&<><div className="page-heading"><div><div className="eyebrow">{tr('v32.batch.familyEyebrow')}</div><h1>{tr('nav.'+tab)}</h1><p>{activeHomeId?`${homeMembership?.homes?.name||tr('general.house')} · ${tr('v32.overview.familyRole'+(homeMembership?.role==='owner'?'Owner':homeMembership?.role==='editor'?'Editor':homeMembership?.role==='viewer'?'Viewer':'Member'))}`:tr('v32.batch.familyHelp')}</p></div></div>
          <HouseholdHub client={client} demo={demo} user={user} homes={homes} homeId={activeHomeId} role={homeMembership?.role} onChangeHome={switchHome} onHomesReload={async()=>{await reloadHomes();await reload();}} onNotify={notify} section={tab} bills={bills}/></>}
        {tab==='settings'&&<><div className="page-heading"><div><div className="eyebrow">{tr('settings.eyebrow')}</div><h1>{tr('nav.settings')}</h1><p>{tr('settings.help')}</p></div></div>{!demo&&user&&<SampleAccountSetup client={client} user={user} homes={homes} onNotify={notify} onCreated={async id=>{await reloadHomes();setActiveHomeId(id);setTab('dashboard');}}/>}<section className="panel settings-panel lang-settings"><div className="settings-heading"><span className="settings-icon"><Settings size={20}/></span><div><h2>{tr('settings.language')}</h2><p>{tr('settings.language.help')}</p></div></div><LanguageSelector label={false} id="settings-language"/><p className="muted">{tr('general.currencyNote')}</p></section><div className="settings-grid"><section className="panel settings-panel"><div className="settings-heading"><span className="settings-icon"><Bell size={20}/></span><div><h2>{tr('settings.reminders')}</h2><p>{tr('settings.remindersHelp')}</p></div></div><div className="setting-row"><div><b>{tr('settings.remindersEnabled')}</b><small>{tr('settings.remindersChannels')}</small></div><button className={`toggle ${data.profile?.reminders_enabled?'on':''}`} onClick={toggleEmails} aria-label={tr('settings.toggleReminders')} aria-pressed={!!data.profile?.reminders_enabled}><span/></button></div><div className="setting-row"><div><b>{tr('settings.reminderEmails')}</b><small>{tr('settings.reminderEmailsHelp')}</small></div><button className={`toggle ${data.profile?.reminders_enabled&&data.profile?.reminder_emails!==false?'on':''}`} onClick={toggleReminderEmails} disabled={!data.profile?.reminders_enabled} aria-label={tr('settings.toggleReminderEmails')} aria-pressed={!!data.profile?.reminders_enabled&&data.profile?.reminder_emails!==false}><span/></button></div><div className="setting-row"><div><b>{tr('settings.reminderAdvance')}</b><small>{tr('settings.unpaidNote')}</small></div><Tag tone="green">{tr('settings.threeDays')}</Tag></div><div className="summary-settings"><h3>{tr('settings.monthSummary')}</h3><p>{tr('settings.monthSummaryHelp')}</p>
            <label>{tr('settings.summaryFrequency')}<select value={data.profile?.summary_frequency||'off'} onChange={e=>updateSummaryPrefs({summary_frequency:e.target.value})}>{['off','daily','weekly','biweekly','monthly'].map(v=><option value={v} key={v}>{tr('settings.freq.'+v)}</option>)}</select></label>
            {['weekly','biweekly'].includes(data.profile?.summary_frequency)&&<label>{tr('settings.weekday')}<select value={data.profile?.summary_weekday??1} onChange={e=>updateSummaryPrefs({summary_weekday:Number(e.target.value)})}>{[0,1,2,3,4,5,6].map(i=><option key={i} value={i}>{weekdayLabel(i)}</option>)}</select></label>}
            {data.profile?.summary_frequency==='monthly'&&<label>{tr('settings.monthDay')}<input type="number" min="1" max="28" value={data.profile?.summary_month_day??1} onChange={e=>{const d=Number(e.target.value);if(d>=1&&d<=28)updateSummaryPrefs({summary_month_day:d});}}/></label>}
            <small>{tr('settings.summaryNote')}</small></div>
            {!demo&&<><PushSettings client={client} onNotify={notify}/><CalendarFeed client={client} onNotify={notify}/></>}<div className="summary-settings"><h3>{tr('settings.phoneCalendar')}</h3><p>{tr('settings.exportHelp')}</p><button className="btn btn-soft" onClick={()=>downloadCalendar(bills.filter(b=>!b.paid_at),activeHomeId?'scadenze-casa':'scadenze-personali',tr)}><CalendarDays size={16}/> {tr('settings.exportCalendar')}</button></div><div className="setting-row"><div><b>{tr('settings.autoPayment')}</b><small>{tr('settings.autoPaymentHelp')}</small></div><button className={`toggle ${data.profile?.auto_confirm_payments?'on':''}`} onClick={toggleAutoPayment} aria-label={tr('settings.autoPaymentToggle')} aria-pressed={!!data.profile?.auto_confirm_payments}><span/></button></div></section>
          <section className="panel settings-panel"><div className="settings-heading"><span className="settings-icon"><LockKeyhole size={20}/></span><div><h2>{tr('settings.privacyHeading')}</h2><p>{tr('settings.privacyHelp')}</p></div></div><div className="setting-row"><div><b>{tr('settings.account')}</b><small>{demo?tr('settings.demoLocal'):user?.email||tr('settings.personalAccount')}</small></div><ShieldCheck size={20} className="subtle-green"/></div><div className="setting-row"><div><b>{tr('settings.sharing')}</b><small>{tr('settings.sharingHelp')}</small></div><button className="btn btn-soft" onClick={()=>changePage('household')}>{tr('settings.manageHomes')}</button></div>{!demo&&<button className="btn btn-soft" onClick={signOut}><LogOut size={17}/> {tr('settings.signout')}</button>}</section></div>{!demo&&user&&<ConfigStatus client={client} onNotify={notify}/>}{!demo&&user&&<DeleteAccountPanel client={client} user={user} t={tr} onNotify={notify}/>}</>}
      </div>
    </main>
    {recovery&&<PasswordRecoveryDialog client={client} t={tr} reason={recovery==='upgrade'?'upgrade':'recovery'} onDone={message=>{clearPasswordUpgrade(sessionStorage);setRecovery(false);notify(message);}}/>}
    {capture&&<div className="modal-overlay"><div className="modal capture-modal" role="dialog" aria-modal="true" aria-labelledby="capture-title" tabIndex={-1} ref={dialogRef}>
      <div className="modal-head"><div><div className="eyebrow">{tr('nav.connect')}</div><h2 id="capture-title">{tr('capture.title')}</h2></div><button className="icon-button" onClick={()=>setCapture(null)} aria-label={tr('ui.close')}><X size={20}/></button></div>
      <div className="modal-form"><p className="muted">{tr('capture.intro',{file:capture.file.name})}</p>
        {[['bill',tr('capture.billHelp'),[capture.extracted.supplier,capture.extracted.amount!=null&&money(capture.extracted.amount),capture.extracted.due_date&&formatDay(capture.extracted.due_date)]],
          ['receipt',tr('capture.receiptHelp',{section:tr('nav.payments')}),[capture.receipt.amount!==''&&capture.receipt.amount!=null&&money(Number(capture.receipt.amount)),capture.receipt.paid_on&&formatDay(capture.receipt.paid_on),capture.receipt.reference]],
          ['purchase',tr('capture.purchaseHelp',{section:tr('nav.maintenance')}),[capture.purchase.name,capture.purchase.purchased_on&&formatDay(capture.purchase.purchased_on),capture.purchase.warranty_until&&tr('capture.warrantyUntil',{date:formatDay(capture.purchase.warranty_until)})]]
        ].map(([kind,help,facts])=><label key={kind} className={`capture-option${capture.choice===kind?' selected':''}`}><input type="radio" name="capture-kind" value={kind} checked={capture.choice===kind} disabled={demo&&kind!=='bill'} onChange={()=>setCapture({...capture,choice:kind})}/>
          <span><b>{tr('capture.'+kind)}{capture.suggested===kind&&<em> · {tr('capture.suggested')}</em>}</b><small>{help}</small>{(kind==='bill'||capture.suggested===kind)&&facts.filter(Boolean).length>0&&<small className="capture-facts">{facts.filter(Boolean).join(' · ')}</small>}</span></label>)}
        {demo&&<p className="helper-text">{tr('capture.demoOnly')}</p>}
        <div className="modal-actions"><button type="button" className="btn btn-soft" onClick={()=>setCapture(null)}>{tr('general.cancel')}</button><button type="button" className="btn btn-primary" onClick={continueCapture}>{tr('capture.continue')}</button></div>
      </div></div></div>}
    {ratePlan&&<div className="modal-overlay"><div className="modal rate-modal" role="dialog" aria-modal="true" aria-labelledby="rate-modal-title" tabIndex={-1} ref={dialogRef}><div className="modal-head"><div><div className="eyebrow">{tr('rates.eyebrow')}</div><h2 id="rate-modal-title">{tr('rates.count',{count:ratePlan.rows.length})}</h2></div><button className="icon-button" onClick={()=>setRatePlan(null)} aria-label={tr('ui.close')}><X size={20}/></button></div>
      <div className="rate-modal-body"><p>{tr('rates.source',{source:ratePlan.source})}</p>{ratePlan.warnings.map((w,i)=><p className="rate-warning" key={i}><AlertCircle size={15}/> {w}</p>)}
      <div className="table-scroll"><table className="bills-table"><thead><tr><th>{tr('rates.use')}</th><th>{tr('rates.description')}</th><th>{tr('rates.due')}</th><th>{tr('rates.amount')}</th></tr></thead><tbody>{ratePlan.rows.map((r,i)=><tr key={i}><td><input type="checkbox" checked={r.selected} onChange={e=>setRatePlan({...ratePlan,rows:ratePlan.rows.map((x,j)=>j===i?{...x,selected:e.target.checked}:x)})}/></td><td><input aria-label={tr('rates.itemDescription',{number:i+1})} value={r.title} onChange={e=>setRatePlan({...ratePlan,rows:ratePlan.rows.map((x,j)=>j===i?{...x,title:e.target.value}:x)})}/></td><td><input type="date" aria-label={tr('rates.itemDate',{number:i+1})} value={r.due_date} onChange={e=>setRatePlan({...ratePlan,rows:ratePlan.rows.map((x,j)=>j===i?{...x,due_date:e.target.value}:x)})}/></td><td><DecimalInput min="0.01" aria-label={tr('rates.itemAmount',{number:i+1})} value={r.amount} onChange={e=>setRatePlan({...ratePlan,rows:ratePlan.rows.map((x,j)=>j===i?{...x,amount:e.target.value}:x)})}/></td></tr>)}</tbody></table></div>
      <div className="modal-actions"><button className="btn btn-soft" onClick={()=>setRatePlan(null)}>{tr('general.cancel')}</button><button className="btn btn-primary" disabled={busy} onClick={saveRatePlan}>{busy?tr('form.saving'):tr('rates.saveSelected')} <Check size={16}/></button></div></div></div></div>}
    {modal&&<div className="modal-overlay" onMouseDown={e=>{if(e.target===e.currentTarget&&form.source!=='document')setModal(null);}}><div className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" tabIndex={-1} ref={dialogRef}><div className="modal-head"><div><div className="eyebrow">{tr(modal==='bill'?(form.source==='document'?'form.eyebrowDocument':'form.eyebrowBill'):modal==='utility'?'form.eyebrowUtility':'form.eyebrowTask')}</div><h2 id="modal-title">{tr(modal==='bill'?(form.source==='document'?'form.reviewBill':'form.addBill'):modal==='utility'?'form.connectUtility':'form.addTask')}</h2></div><button className="icon-button" onClick={()=>setModal(null)} aria-label={tr('ui.close')}><X size={21}/></button></div>
      <form onSubmit={modal==='bill'?saveBill:modal==='utility'?saveUtility:saveTask} className="modal-form">
        {modal==='bill'&&<>{form.source==='document'&&<div className="document-review"><div className="document-review-head"><FileText size={19}/><div><b>{tr('form.documentRead',{name:form.import_file})}</b><small>{tr('form.ocrHelp')}</small></div></div>{form.import_warnings?.length>0&&<ul>{form.import_warnings.map((warning,index)=><li key={index}>{warning}</li>)}</ul>}</div>}<label>{tr('form.description')} <input required maxLength={180} autoFocus value={form.title||''} onChange={e=>setForm({...form,title:e.target.value})} placeholder={tr('form.billPlaceholder')}/></label><label>{tr('form.supplier')} <input maxLength={120} value={form.supplier||''} onChange={e=>setForm({...form,supplier:e.target.value})} placeholder={tr('form.supplierPlaceholder')}/></label><div className="form-row"><label>{tr('form.category')} <select value={form.category} onChange={e=>setForm({...form,category:e.target.value})}>{categories.map(c=><option key={c} value={c}>{tr('billCategory.'+c)}</option>)}</select></label><label>{tr('form.amount')} <DecimalInput required min="0" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})} placeholder={new Intl.NumberFormat(locale,{minimumFractionDigits:2,maximumFractionDigits:2}).format(0)}/></label></div><label>{tr('form.dueDate')} <input type="date" required value={form.due_date} onChange={e=>setForm({...form,due_date:e.target.value})}/></label>{form.source==='document'&&<><div className="form-row"><label>{tr('extra.insights.periodFrom')} <input type="date" value={form.period_start||''} onChange={e=>setForm({...form,period_start:e.target.value})}/></label><label>{tr('extra.insights.periodTo')} <input type="date" value={form.period_end||''} onChange={e=>setForm({...form,period_end:e.target.value})}/></label></div><div className="form-row"><label>{tr('extra.backup.csv.consumption')} <DecimalInput decimals={3} min="0" value={form.consumption_value??''} onChange={e=>setForm({...form,consumption_value:e.target.value,consumption_unit:form.consumption_unit||(form.category==='Gas'?'Smc':form.category==='Acqua'?'m³':'kWh')})}/></label><label>{tr('form.consumptionUnit')} <select value={form.consumption_unit||''} onChange={e=>setForm({...form,consumption_unit:e.target.value})}><option value="">—</option>{['kWh','Smc','m³'].map(u=><option key={u} value={u}>{u}</option>)}</select></label></div>{(form.import_pod||form.import_pdr)&&<p className="muted"><small>{tr('form.supplyCode',{code:form.import_pod||form.import_pdr})}</small></p>}{!demo&&documentFile?.external_id===form.external_id&&<label className="checkbox-label"><input type="checkbox" checked={form.keep_file!==false} onChange={e=>setForm({...form,keep_file:e.target.checked})}/> {tr('bill.keepFile')}</label>}</>}<label className="checkbox-label"><input type="checkbox" checked={!!form.paid} onChange={e=>setForm({...form,paid:e.target.checked})}/> {tr('form.paid')}</label></>}
        {modal==='utility'&&<><label>{tr('form.supplierName')} <input autoFocus required maxLength={120} value={form.supplier||''} onChange={e=>setForm({...form,supplier:e.target.value})} placeholder={tr('form.internetPlaceholder')}/></label><div className="form-row"><label>{tr('form.category')}<select value={form.category} onChange={e=>setForm({...form,category:e.target.value})}>{categories.map(c=><option key={c} value={c}>{tr('billCategory.'+c)}</option>)}</select></label><label>{tr('form.estimatedAmount')}<DecimalInput required min="0" value={form.estimated_amount} onChange={e=>setForm({...form,estimated_amount:e.target.value})} placeholder={new Intl.NumberFormat(locale,{minimumFractionDigits:2,maximumFractionDigits:2}).format(0)}/></label></div><label>{tr('form.accountReference')}<input maxLength={120} value={form.account_reference||''} onChange={e=>setForm({...form,account_reference:e.target.value})} placeholder={tr('form.passwordWarning')}/></label><div className="form-row"><label>{tr('form.frequency')}<select value={form.frequency} onChange={e=>setForm({...form,frequency:e.target.value})}>{frequencies.map(f=><option key={f.value} value={f.value}>{tr('billFrequency.'+f.value)}</option>)}</select></label><label>{tr('form.firstDue')}<input type="date" required value={form.next_due_date} onChange={e=>setForm({...form,next_due_date:e.target.value})}/></label></div><p className="helper-text"><Info size={15}/> {tr('form.estimateHelp')}</p></>}
        {modal==='task'&&<><label>{tr('form.task')}<input autoFocus required maxLength={180} value={form.title||''} onChange={e=>setForm({...form,title:e.target.value})} placeholder={tr('form.taskPlaceholder')}/></label><label>{tr('form.taskDate')}<input type="date" value={form.due_date||''} onChange={e=>setForm({...form,due_date:e.target.value})}/></label>{activeHomeId&&<label>{tr('form.assignTo')}<select value={form.assigned_to||''} onChange={e=>setForm({...form,assigned_to:e.target.value})}><option value="">{tr('form.unassigned')}</option>{homeMembers.map(m=><option key={m.user_id} value={m.user_id}>{m.email}</option>)}</select></label>}</>}
        <div className="modal-actions"><button type="button" className="btn btn-soft" onClick={()=>setModal(null)}>{tr('general.cancel')}</button><button className="btn btn-primary" type="submit" disabled={busy}>{tr(busy?'form.saving':modal==='bill'?'form.confirmSave':modal==='utility'?'form.addUtility':'form.saveTask')}<Check size={17}/></button></div>
      </form></div></div>}
    <Toast message={toast} onClose={()=>setToast('')}/>
  </div>;
}
