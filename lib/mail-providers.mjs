import { publicError } from './public-error.mjs';
// Closed allow-list: mailbox owners cannot make our server connect to arbitrary hosts.
// All IMAP connections require TLS with certificate validation on port 993.
// Consigli e nomi tradotti sono nel dizionario: «mail.imap.tip.<id>», «mail.imap.label.<id>».
export const IMAP_PROVIDERS = Object.freeze({
  icloud: {label:'Apple iCloud Mail',host:'imap.mail.me.com'},
  yahoo: {label:'Yahoo Mail',host:'imap.mail.yahoo.com'},
  aol: {label:'AOL Mail',host:'imap.aol.com'},
  libero: {label:'Libero Mail',host:'imapmail.libero.it'},
  virgilio: {label:'Virgilio Mail',host:'in.virgilio.it'},
  tiscali: {label:'Tiscali Mail',host:'imap.tiscali.it'},
  aruba: {label:'Aruba Mail (own domain)',host:'imaps.aruba.it'},
  aruba_free: {label:'Aruba Mail (free)',host:'imap.aruba.it'},
  aruba_pec: {label:'Aruba PEC',host:'imaps.pec.aruba.it'},
  fastmail: {label:'Fastmail',host:'imap.fastmail.com'},
  zoho: {label:'Zoho Mail (personal)',host:'imap.zoho.com'},
  zoho_business: {label:'Zoho Mail (business, US)',host:'imappro.zoho.com'},
  zoho_eu: {label:'Zoho Mail (Europe)',host:'imap.zoho.eu'},
  zoho_business_eu: {label:'Zoho Mail (business, Europe)',host:'imappro.zoho.eu'},
  gmx: {label:'GMX.com',host:'imap.gmx.com'},
  gmx_de: {label:'GMX.de / GMX.net',host:'imap.gmx.net'},
  mail_com: {label:'mail.com',host:'imap.mail.com'},
});
export const OAUTH_PROVIDERS = ['gmail','outlook'];
export const MAIL_PROVIDERS = ['gmail','outlook',...Object.keys(IMAP_PROVIDERS)];
export function isImapProvider(provider){return Object.hasOwn(IMAP_PROVIDERS,provider);}
export function providerLabel(provider){return provider==='gmail'?'Gmail':provider==='outlook'?'Outlook / Hotmail / Microsoft 365':IMAP_PROVIDERS[provider]?.label||provider;}
export function validateMailboxInput({provider,email,login,password}){
  const config=IMAP_PROVIDERS[provider];
  if(!config)throw publicError('imapUnsupported');
  const address=String(email||'').trim().toLowerCase();
  if(!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(address)||address.length>254)throw publicError('invalidEmail');
  const user=String(login||address).trim();
  if(!user||user.length>254||/[\x00-\x1f\x7f]/.test(user))throw publicError('imapUser');
  const secret=String(password||'');
  if(secret.length<4||secret.length>512)throw publicError('imapPassword');
  return {provider,email_address:address,imap_login:user,host:config.host,password:secret};
}
