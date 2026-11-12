'use client';
import {createContext,useCallback,useContext,useEffect,useMemo,useRef,useState} from 'react';
import {db} from '../lib/supabase-browser';
import {browserLanguage,DEFAULT_LANGUAGE,formatDate,formatMoney,interpolate,LANGUAGES,localeFor,normalizeLanguage,languageStorageKey} from '../lib/i18n-core.mjs';
// Solo l'italiano arriva con l'app (serve per la prima pagina, che è in italiano); le altre lingue
// si scaricano quando servono, una alla volta (lib/i18n-dicts/, generati da scripts/build-i18n.mjs).
import italian from '../lib/i18n-dicts/it.json';

const dictionaries={it:italian};
function loadDictionary(lang){
 if(dictionaries[lang])return Promise.resolve(dictionaries[lang]);
 return import(`../lib/i18n-dicts/${lang}.json`).then(module=>(dictionaries[lang]=module.default||module));
}
// Finché la lingua scelta non è arrivata (pochi millisecondi, una volta sola) si usa l'italiano.
function translate(lang,key,params){
 return interpolate((dictionaries[lang]||italian)[key]??italian[key]??key,params);
}

function accountLanguage(userId){
 try{const saved=localStorage.getItem(languageStorageKey(userId));if(saved)return normalizeLanguage(saved);}catch{}
 return browserLanguage(typeof navigator!=='undefined'?(navigator.languages?.[0]||navigator.language):'it');
}
const LanguageContext=createContext(null);
function deviceLanguage(){
 if(typeof window==='undefined')return DEFAULT_LANGUAGE;
 try{
  const stored=localStorage.getItem(languageStorageKey());
  if(stored)return normalizeLanguage(stored);
 }catch{}
 return browserLanguage(navigator.languages?.[0]||navigator.language);
}
export function LanguageProvider({children}){
 const [language,setLanguageState]=useState(DEFAULT_LANGUAGE);
 const [accountId,setAccountId]=useState(null);
 const [saveError,setSaveError]=useState('');
 const authRequest=useRef(0);
 const selectionEpoch=useRef(0);
 const currentAccount=useRef(null);
 useEffect(()=>{
  setLanguageState(deviceLanguage());
  const client=db();
  if(!client)return;
  let active=true;
  const load=async(user)=>{
   const request=++authRequest.current;
   const epoch=selectionEpoch.current;
   const nextAccount=user?.id||null;
   if(currentAccount.current!==nextAccount){
    // Never display the previous account's language while the new preference is loading.
    setLanguageState(nextAccount?accountLanguage(nextAccount):deviceLanguage());
   }
   currentAccount.current=nextAccount;
   setAccountId(nextAccount);
   setSaveError('');
   if(!user){if(active&&request===authRequest.current&&selectionEpoch.current===epoch)setLanguageState(deviceLanguage());return;}
   const {data,error}=await client.from('user_language_preferences')
    .select('language').eq('user_id',user.id).maybeSingle();
   if(!active||request!==authRequest.current)return;
   if(error){if(selectionEpoch.current===epoch&&currentAccount.current===user.id)setSaveError(translate(accountLanguage(user.id),'settings.language.error'));return;}
   if(selectionEpoch.current!==epoch)return; // A deliberate selection wins over an older network read.
   if(data?.language)setLanguageState(normalizeLanguage(data.language));
   else setLanguageState(accountLanguage(user.id));
  };
  client.auth.getSession().then(({data})=>load(data?.session?.user||null)).catch(()=>{});
  const {data:{subscription}}=client.auth.onAuthStateChange((_event,session)=>{
   // Defer Supabase calls outside the auth-state callback to avoid locking the Auth client.
   setTimeout(()=>{if(active)load(session?.user||null);},0);
  });
  return()=>{active=false;authRequest.current++;subscription.unsubscribe();};
 },[]);
 const [,setLoaded]=useState(0);
 useEffect(()=>{
  if(typeof document!=='undefined')document.documentElement.lang=language;
  if(dictionaries[language])return;
  let active=true;
  loadDictionary(language).then(()=>{if(active)setLoaded(n=>n+1);}).catch(()=>{});
  return()=>{active=false;};
 },[language]);
 const setLanguage=useCallback(async(code)=>{
  const next=normalizeLanguage(code);
  const epoch=++selectionEpoch.current;
  const selectedAccount=accountId;
  setLanguageState(next);setSaveError('');
  try{localStorage.setItem(languageStorageKey(accountId),next);}catch{}
  if(!selectedAccount)return true;
  const client=db();
  if(!client){if(selectionEpoch.current===epoch&&currentAccount.current===selectedAccount)setSaveError(translate(next,'settings.language.error'));return false;}
  try{
   const {error}=await client.from('user_language_preferences').upsert({
    user_id:selectedAccount,language:next,updated_at:new Date().toISOString()
   },{onConflict:'user_id'});
   if(error)throw error;
   return true;
  }catch{
   if(selectionEpoch.current===epoch&&currentAccount.current===selectedAccount)setSaveError(translate(next,'settings.language.error'));
   return false;
  }
 },[accountId]);
 const ready=Boolean(dictionaries[language]);
 const value=useMemo(()=>({
  language,locale:localeFor(language),languages:LANGUAGES,
  t:(key,params)=>translate(language,key,params),
  money:(amount,currency='EUR')=>formatMoney(amount,language,currency),
  date:(iso,options)=>formatDate(iso,language,options),
  setLanguage,saveError
 }),[language,setLanguage,saveError,ready]);
 return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}
export function useLanguage(){
 const value=useContext(LanguageContext);
 if(!value)throw new Error('useLanguage must be used within LanguageProvider');
 return value;
}
export function LanguageSelector({className='',label=true,id='language-select'}){
 const {language,languages,t,setLanguage,saveError}=useLanguage();
 return <div className={'language-picker '+className}>
  {label&&<label htmlFor={id}>{t('settings.language')}</label>}
  <select id={id} value={language} onChange={e=>{void setLanguage(e.target.value);}} aria-label={t('settings.language')}>
   {languages.map(item=><option value={item.code} key={item.code}>{item.name}</option>)}
  </select>
  {saveError&&<small role="alert">{saveError}</small>}
 </div>;
}
