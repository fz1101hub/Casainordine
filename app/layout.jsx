import './globals.css';
import {LanguageProvider} from './LanguageProvider';
export const metadata = { title: 'Casa in Ordine | Bollette e scadenze', description:'Organizza le spese di casa e ricevi promemoria prima delle scadenze.', applicationName:'Casa in Ordine', appleWebApp:{capable:true,title:'Casa in Ordine',statusBarStyle:'default'}, icons:{apple:'/icon-192.png'} };
export default function Layout({children}) {
  return <html lang="it"><body><LanguageProvider>{children}</LanguageProvider></body></html>;
}
