// User-provided supplier names are search hints, not proof of a sender's identity.
export async function loadUserSuppliers(admin,userId){
  const {data,error}=await admin.from('user_suppliers').select('name,category,sender_email').eq('user_id',userId).limit(50);
  if(error)throw error;
  return data||[];
}
export function safeSupplierNames(suppliers){return [...new Set((suppliers||[]).map(s=>String(s.name||'').trim()).filter(s=>s.length>=3&&s.length<=75&&!/[{}()"\\]/.test(s)))].slice(0,12);}
export function supplierMatch(suppliers,subject='',sender=''){
  const haystack=`${subject} ${sender}`.toLocaleLowerCase('it-IT');
  return (suppliers||[]).find(s=>{
    const n=String(s.name||'').trim().toLocaleLowerCase('it-IT');
    const address=String(s.sender_email||'').trim().toLowerCase();
    return (n.length>=3&&haystack.includes(n))||(address&&String(sender).toLowerCase().includes(address));
  })||null;
}
export function gmailSupplierQuery(suppliers){
  const names=safeSupplierNames(suppliers);
  const addresses=(suppliers||[]).map(s=>String(s.sender_email||'').trim().toLowerCase()).filter(s=>/^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$/.test(s)).slice(0,8);
  const terms=[...names.map(s=>`"${s}"`),...addresses.map(s=>`from:${s}`)].slice(0,18);
  return terms.length?`has:attachment newer_than:35d {${terms.join(' ')}}`:'';
}
