import { publicError } from './public-error.mjs';
// Closed allow-list: mailbox owners cannot make our server connect to arbitrary hosts.
// All IMAP connections require TLS with certificate validation on port 993.
export const IMAP_PROVIDERS = Object.freeze({
  icloud: {label:'Apple iCloud Mail',host:'imap.mail.me.com',tip:'Usa una password specifica per l’app. Il nome utente può essere la parte prima della @.'},
  yahoo: {label:'Yahoo Mail',host:'imap.mail.yahoo.com',tip:'Genera una password per applicazioni nelle impostazioni Yahoo.'},
  aol: {label:'AOL Mail',host:'imap.aol.com',tip:'Se disponibile, genera una password specifica per l’app.'},
  libero: {label:'Libero Mail',host:'imapmail.libero.it',tip:'La configurazione IMAP deve essere consentita dal tuo account.'},
  virgilio: {label:'Virgilio Mail',host:'in.virgilio.it',tip:'La configurazione IMAP deve essere consentita dal tuo account.'},
  tiscali: {label:'Tiscali Mail',host:'imap.tiscali.it',tip:'Verifica che IMAP sia abilitato.'},
  aruba: {label:'Aruba Mail (dominio)',host:'imaps.aruba.it',tip:'Usa l’indirizzo completo; per alcuni piani è necessario attivare IMAP.'},
  aruba_free: {label:'Aruba Mail gratuita',host:'imap.aruba.it',tip:'Usa l’indirizzo completo della casella.'},
  aruba_pec: {label:'Aruba PEC',host:'imaps.pec.aruba.it',tip:'Con la verifica in due passaggi usa una password per applicazioni.'},
  fastmail: {label:'Fastmail',host:'imap.fastmail.com',tip:'Richiede una password specifica per app e un piano che includa IMAP.'},
  zoho: {label:'Zoho Mail personale',host:'imap.zoho.com',tip:'Verifica il server effettivo indicato nel tuo account Zoho.'},
  zoho_business: {label:'Zoho Mail aziendale (US)',host:'imappro.zoho.com',tip:'Scegli la regione corrispondente al tuo data center.'},
  zoho_eu: {label:'Zoho Mail Europa',host:'imap.zoho.eu',tip:'Per account Zoho ospitati nel data center europeo.'},
  zoho_business_eu: {label:'Zoho Mail aziendale Europa',host:'imappro.zoho.eu',tip:'Per piani aziendali ospitati nel data center europeo.'},
  gmx: {label:'GMX.com',host:'imap.gmx.com',tip:'Abilita prima l’accesso IMAP nelle impostazioni GMX.'},
  gmx_de: {label:'GMX.de / GMX.net',host:'imap.gmx.net',tip:'Abilita l’accesso IMAP nelle impostazioni GMX.'},
  mail_com: {label:'mail.com',host:'imap.mail.com',tip:'L’accesso IMAP potrebbe richiedere un piano Premium.'},
});
export const OAUTH_PROVIDERS = ['gmail','outlook'];
export const MAIL_PROVIDERS = ['gmail','outlook',...Object.keys(IMAP_PROVIDERS)];
export function isImapProvider(provider){return Object.hasOwn(IMAP_PROVIDERS,provider);}
export function providerLabel(provider){return provider==='gmail'?'Gmail':provider==='outlook'?'Outlook / Hotmail / Microsoft 365':IMAP_PROVIDERS[provider]?.label||provider;}
export function validateMailboxInput({provider,email,login,password}){
  const config=IMAP_PROVIDERS[provider];
  if(!config)throw publicError('Provider IMAP non supportato.');
  const address=String(email||'').trim().toLowerCase();
  if(!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(address)||address.length>254)throw publicError('Indirizzo email non valido.');
  const user=String(login||address).trim();
  if(!user||user.length>254||/[\x00-\x1f\x7f]/.test(user))throw publicError('Nome utente IMAP non valido.');
  const secret=String(password||'');
  if(secret.length<4||secret.length>512)throw publicError('Inserisci la password per applicazioni o la credenziale IMAP prevista dal provider.');
  return {provider,email_address:address,imap_login:user,host:config.host,password:secret};
}
