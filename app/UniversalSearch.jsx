'use client';
import {useEffect,useRef,useState} from 'react';
import dynamic from 'next/dynamic';
import {Search} from 'lucide-react';
import {useLanguage} from './LanguageProvider';

// Ricerca universale (Fase 2): pulsante nella barra in alto, Ctrl+K o «/» per aprirla.
// La finestra e la logica di ricerca si scaricano solo alla prima apertura (SearchDialog.jsx).
const SearchDialog=dynamic(()=>import('./SearchDialog'),{ssr:false});
export default function UniversalSearch(props){
 const {t}=useLanguage();
 const [open,setOpen]=useState(false);
 const trigger=useRef(null);
 useEffect(()=>{
  const onKey=e=>{
   const typing=/^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName||'')||e.target?.isContentEditable;
   if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();setOpen(value=>!value);}
   else if(e.key==='/'&&!typing&&!open){e.preventDefault();setOpen(true);}
  };
  document.addEventListener('keydown',onKey);
  return()=>document.removeEventListener('keydown',onKey);
 },[open]);
 const close=()=>{setOpen(false);trigger.current?.focus();};
 return <>
  <button ref={trigger} type="button" className="icon-button search-button" onClick={()=>setOpen(true)} aria-label={t('search.open')} title={t('search.open')+' (Ctrl K)'}><Search size={20}/></button>
  {open&&<SearchDialog {...props} onClose={close}/>}
 </>;
}
