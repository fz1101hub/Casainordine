'use client';
import {useEffect} from 'react';
import {useLanguage} from './LanguageProvider';

// Titolo della scheda e descrizione della pagina nella lingua scelta (la pagina statica parte in italiano).
export function useLocalizedTitle(title,description){
 const {t}=useLanguage();
 useEffect(()=>{
  document.title=t(title);
  const meta=description&&document.querySelector('meta[name="description"]');
  if(meta)meta.setAttribute('content',t(description));
 },[t,title,description]);
}
export default function LocalizedTitle({title,description}){
 useLocalizedTitle(title,description);
 return null;
}
