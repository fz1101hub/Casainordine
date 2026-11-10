// Controlli di ruolo lato server (chiave di servizio, quindi senza regole di riga):
// replicano public.can_edit_home / public.is_home_member per un utente esplicito.
export async function homeRole(admin,homeId,userId){
  if(!homeId||!userId)return null;
  const {data,error}=await admin.from('home_members').select('role').eq('home_id',homeId).eq('user_id',userId).maybeSingle();
  if(error)throw error;
  return data?.role||null;
}
export async function canEditBill(admin,bill,userId){
  if(!bill)return false;
  if(!bill.home_id)return bill.user_id===userId;
  return ['owner','editor'].includes(await homeRole(admin,bill.home_id,userId));
}
export async function isHomeMember(admin,homeId,userId){
  return Boolean(await homeRole(admin,homeId,userId));
}
