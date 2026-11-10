// Caratteri ospitati dall'app (prima da Google Fonts: ogni pagina mandava l'indirizzo IP a Google).
import '@fontsource/dm-sans/400.css';
import '@fontsource/dm-sans/500.css';
import '@fontsource/dm-sans/600.css';
import '@fontsource/dm-sans/700.css';
import '@fontsource/dm-sans/800.css';
import '@fontsource/plus-jakarta-sans/400.css';
import '@fontsource/plus-jakarta-sans/500.css';
import '@fontsource/plus-jakarta-sans/600.css';
import '@fontsource/plus-jakarta-sans/700.css';
import '@fontsource/plus-jakarta-sans/800.css';
import './globals.css';
import {LanguageProvider} from './LanguageProvider';
export const metadata = { title: 'Casa in Ordine | Bollette e scadenze', description:'Organizza le spese di casa e ricevi promemoria prima delle scadenze.', applicationName:'Casa in Ordine', appleWebApp:{capable:true,title:'Casa in Ordine',statusBarStyle:'default'}, icons:{apple:'/icon-192.png'} };
export default function Layout({children}) {
  return <html lang="it"><body><LanguageProvider>{children}</LanguageProvider></body></html>;
}
