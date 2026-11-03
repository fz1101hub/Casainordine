// Intentionally kept identical to /public/sos-private.js so cached offline.html can decrypt.
const KEY='casa-in-ordine-sos-v21';
const b64=bytes=>btoa(String.fromCharCode(...bytes));
const unb64=value=>Uint8Array.from(atob(value),c=>c.charCodeAt(0));
async function aesKey(pass,salt){const base=await crypto.subtle.importKey('raw',new TextEncoder().encode(pass),'PBKDF2',false,['deriveKey']);return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:250000,hash:'SHA-256'},base,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);}
export async function sealSos(info,pass){if(typeof window==='undefined'||!crypto?.subtle||typeof pass!=='string'||pass.length<10)throw Error('Scegli una frase segreta di almeno 10 caratteri');
 const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));
 const plaintext=JSON.stringify({title:String(info.title||'').slice(0,120),location:String(info.location_hint||'').slice(0,500),instructions:String(info.instructions||'').slice(0,2500),contact:String(info.contact_label||'').slice(0,100),phone:String(info.contact_phone||'').slice(0,80)});
 const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv},await aesKey(pass,salt),new TextEncoder().encode(plaintext));
 localStorage.setItem(KEY,JSON.stringify({v:1,salt:b64(salt),iv:b64(iv),data:b64(new Uint8Array(ciphertext))}));return true;
}
export async function openSos(pass){let stored;try{stored=JSON.parse(localStorage.getItem(KEY)||'null');}catch{return null;}
 if(!stored)return null;if(stored.v!==1)throw Error('Formato non compatibile');
 try{const bytes=await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(stored.iv)},await aesKey(pass,unb64(stored.salt)),unb64(stored.data));return JSON.parse(new TextDecoder().decode(bytes));}catch{throw Error('Frase segreta non corretta oppure copia danneggiata');}}
export function clearSos(){localStorage.removeItem(KEY)}
export function hasSos(){return Boolean(localStorage.getItem(KEY))}
