// Offline capture only. IndexedDB stays on this browser, never a shared family space.
const NAME='casa-in-ordine-offline-v2';const STORE='drafts';
function openDb(){return new Promise((resolve,reject)=>{
 if(typeof indexedDB==='undefined')return reject(new Error('Memoria offline non disponibile'));
 const req=indexedDB.open(NAME,1);req.onupgradeneeded=()=>req.result.createObjectStore(STORE,{keyPath:'id'});
 req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
});}
async function transaction(mode,callback){const db=await openDb();return new Promise((resolve,reject)=>{
 const tx=db.transaction(STORE,mode);const store=tx.objectStore(STORE);let value;
 try{value=callback(store);}catch(e){db.close();reject(e);return;}
 tx.oncomplete=()=>{db.close();resolve(value?.result);};tx.onerror=()=>{db.close();reject(tx.error);};tx.onabort=()=>{db.close();reject(tx.error||new Error('Transazione annullata'));};
});}
export async function queueDraft({type,title='',date=null,file=null}){
 if(!['task','shopping','document'].includes(type))throw new Error('Tipo non valido');
 if(['task','shopping'].includes(type)&&String(title).trim().length<(type==='task'?2:1))throw new Error('Titolo troppo corto');
 if(type==='document'&&(!file||file.size>10*1024*1024||!['application/pdf','image/jpeg','image/png','image/webp'].includes(file.type)))throw new Error('File non valido (PDF o foto, max 10 MB)');
 const data={id:crypto.randomUUID(),type,title:String(title||file?.name||'').slice(0,180),date:date||null,file:file||null,created_at:new Date().toISOString()};
 await transaction('readwrite',store=>store.add(data));return data.id;
}
export async function listDrafts(){const db=await openDb();return new Promise((resolve,reject)=>{
 const tx=db.transaction(STORE,'readonly');const request=tx.objectStore(STORE).getAll();request.onsuccess=()=>resolve(request.result||[]);request.onerror=()=>reject(request.error);
 tx.oncomplete=()=>db.close();tx.onerror=()=>db.close();
});}
export async function removeDraft(id){return transaction('readwrite',store=>store.delete(id));}
