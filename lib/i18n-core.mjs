// Casa in Ordine — parte leggera delle lingue: elenco delle lingue, scelta della lingua, formati di
// date e importi, sostituzione dei segnaposto. Non contiene i testi: così il browser non scarica
// il dizionario delle 6 lingue insieme (lib/i18n.mjs lo usa il server; il browser scarica solo la
// lingua scelta da lib/i18n-dicts/, generata da scripts/build-i18n.mjs).
export const LANGUAGES = Object.freeze([
 {code:'it',name:'Italiano',locale:'it-IT'},
 {code:'en',name:'English',locale:'en-GB'},
 {code:'es',name:'Español',locale:'es-ES'},
 {code:'fr',name:'Français',locale:'fr-FR'},
 {code:'de',name:'Deutsch',locale:'de-DE'},
 {code:'pt',name:'Português',locale:'pt-PT'}
]);
export const DEFAULT_LANGUAGE='it';
export const LANGUAGE_STORAGE_KEY='casainordine-language-v32';
export function languageStorageKey(accountId=null){
  return accountId?LANGUAGE_STORAGE_KEY+':user:'+accountId:LANGUAGE_STORAGE_KEY;
}
export const CODES=LANGUAGES.map(x=>x.code);
export function normalizeLanguage(value) {
 const raw=String(value||'').trim().toLowerCase().replace('_','-');
 const primary=raw.split('-')[0];
 return CODES.includes(primary)?primary:DEFAULT_LANGUAGE;
}
export function browserLanguage(value) {
 const raw=String(value||'').trim().toLowerCase();
 return CODES.includes(raw.split(/[-_]/)[0])?normalizeLanguage(raw):DEFAULT_LANGUAGE;
}
// Prima lingua supportata dell'intestazione Accept-Language (pagine generate dal server, come
// la condivisione della vacanza aperta da persone senza account). Altrimenti l'italiano.
export function acceptedLanguage(header) {
 const ranked=String(header||'').split(',').map((part,index)=>{
  const [tag,...params]=part.trim().split(';');
  const q=params.map(x=>x.trim()).find(x=>/^q\s*=/i.test(x));
  // HTTP quality weights are in [0, 1]. Invalid values must not outrank
  // a supported language or silently turn an excluded language back on.
  const value=q?Number(q.replace(/^q\s*=\s*/i,'')):1;
  const weight=Number.isFinite(value)&&value>=0&&value<=1?value:0;
  return {tag:tag.trim().toLowerCase(),weight,index};
 }).filter(x=>x.tag&&x.weight>0).sort((a,b)=>b.weight-a.weight||a.index-b.index);
 for(const {tag} of ranked){const primary=tag.split(/[-_]/)[0];if(CODES.includes(primary))return primary;}
 return DEFAULT_LANGUAGE;
}
export function localeFor(lang) {return LANGUAGES.find(x=>x.code===normalizeLanguage(lang))?.locale||'it-IT';}
// Segnaposto {nome}: se manca il valore resta il segnaposto, così si nota.
export function interpolate(str,params={}){
 return String(str).replace(/\{([a-z][a-zA-Z0-9]*)\}/g,(_,name)=>Object.hasOwn(params,name)&&params[name]!==undefined?String(params[name]):'{'+name+'}');
}
export function formatMoney(amount,lang='it',currency='EUR'){
 // Missing amounts must not be displayed as a real zero balance.
 if(typeof amount!=='number'&&typeof amount!=='string')return '—';
 if(typeof amount==='string'&&!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(amount.trim()))return '—';
 const n=Number(amount);
 if(!Number.isFinite(n))return '—';
 return new Intl.NumberFormat(localeFor(lang),{style:'currency',currency}).format(n);
}
export function formatDate(iso,lang='it',options={day:'numeric',month:'short',year:'numeric'}){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(String(iso||'')))return '—';
 const date=new Date(iso+'T12:00:00Z');
 if(Number.isNaN(date.getTime())||date.toISOString().slice(0,10)!==iso)return '—';
 return new Intl.DateTimeFormat(localeFor(lang),{...options,timeZone:'UTC'}).format(date);
}
