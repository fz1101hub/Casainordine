import { getAdmin, authenticatedUser, newIntegrationToken, hashToken, json } from '../../../lib/server.mjs';

export const runtime = 'nodejs';
export async function GET(request) {
  try {
    const user = await authenticatedUser(request);
    if (!user) return json({error:'Accesso necessario'}, 401);
    const { data, error } = await getAdmin().from('integration_keys').select('label,created_at').eq('user_id',user.id).maybeSingle();
    if (error) throw error;
    return json({ connected:!!data, key:data || null });
  } catch { return json({error:'Impossibile leggere integrazione'},500); }
}
export async function POST(request) {
  try {
    const user = await authenticatedUser(request);
    if (!user) return json({error:'Accesso necessario'}, 401);
    const token = newIntegrationToken();
    const { error } = await getAdmin().from('integration_keys').upsert({
      user_id:user.id,token_hash:hashToken(token),label:'Automazione personale',created_at:new Date().toISOString()
    }, {onConflict:'user_id'});
    if (error) throw error;
    return json({token, warning:'Questa chiave viene mostrata una sola volta. Conservala in un luogo sicuro.'});
  } catch { return json({error:'Impossibile creare chiave'},500); }
}
export async function DELETE(request) {
  try {
    const user = await authenticatedUser(request);
    if (!user) return json({error:'Accesso necessario'}, 401);
    const {error} = await getAdmin().from('integration_keys').delete().eq('user_id',user.id);
    if (error) throw error;
    return json({ok:true});
  } catch { return json({error:'Impossibile revocare chiave'},500); }
}
