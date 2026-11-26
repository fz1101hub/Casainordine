// Dose presa, saltata o annullata: la stessa scrittura dalla sezione Salute e dal riquadro della
// Home. Se la terapia è collegata a una confezione delle Scorte, una dose presa la scala e
// annullarla la rimette (v46_adjust_stock). Restituisce la riga salvata e la quantità rimasta.
export async function saveDose(client, { dose, status, row = null, stockItem = null, demo = false, newId = () => String(Date.now()) }) {
  const patch = { status, done_at: status === 'pending' ? null : new Date().toISOString() };
  let saved;
  if (demo) saved = { ...(row || { id: newId(), therapy_id: dose.therapy.id, due_at: dose.due_at }), ...patch };
  else if (row) {
    const { data, error } = await client.from('health_doses').update(patch).eq('id', row.id).select('*').single();
    if (error) return { error };
    saved = data;
  } else {
    const { data, error } = await client.from('health_doses').insert({ therapy_id: dose.therapy.id, due_at: dose.due_at, ...patch }).select('*').single();
    if (error) return { error, reload: true };
    saved = data;
  }
  const use = Number(dose.therapy.stock_use) || 0;
  const delta = stockItem && use ? (status === 'taken' ? -use : row?.status === 'taken' ? use : 0) : 0;
  if (!delta) return { saved, delta: 0 };
  let quantity = Math.max(0, Math.round((Number(stockItem.quantity) + delta) * 100) / 100), stockError = null;
  if (!demo) { const { data, error } = await client.rpc('v46_adjust_stock', { p_item: stockItem.id, p_delta: delta }); if (error) stockError = error; else quantity = Number(data); }
  return { saved, delta, quantity, stockError };
}
