'use client';
import { useEffect, useState } from 'react';
import { Mail, RefreshCcw, Link2, Trash2, FileText, Eye, ShieldCheck, Info, AlertCircle, CheckCircle2 } from 'lucide-react';
import { IMAP_PROVIDERS, providerLabel } from '../lib/mail-providers.mjs';
import {useLanguage} from './LanguageProvider';
import {safeMailApiMessage} from '../lib/mail-api-errors.mjs';

async function mailRequest(client,path,method='GET',payload,tr,language){
  const {data:{session}}=await client.auth.getSession();
  if(!session?.access_token)throw new Error(tr('mail.sessionExpired'));
  const response=await fetch(`/api/mail/${path}`,{
    method,headers:{Authorization:`Bearer ${session.access_token}`,...(payload?{'Content-Type':'application/json'}:{})},
    ...(payload?{body:JSON.stringify(payload)}:{})
  });
  const result=await response.json().catch(()=>({}));
  if(!response.ok){
    throw new Error(safeMailApiMessage(result.error,language)||tr('mail.operationFailed'));
  }
  return result;
}
export default function MailImporter({client,onReview,notify,refresh=0,onPaymentsChanged,bills=[]}){
  const {t:tr,money,locale,language}=useLanguage();
  const request=(path,method,payload)=>mailRequest(client,path,method,payload,tr,language);
  const date=value=>value?new Intl.DateTimeFormat(locale,{day:'2-digit',month:'short',year:'numeric'}).format(new Date(value)):tr('mail.never');
  const [connections,setConnections]=useState([]),[documents,setDocuments]=useState([]),[payments,setPayments]=useState([]),[trustedSenders,setTrustedSenders]=useState([]),[billSenders,setBillSenders]=useState([]),[choices,setChoices]=useState({}),[trusted,setTrusted]=useState({}),[busy,setBusy]=useState(''),[loading,setLoading]=useState(true);
  const [imapProvider,setImapProvider]=useState('icloud'),[imapEmail,setImapEmail]=useState(''),[imapLogin,setImapLogin]=useState(''),[imapPassword,setImapPassword]=useState(''),[imapOpen,setImapOpen]=useState(false);
  async function load(){
    if(!client)return;
    try{
      const [c,d,p,s]=await Promise.all([request('connections'),request('documents'),request('payments'),request('senders')]);
      setConnections(c.connections||[]);setDocuments(d.documents||[]);setPayments(p.payments||[]);setTrustedSenders(p.trusted_senders||[]);setBillSenders(s.senders||[]);
    }catch(e){notify(e.message);}finally{setLoading(false);}
  }
  useEffect(()=>{load();},[client,refresh]);
  async function act(name,fn){setBusy(name);try{await fn();}catch(e){notify(e.message);}finally{setBusy('');}}
  const connect=provider=>act(`connect-${provider}`,async()=>{
    const {url}=await request('start','POST',{provider});
    window.location.assign(url);
  });
  const connectImap=event=>{event.preventDefault();act('imap',async()=>{
    await request('connections','POST',{provider:imapProvider,email:imapEmail,login:imapLogin,password:imapPassword});
    setImapPassword('');setImapEmail('');setImapLogin('');setImapOpen(false);
    notify(tr('mail.imapConnected'));await load();
  });};
  const sync=c=>act(c.id,async()=>{
    const res=await request('sync','POST',{id:c.id});
    notify(tr('mail.receipts',{docs:res.imported||0,candidates:res.payment_candidates||0,confirmed:res.payments_confirmed||0}));
    await load();
    await onPaymentsChanged?.();
  });
  const disconnect=c=>{
    if(!window.confirm(tr('mail.disconnectConfirm',{email:c.email_address})))return;
    act(c.id,async()=>{const result=await request('connections','DELETE',{id:c.id});await load();notify(tr('mail.disconnectDone'));});
  };
  const dismiss=d=>{
    if(!window.confirm(tr('mail.dismissConfirm')))return;
    act(d.id,async()=>{await request('documents','PATCH',{id:d.id,action:'dismissed'});await load();notify(tr('mail.dismissed'));});
  };
  const paymentAction=(p,action)=>act(`payment-${p.id}`,async()=>{
    const payload={id:p.id,action};
    if(action==='confirm'){payload.bill_id=choices[p.id]||p.bill_id;payload.trust_sender=!!trusted[p.id];}
    const result=await request('payments','PATCH',payload);
    await load();
    if(action==='confirm')await onPaymentsChanged?.();
    notify(tr(action==='confirm'?'mail.confirmedPayment':'mail.rejectedPayment'));
  });
  const revokeSender=entry=>act(`revoke-${entry.id}`,async()=>{
    await request('payments','DELETE',{id:entry.id});
    await load();notify(tr('mail.senderRevoked'));
  });
  const forgetBillSender=entry=>{
    if(!window.confirm(tr('mail.senderForgetConfirm',{email:entry.sender_email})))return;
    act(`forget-${entry.id}`,async()=>{await request('senders','DELETE',{id:entry.id});await load();notify(tr('mail.senderForgotten'));});
  };
  const review=d=>act(d.id,async()=>{
    const {data,error}=await client.storage.from('mail-bills').download(d.storage_path);
    if(error||!data)throw new Error(tr('mail.downloadError'));
    const file=new File([data],d.filename,{type:d.mime_type});
    await onReview(d,file);
  });
  return <section className="panel mail-panel">
    <div className="mail-heading"><div className="connect-icon turquoise"><Mail size={24}/></div><div><h2>{tr('mail.title')}</h2><p>{tr('mail.intro')}</p></div><span className="tag tag-green">{tr('mail.separate')}</span></div>
    <div className="mail-privacy"><ShieldCheck size={18}/><span>{tr('mail.privacy')}</span></div>
    {loading?<p>{tr('mail.loading')}</p>:<>
      {connections.length>0&&<div className="mail-accounts">{connections.map(c=><div className="mail-account" key={c.id}>
        <div><b><Mail size={16}/> {c.email_address} <span className="mail-provider-label">{providerLabel(c.provider)}</span></b><small>{tr('mail.lastCheck',{date:date(c.last_sync_at)})} · {tr(c.status==='active'?'mail.connected':c.status==='reconnect'?'mail.reconnect':'mail.tempError')}</small>{c.last_error&&<small className="danger-text">{tr('mail.operationFailed')}</small>}</div>
        <div className="mail-account-actions"><button className="btn btn-soft" disabled={!!busy||c.status==='reconnect'} onClick={()=>sync(c)}><RefreshCcw size={15}/> {tr(busy===c.id?'mail.checking':'mail.check')}</button><button className="icon-button danger" disabled={!!busy} onClick={()=>disconnect(c)} title={tr('mail.disconnect')} aria-label={tr('mail.disconnect')}><Trash2 size={17}/></button></div>
      </div>)}</div>}
      <div className="mail-connect-options">
        <button className="btn btn-primary" onClick={()=>connect('gmail')} disabled={!!busy}><Link2 size={17}/>{tr(busy==='connect-gmail'?'mail.openGoogle':'mail.gmail')}</button>
        <button className="btn btn-soft" onClick={()=>connect('outlook')} disabled={!!busy}><Link2 size={17}/>{busy==='connect-outlook'?tr('mail.openMicrosoft'):'Outlook / Hotmail / Microsoft 365'}</button>
        <button className="btn btn-soft" onClick={()=>setImapOpen(v=>!v)} disabled={!!busy}><Mail size={17}/>{tr(imapOpen?'mail.closeImap':'mail.other')}</button>
      </div>
      {imapOpen&&<form className="mail-imap-form" onSubmit={connectImap}>
        <h3>{tr('mail.imapTitle')}</h3>
        <p>{tr('mail.imapHelp')}</p>
        <label>{tr('mail.emailService')}
          <select value={imapProvider} onChange={e=>setImapProvider(e.target.value)}>{Object.entries(IMAP_PROVIDERS).map(([id,p])=><option key={id} value={id}>{p.label}</option>)}</select>
        </label>
        <div className="mail-imap-fields"><label>{tr('mail.address')}<input type="email" autoComplete="email" required value={imapEmail} onChange={e=>setImapEmail(e.target.value)} placeholder="tuoindirizzo@esempio.it"/></label>
        <label>{tr('mail.login')}<input autoComplete="username" value={imapLogin} onChange={e=>setImapLogin(e.target.value)} placeholder={tr('mail.loginHint')}/></label></div>
        <label>{tr('mail.password')}<input type="password" minLength={4} autoComplete="new-password" required value={imapPassword} onChange={e=>setImapPassword(e.target.value)} placeholder={tr('mail.passwordHint')}/></label>
        <p className="mail-imap-tip"><Info size={15}/> Server: {IMAP_PROVIDERS[imapProvider].host}:993 (TLS). {IMAP_PROVIDERS[imapProvider].tip}</p>
        <button className="btn btn-primary" type="submit" disabled={!!busy}><Link2 size={16}/>{tr(busy==='imap'?'mail.verifying':'mail.verify')}</button>
      </form>}
      <div className="mail-documents-head"><h3>{tr('mail.paymentsTitle')} <span>{payments.length}</span></h3><p>{tr('mail.paymentsHelp')}</p></div>
      {payments.length ? <div className="mail-documents">{payments.map(p=><div className="mail-document payment-evidence" key={p.id}>
        <span className="mail-file-icon"><CheckCircle2 size={20}/></span>
        <div className="mail-document-info"><b>{p.subject||tr('mail.possiblePayment')}</b><small>{p.sender_email} · {date(p.received_at)}</small><small>{tr('mail.foundAmount')}: <strong>{money(Number(p.amount))}</strong></small>
          <label className="payment-match-label">{tr('mail.match')}
            <select value={choices[p.id]??p.bill_id??''} onChange={e=>setChoices(v=>({...v,[p.id]:e.target.value}))}>
              <option value="">{tr('mail.selectBill')}</option>{bills.filter(b=>!b.paid_at).map(b=><option key={b.id} value={b.id}>{b.supplier} · {b.title} · {money(Number(b.amount))} · {b.due_date}</option>)}
            </select>
          </label>
          <label className="payment-trust-label"><input type="checkbox" checked={!!trusted[p.id]} onChange={e=>setTrusted(v=>({...v,[p.id]:e.target.checked}))}/> {tr('mail.trust')}</label>
        </div>
        <div className="mail-account-actions"><button className="btn btn-primary" disabled={!!busy||!(choices[p.id]||p.bill_id)} onClick={()=>paymentAction(p,'confirm')}><CheckCircle2 size={15}/> {tr('mail.confirm')}</button><button className="btn btn-soft" disabled={!!busy} onClick={()=>paymentAction(p,'dismiss')}>{tr('mail.discard')}</button></div>
      </div>)}</div>:<div className="mail-empty"><Info size={19}/> {tr('mail.paymentsEmpty')}</div>}
      {trustedSenders.length>0&&<div className="mail-documents-head"><h3>{tr('mail.trusted')} <span>{trustedSenders.length}</span></h3><p>{tr('mail.trustedHelp')}</p><div className="mail-accounts">{trustedSenders.map(t=><div className="mail-account" key={t.id}><div><b>{t.sender_email}</b><small>{tr('mail.supplier')}: {t.supplier_key}</small></div><button disabled={!!busy} className="btn btn-soft" onClick={()=>revokeSender(t)}>{tr('calendar.revoke')}</button></div>)}</div></div>}
      <div className="mail-documents-head"><h3>{tr('mail.learned')} <span>{billSenders.length}</span></h3><p>{tr('mail.learnedHelp')}</p></div>
      {billSenders.length?<div className="mail-accounts">{billSenders.map(s=><div key={s.id} className="mail-account"><div><b>{s.sender_email}</b><small>{tr('mail.confirmedSupplier')}: {s.supplier} · {tr(s.auth_state==='reported_pass'?'mail.dmarcPass':s.auth_state==='reported_fail'?'mail.dmarcFail':'mail.notVerifiable')} · {date(s.confirmed_at)}</small></div><button className="btn btn-soft" disabled={!!busy} onClick={()=>forgetBillSender(s)}>{tr('mail.forget')}</button></div>)}</div>:<div className="mail-empty"><Info size={18}/> {tr('mail.sendersEmpty')}</div>}
      <div className="mail-documents-head"><h3>{tr('mail.documents')} <span>{documents.length}</span></h3><p>{tr('mail.documentsHelp')}</p></div>
      {documents.length? <div className="mail-documents">{documents.map(d=><div className="mail-document" key={d.id}>
        <span className="mail-file-icon"><FileText size={20}/></span><div className="mail-document-info"><b>{d.filename}</b><small>{d.subject||tr('mail.noSubject')} · {date(d.received_at)}</small>{d.suggestion?.amount!==null&&d.suggestion?.amount!==undefined&&<small>{tr('mail.suggested',{amount:money(Number(d.suggestion.amount)),date:d.suggestion.due_date||tr('mail.unknownDue')})}</small>}</div>
        <div className="mail-account-actions"><button className="btn btn-soft" disabled={!!busy} onClick={()=>review(d)}><Eye size={16}/>{tr(busy===d.id?'mail.reading':'mail.verifyDocument')}</button><button className="icon-button danger" disabled={!!busy} title={tr('mail.discardDocument')} aria-label={tr('mail.discardDocument')} onClick={()=>dismiss(d)}><Trash2 size={17}/></button></div>
      </div>)}</div>:<div className="mail-empty"><Info size={19}/> {tr('mail.documentsEmpty')}</div>}
    </>}
    <p className="mail-note"><AlertCircle size={16}/> {tr('mail.disclaimer')}</p>
  </section>;
}
