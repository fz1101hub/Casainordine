// Accounting uses integer cents and an atomic SQL function, never floating-point cents.
export function splitExpenseCents(totalCents,memberIds){
 if(!Number.isSafeInteger(totalCents)||totalCents<1||totalCents>100000000)throw new Error('Importo in centesimi non valido');
 if(!Array.isArray(memberIds)||!memberIds.length||memberIds.length>30||new Set(memberIds).size!==memberIds.length||memberIds.some(id=>typeof id!=='string'||!id))throw new Error('Partecipanti non validi');
 const base=Math.floor(totalCents/memberIds.length),extra=totalCents%memberIds.length;
 return memberIds.map((id,i)=>({user_id:id,cents:base+(i<extra?1:0)}));
}
export function signedMemberBalance(expenses,shares,userId){
 const byId=new Map(expenses.map(e=>[e.id,e]));
 const paid=expenses.filter(e=>e.paid_by===userId).reduce((sum,e)=>sum+Math.round(Number(e.amount)*100),0);
 const owed=shares.filter(s=>s.user_id===userId&&byId.has(s.expense_id)).reduce((sum,s)=>sum+Math.round(Number(s.amount)*100),0);
 return paid-owed;
}
export const canEditRole=role=>role==='owner'||role==='editor';
