'use client';
import {useEffect,useMemo,useRef,useState} from 'react';
import {Search,X} from 'lucide-react';
import {useLanguage} from './LanguageProvider';
import {searchEverything,searchLocal,searchWords} from '../lib/search.mjs';

// Finestra della ricerca universale (Fase 2). Cerca solo nello spazio attivo; scegliere un
// risultato apre la sezione che lo contiene.
export default function SearchDialog({client,userId,homeId,spaceName,demoData,onOpen,onClose}){
 const {t,date}=useLanguage();
 const [text,setText]=useState(''),[state,setState]=useState({results:[],failed:0,busy:false});
 const input=useRef(null),sequence=useRef(0);
 // I dati della prova cambiano oggetto a ogni disegno della pagina: si leggono dal ref.
 const demoRef=useRef(demoData);demoRef.current=demoData;
 const isDemo=Boolean(demoData);
 useEffect(()=>{input.current?.focus();return()=>{sequence.current++;};},[]);
 // Cambiando spazio (personale o un'altra casa) i risultati vecchi non valgono più.
 useEffect(()=>{sequence.current++;setState({results:[],failed:0,busy:false});},[homeId,userId]);
 useEffect(()=>{
  const ticket=++sequence.current;
  if(!searchWords(text).length){setState({results:[],failed:0,busy:false});return;}
  if(isDemo){setState({...searchLocal(demoRef.current,text),busy:false});return;}
  setState(old=>({...old,busy:true}));
  const timer=setTimeout(()=>{
   searchEverything(client,{text,userId,homeId}).then(found=>{if(ticket===sequence.current)setState({...found,busy:false});})
    .catch(()=>{if(ticket===sequence.current)setState({results:[],failed:1,busy:false});});
  },250);
  return()=>clearTimeout(timer);
 },[text,client,userId,homeId,isDemo]);
 const groups=useMemo(()=>{
  const out=new Map();
  for(const item of state.results){if(!out.has(item.tab))out.set(item.tab,[]);out.get(item.tab).push(item);}
  return [...out];
 },[state.results]);
 const close=onClose;
 const choose=item=>{onOpen(item.tab);onClose();};
 const hasWords=searchWords(text).length>0;
 return <div className="modal-overlay search-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)close();}}>
   <div className="search-dialog" role="dialog" aria-modal="true" aria-label={t('search.title')} onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();close();}}}>
    <div className="search-field"><Search size={18}/><input ref={input} type="search" value={text} maxLength={80} onChange={e=>setText(e.target.value)} placeholder={t('search.placeholder')} aria-label={t('search.placeholder')}/><button type="button" className="icon-button" onClick={close} aria-label={t('ui.close')}><X size={18}/></button></div>
    <p className="search-scope">{t('search.scope',{space:spaceName})}{isDemo?' · '+t('search.demoNote'):''}</p>
    <div className="search-results" aria-live="polite">
     {!hasWords&&<p className="muted">{t('search.hint')}</p>}
     {hasWords&&state.busy&&<p className="muted">{t('search.loading')}</p>}
     {hasWords&&!state.busy&&!state.results.length&&<p className="muted">{t('search.empty')}</p>}
     {groups.map(([tab,items])=><section key={tab}><h3>{t('nav.'+tab)}</h3>{items.map(item=><button type="button" key={item.type+item.id} className="search-result" onClick={()=>choose(item)}>
      <b>{item.title||'—'}</b><small>{[item.detail,item.date&&date(item.date)].filter(Boolean).join(' · ')}</small></button>)}</section>)}
     {state.failed>0&&!state.busy&&<p className="muted">{t('search.partial')}</p>}
    </div>
   </div>
  </div>;
}
