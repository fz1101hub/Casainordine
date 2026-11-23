// Chi riceve l'email del promemoria di una bolletta (3 giorni prima della scadenza).
// - Bolletta personale: chi l'ha inserita.
// - Bolletta di una casa: proprietario ed editor, cioè chi può segnarla come pagata. Chi è uscito
//   dalla casa non è più fra i membri e non la riceve; chi ha solo la lettura riceve la push.
// Ognuno può spegnere le email nelle impostazioni (profiles.reminder_emails) e spegnere tutti i
// promemoria (profiles.reminders_enabled).
export const EMAIL_ROLES = Object.freeze(['owner', 'editor']);

export function reminderEmailRecipients(bill, members = []) {
  if (!bill?.home_id) return bill?.user_id ? [bill.user_id] : [];
  return [...new Set((members || []).filter(m => m?.user_id && EMAIL_ROLES.includes(m.role)).map(m => m.user_id))];
}

export function wantsReminderEmail(profile) {
  return !!profile?.reminders_enabled && profile.reminder_emails !== false && !!String(profile.email || '').trim();
}
