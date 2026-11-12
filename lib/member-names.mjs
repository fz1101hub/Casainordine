// Nome da mostrare per una persona di una casa condivisa (migrate_v41_ex_membri.sql).
// I membri attuali con la parte dell'email prima della @; chi ha lasciato la casa o cancellato
// l'account come «Nome (ex membro)», con il nome salvato in home_former_members. Se il nome non
// c'è (casa più vecchia della v4.1) resta solo «ex membro».
export function memberName(userId, { members = [], former = [], formerLabel = 'ex membro' } = {}) {
  const member = members.find(m => m.user_id === userId);
  if (member) return member.email?.split('@')[0] || formerLabel;
  const gone = former.find(f => f.user_id === userId);
  return gone?.display_name ? `${gone.display_name} (${formerLabel})` : formerLabel;
}

// Saldi da mostrare: i membri attuali, poi gli ex membri che devono ancora dare o ricevere.
export function balanceRows({ members = [], former = [], balanceCents = null, fallback = () => 0 }) {
  const current = members.map(m => ({ ...m, former: false, cents: balanceCents && m.user_id in balanceCents ? balanceCents[m.user_id] : fallback(m.user_id) }));
  const gone = balanceCents ? former.filter(f => !members.some(m => m.user_id === f.user_id) && Number(balanceCents[f.user_id] || 0) !== 0)
    .map(f => ({ user_id: f.user_id, former: true, cents: Number(balanceCents[f.user_id]) })) : [];
  return [...current, ...gone].map(row => ({ ...row, balance: row.cents / 100 }));
}
