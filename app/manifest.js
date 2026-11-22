import {headers} from 'next/headers';
import {acceptedLanguage,localeFor,translate} from '../lib/i18n.mjs';

// Descrizione dell'app installata nella lingua del browser (testi nel dizionario, «meta.*»).
export default async function manifest(){
  const lang=acceptedLanguage((await headers()).get('accept-language'));
  return {
    name:'Casa in Ordine',short_name:'Casa in Ordine',description:translate(lang,'meta.appDescription'),
    start_url:'/',display:'standalone',background_color:'#f6f9f6',theme_color:'#155f53',lang:localeFor(lang),
    icons:[{src:'/icon-192.png',sizes:'192x192',type:'image/png',purpose:'any maskable'},
           {src:'/icon-512.png',sizes:'512x512',type:'image/png',purpose:'any maskable'}]
  };
}
