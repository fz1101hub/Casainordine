// Stato della configurazione del server, per chi ha fatto l'accesso (lib/config-status.mjs).
// Solo quali impostazioni ci sono, mai i valori. Funziona anche senza SUPABASE_SECRET_KEY: il
// controllo dell'accesso usa la chiave pubblica.
import { authenticatedUser, getAdmin, json } from '../../../lib/server.mjs';
import { configStatus, checkDatabase } from '../../../lib/config-status.mjs';
export const dynamic='force-dynamic';
export async function GET(request){
 try{
  const user=await authenticatedUser(request);if(!user)return json({error:'unauthorized'},401);
  const items=configStatus(process.env);
  const database=items.find(item=>item.key==='database');
  if(database.state==='ok'){let state='invalid';try{state=await checkDatabase(getAdmin());}catch{}if(state!=='ok')Object.assign(database,{state,missing:['SUPABASE_SECRET_KEY']});}
  return json({items,checked_at:new Date().toISOString()});
 }catch{return json({error:'statusFailed'},500);}
}
