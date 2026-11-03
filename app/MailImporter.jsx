'use client';
import { useEffect, useState } from 'react';
import { Mail, RefreshCcw, Link2, Trash2, FileText, Eye, ShieldCheck, Info, AlertCircle, CheckCircle2 } from 'lucide-react';
import { IMAP_PROVIDERS, providerLabel } from '../lib/mail-providers.mjs';

async function mailRequest(client,path,method='GET',payload){
  const {data:{session}}=await client.auth.getSession();
  if(!session?.access_token)throw new Error('Sessione scaduta: accedi nuovamente.');
  const response=await fetch(`/api/mail/${path}`,{
    method,headers:{Authorization:`Bearer ${session.access_token}`,...(payload?{'Content-Type':'application/json'}:{})},
    ...(payload?{body:JSON.stringify(payload)}:{})
  });
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(result.error||'Operazione non riuscita.');
  return result;
}
const date = value => value?new Date(value).toLocaleDateString('it-IT',{day:'2-digit',month:'short',year:'numeric'}):'Mai';
export default function MailImporter({client,onReview,notify,refresh=0,onPaymentsChanged,bills=[]}){
  const [connections,setConnections]=useState([]),[documents,setDocuments]=useState([]),[payments,setPayments]=useState([]),[trustedSenders,setTrustedSenders]=useState([]),[billSenders,setBillSenders]=useState([]),[choices,setChoices]=useState({}),[trusted,setTrusted]=useState({}),[busy,setBusy]=useState(''),[loading,setLoading]=useState(true);
  const [imapProvider,setImapProvider]=useState('icloud'),[imapEmail,setImapEmail]=useState(''),[imapLogin,setImapLogin]=useState(''),[imapPassword,setImapPassword]=useState(''),[imapOpen,setImapOpen]=useState(false);
  async function load(){
    if(!client)return;
    try{
      const [c,d,p,s]=await Promise.all([mailRequest(client,'connections'),mailRequest(client,'documents'),mailRequest(client,'payments'),mailRequest(client,'senders')]);
      setConnections(c.connections||[]);setDocuments(d.documents||[]);setPayments(p.payments||[]);setTrustedSenders(p.trusted_senders||[]);setBillSenders(s.senders||[]);
    }catch(e){notify(e.message);}finally{setLoading(false);}
  }
  useEffect(()=>{load();},[client,refresh]);
  async function act(name,fn){setBusy(name);try{await fn();}catch(e){notify(e.message);}finally{setBusy('');}}
  const connect=provider=>act(`connect-${provider}`,async()=>{
    const {url}=await mailRequest(client,'start','POST',{provider});
    window.location.assign(url);
  });
  const connectImap=event=>{event.preventDefault();act('imap',async()=>{
    await mailRequest(client,'connections','POST',{provider:imapProvider,email:imapEmail,login:imapLogin,password:imapPassword});
    setImapPassword('');setImapEmail('');setImapLogin('');setImapOpen(false);
    notify('Casella IMAP collegata. Avvia il primo controllo delle bollette.');await load();
  });};
  const sync=c=>act(c.id,async()=>{
    const res=await mailRequest(client,'sync','POST',{id:c.id});
    notify(`${res.imported||0} documenti, ${res.payment_candidates||0} conferme di pagamento da verificare, ${res.payments_confirmed||0} pagamenti riconosciuti automaticamente.`);
    await load();
    await onPaymentsChanged?.();
  });
  const disconnect=c=>{
    if(!window.confirm(`Scollegare ${c.email_address}? La ricerca automatica verrà disattivata, ma i documenti già trovati resteranno disponibili finché non li elimini.`))return;
    act(c.id,async()=>{const result=await mailRequest(client,'connections','DELETE',{id:c.id});await load();notify(result.notice||'Casella scollegata.');});
  };
  const dismiss=d=>{
    if(!window.confirm('Eliminare questo documento senza importarlo?'))return;
    act(d.id,async()=>{await mailRequest(client,'documents','PATCH',{id:d.id,action:'dismissed'});await load();notify('Documento eliminato.');});
  };
  const paymentAction=(p,action)=>act(`payment-${p.id}`,async()=>{
    const payload={id:p.id,action};
    if(action==='confirm'){payload.bill_id=choices[p.id]||p.bill_id;payload.trust_sender=!!trusted[p.id];}
    const result=await mailRequest(client,'payments','PATCH',payload);
    await load();
    if(action==='confirm')await onPaymentsChanged?.();
    notify(result.warning||(action==='confirm'?'Pagamento confermato.':'Segnalazione scartata.'));
  });
  const revokeSender=entry=>act(`revoke-${entry.id}`,async()=>{
    await mailRequest(client,'payments','DELETE',{id:entry.id});
    await load();notify('Mittente rimosso dall’elenco autorizzato.');
  });
  const forgetBillSender=entry=>{
    if(!window.confirm(`Rimuovere ${entry.sender_email} dai mittenti delle bollette riconosciuti?`))return;
    act(`forget-${entry.id}`,async()=>{await mailRequest(client,'senders','DELETE',{id:entry.id});await load();notify('Mittente dimenticato.');});
  };
  const review=d=>act(d.id,async()=>{
    const {data,error}=await client.storage.from('mail-bills').download(d.storage_path);
    if(error||!data)throw new Error('Impossibile scaricare il documento privato.');
    const file=new File([data],d.filename,{type:d.mime_type});
    await onReview(d,file);
  });
  return <section className="panel mail-panel">
    <div className="mail-heading"><div className="connect-icon turquoise"><Mail size={24}/></div><div><h2>Importa automaticamente dalle email</h2><p>Ogni persona collega in autonomia una o più caselle Gmail, Microsoft oppure IMAP. L’app cerca PDF e immagini che sembrano bollette e ricorda i mittenti solo dopo la tua conferma.</p></div><span className="tag tag-green">Account separati</span></div>
    <div className="mail-privacy"><ShieldCheck size={18}/><span>Gli accessi Gmail e Microsoft usano OAuth. Gli altri provider usano IMAP protetto da TLS e una credenziale cifrata sul server: preferisci sempre una password specifica per app. Tutte le modalità possono tecnicamente leggere l’intera casella, anche se l’app cerca soltanto possibili bollette. Gli allegati candidati vengono eliminati dopo la verifica, lo scarto o 45 giorni.</span></div>
    {loading?<p>Caricamento caselle…</p>:<>
      {connections.length>0&&<div className="mail-accounts">{connections.map(c=><div className="mail-account" key={c.id}>
        <div><b><Mail size={16}/> {c.email_address} <span className="mail-provider-label">{providerLabel(c.provider)}</span></b><small>Ultimo controllo: {date(c.last_sync_at)} · {c.status==='active'?'Connessa':c.status==='reconnect'?'Da ricollegare':'Errore temporaneo'}</small>{c.last_error&&<small className="danger-text">{c.last_error}</small>}</div>
        <div className="mail-account-actions"><button className="btn btn-soft" disabled={!!busy||c.status==='reconnect'} onClick={()=>sync(c)}><RefreshCcw size={15}/> {busy===c.id?'Controllo…':'Cerca bollette'}</button><button className="icon-button danger" disabled={!!busy} onClick={()=>disconnect(c)} title="Scollega email"><Trash2 size={17}/></button></div>
      </div>)}</div>}
      <div className="mail-connect-options">
        <button className="btn btn-primary" onClick={()=>connect('gmail')} disabled={!!busy}><Link2 size={17}/>{busy==='connect-gmail'?'Apertura di Google…':'Collega Gmail'}</button>
        <button className="btn btn-soft" onClick={()=>connect('outlook')} disabled={!!busy}><Link2 size={17}/>{busy==='connect-outlook'?'Apertura di Microsoft…':'Outlook / Hotmail / Microsoft 365'}</button>
        <button className="btn btn-soft" onClick={()=>setImapOpen(v=>!v)} disabled={!!busy}><Mail size={17}/>{imapOpen?'Chiudi configurazione IMAP':'Altri servizi email (IMAP)'}</button>
      </div>
      {imapOpen&&<form className="mail-imap-form" onSubmit={connectImap}>
        <h3>Collega una casella IMAP</h3>
        <p>Seleziona il gestore: il server è preimpostato per sicurezza. Inserisci una password specifica per applicazioni dove disponibile; non inserire la password principale se il provider lo sconsiglia.</p>
        <label>Servizio email
          <select value={imapProvider} onChange={e=>setImapProvider(e.target.value)}>{Object.entries(IMAP_PROVIDERS).map(([id,p])=><option key={id} value={id}>{p.label}</option>)}</select>
        </label>
        <div className="mail-imap-fields"><label>Indirizzo email<input type="email" autoComplete="email" required value={imapEmail} onChange={e=>setImapEmail(e.target.value)} placeholder="tuoindirizzo@esempio.it"/></label>
        <label>Nome utente IMAP (facoltativo)<input autoComplete="username" value={imapLogin} onChange={e=>setImapLogin(e.target.value)} placeholder="Di solito coincide con l’email"/></label></div>
        <label>Password per app / credenziale IMAP<input type="password" minLength={4} autoComplete="new-password" required value={imapPassword} onChange={e=>setImapPassword(e.target.value)} placeholder="Mai pubblicata o mostrata agli altri utenti"/></label>
        <p className="mail-imap-tip"><Info size={15}/> Server: {IMAP_PROVIDERS[imapProvider].host}:993 (TLS). {IMAP_PROVIDERS[imapProvider].tip}</p>
        <button className="btn btn-primary" type="submit" disabled={!!busy}><Link2 size={16}/>{busy==='imap'?'Verifica e collegamento…':'Verifica e collega IMAP'}</button>
      </form>}
      <div className="mail-documents-head"><h3>Conferme di pagamento <span>{payments.length}</span></h3><p>Le email sono indizi, non prove bancarie: verifica mittente, importo e bolletta prima di confermare.</p></div>
      {payments.length ? <div className="mail-documents">{payments.map(p=><div className="mail-document payment-evidence" key={p.id}>
        <span className="mail-file-icon"><CheckCircle2 size={20}/></span>
        <div className="mail-document-info"><b>{p.subject||'Possibile pagamento ricevuto'}</b><small>{p.sender_email} · {date(p.received_at)}</small><small>Importo individuato: <strong>{Number(p.amount).toLocaleString('it-IT',{style:'currency',currency:'EUR'})}</strong></small>
          <label className="payment-match-label">Associa alla bolletta
            <select value={choices[p.id]??p.bill_id??''} onChange={e=>setChoices(v=>({...v,[p.id]:e.target.value}))}>
              <option value="">Seleziona una bolletta</option>{bills.filter(b=>!b.paid_at).map(b=><option key={b.id} value={b.id}>{b.supplier} · {b.title} · {Number(b.amount).toLocaleString('it-IT',{style:'currency',currency:'EUR'})} · {b.due_date}</option>)}
            </select>
          </label>
          <label className="payment-trust-label"><input type="checkbox" checked={!!trusted[p.id]} onChange={e=>setTrusted(v=>({...v,[p.id]:e.target.checked}))}/> Autorizza questo mittente per i prossimi pagamenti dello stesso fornitore</label>
        </div>
        <div className="mail-account-actions"><button className="btn btn-primary" disabled={!!busy||!(choices[p.id]||p.bill_id)} onClick={()=>paymentAction(p,'confirm')}><CheckCircle2 size={15}/> Conferma</button><button className="btn btn-soft" disabled={!!busy} onClick={()=>paymentAction(p,'dismiss')}>Scarta</button></div>
      </div>)}</div>:<div className="mail-empty"><Info size={19}/> Nessuna conferma di pagamento da verificare.</div>}
      {trustedSenders.length>0&&<div className="mail-documents-head"><h3>Mittenti autorizzati <span>{trustedSenders.length}</span></h3><p>Puoi revocare in qualsiasi momento l’automazione per un mittente.</p><div className="mail-accounts">{trustedSenders.map(t=><div className="mail-account" key={t.id}><div><b>{t.sender_email}</b><small>Fornitore: {t.supplier_key}</small></div><button disabled={!!busy} className="btn btn-soft" onClick={()=>revokeSender(t)}>Revoca</button></div>)}</div></div>}
      <div className="mail-documents-head"><h3>Mittenti delle bollette appresi <span>{billSenders.length}</span></h3><p>Elenco personale: nasce solo dalla conferma di una bolletta, non da una semplice email. Aiuta la ricerca successiva, ma non autorizza pagamenti né dimostra l'autenticità del messaggio.</p></div>
      {billSenders.length?<div className="mail-accounts">{billSenders.map(s=><div key={s.id} className="mail-account"><div><b>{s.sender_email}</b><small>Fornitore confermato: {s.supplier} · {s.auth_state==='reported_pass'?'DMARC: pass riportato dal provider':s.auth_state==='reported_fail'?'DMARC: esito negativo riportato':'Autenticazione non verificabile'} · {date(s.confirmed_at)}</small></div><button className="btn btn-soft" disabled={!!busy} onClick={()=>forgetBillSender(s)}>Dimentica</button></div>)}</div>:<div className="mail-empty"><Info size={18}/> I mittenti saranno appresi quando salverai una bolletta arrivata via email e confermerai il fornitore.</div>}
      <div className="mail-documents-head"><h3>Documenti trovati <span>{documents.length}</span></h3><p>Importo, fornitore e scadenza si confermano sempre prima di aggiungere una bolletta.</p></div>
      {documents.length? <div className="mail-documents">{documents.map(d=><div className="mail-document" key={d.id}>
        <span className="mail-file-icon"><FileText size={20}/></span><div className="mail-document-info"><b>{d.filename}</b><small>{d.subject||'Email senza oggetto'} · {date(d.received_at)}</small>{d.suggestion?.amount!==null&&d.suggestion?.amount!==undefined&&<small>Importo suggerito: {Number(d.suggestion.amount).toLocaleString('it-IT',{style:'currency',currency:'EUR'})} · Scadenza {d.suggestion.due_date||'da verificare'}</small>}</div>
        <div className="mail-account-actions"><button className="btn btn-soft" disabled={!!busy} onClick={()=>review(d)}><Eye size={16}/>{busy===d.id?'Lettura…':'Verifica'}</button><button className="icon-button danger" disabled={!!busy} title="Scarta documento" onClick={()=>dismiss(d)}><Trash2 size={17}/></button></div>
      </div>)}</div>:<div className="mail-empty"><Info size={19}/> Nessun documento in attesa. Collega una casella e avvia il primo controllo.</div>}
    </>}
    <p className="mail-note"><AlertCircle size={16}/> L’app riconosce possibili conferme dai messaggi recenti, ma non verifica movimenti bancari né l’autenticità del mittente. Controlla ogni segnalazione; l’autoconferma richiede un mittente da te autorizzato e l’opzione attiva nelle Impostazioni.</p>
  </section>;
}
