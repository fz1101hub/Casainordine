import { getAdmin, hashToken, json } from '../../../lib/server.mjs';
import { normalizeDate, parseMoney } from '../../../lib/dates.mjs';
export const runtime = 'nodejs';

export async function POST(request) {
  try {
    const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
    if (!/^cio_[\w-]{40,}$/.test(token)) return json({error:'Chiave non valida'},401);
    const admin = getAdmin();
    const {data:key,error:keyError} = await admin.from('integration_keys').select('user_id').eq('token_hash',hashToken(token)).maybeSingle();
    if (keyError || !key) return json({error:'Chiave non valida'},401);
    const raw = await request.text();
    if (raw.length > 15000) return json({error:'Richiesta troppo grande'},413);
    let body;
    try { body = JSON.parse(raw); } catch { return json({error:'JSON non valido'},400); }
    const amount = parseMoney(body.amount), due_date = normalizeDate(body.due_date);
    const external_id = String(body.external_id || '').trim();
    const title = String(body.title || '').trim(), supplier = String(body.supplier || '').trim();
    if (!Number.isFinite(amount) || !due_date || !title || title.length > 180 || supplier.length > 120 || !external_id || external_id.length > 180)
      return json({error:'title, supplier, amount, due_date ed external_id sono obbligatori e devono essere validi'},400);
    const bill = {user_id:key.user_id,title,supplier,amount,due_date,
      category:String(body.category || 'Altro').slice(0,60), source:'webhook',external_id,
      is_estimate:false,paid_at: body.paid === true ? new Date().toISOString() : null};
    const {data,error} = await admin.from('bills').insert(bill).select('id').single();
    // A repeated event must NOT reset a payment that the user marked as paid.
    if (error?.code === '23505') {
      const {data:existing} = await admin.from('bills').select('id').eq('user_id',key.user_id)
        .eq('source','webhook').eq('external_id',external_id).maybeSingle();
      if (existing) return json({ok:true,id:existing.id,duplicate:true});
    }
    if (error) throw error;
    return json({ok:true,id:data.id,duplicate:false});
  } catch { return json({error:'Importazione non riuscita'},500); }
}
