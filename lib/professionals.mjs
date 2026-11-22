// Professionisti di fiducia (Fase 2, 3.3): contatti, mestiere, note e interventi collegati.
// Modulo senza testi: i mestieri noti si salvano come chiave («plumber»…) e si leggono nella lingua
// di chi guarda («professional.trade.<chiave>»); un mestiere diverso si salva come lo scrive la persona.

export const TRADES = Object.freeze(['plumber', 'electrician', 'heating', 'builder', 'painter', 'carpenter', 'locksmith',
  'windows', 'appliances', 'antenna', 'gardener', 'cleaning', 'administrator', 'surveyor']);
export const PROFESSIONAL_LIMITS = Object.freeze({ name: 120, trade: 60, phone: 40, email: 160, notes: 1500, privateNote: 1500 });

const clean = (value, max) => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
// Indirizzo semplice: niente spazi, parentesi o parametri (?subject=…) che cambierebbero il collegamento mailto.
const EMAIL = /^[^\s@<>()[\]\\,;:"?&=/]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;
const PHONE = /^[+]?[\d\s()./-]{5,40}$/;

// Controlla e ripulisce un professionista prima di salvarlo; {value} oppure {error:'professional.error.*'}.
export function normalizeProfessional(input = {}) {
  const name = clean(input.name, PROFESSIONAL_LIMITS.name);
  if (name.length < 2) return { error: 'professional.error.name' };
  const trade = TRADES.includes(input.trade) ? input.trade : clean(input.customTrade ?? input.trade, PROFESSIONAL_LIMITS.trade);
  if (trade.length < 2) return { error: 'professional.error.trade' };
  const phone = clean(input.phone, PROFESSIONAL_LIMITS.phone);
  if (phone && (!PHONE.test(phone) || (phone.match(/\d/g) || []).length < 5)) return { error: 'professional.error.phone' };
  const email = clean(input.email, PROFESSIONAL_LIMITS.email).toLowerCase();
  if (email && !EMAIL.test(email)) return { error: 'professional.error.email' };
  const notes = String(input.notes ?? '').trim().slice(0, PROFESSIONAL_LIMITS.notes);
  return { value: { name, trade, phone, email, notes } };
}

// Collegamenti per chiamare o scrivere: solo con un numero o un indirizzo validi.
export function telHref(phone) {
  const digits = String(phone ?? '').replace(/[^\d+]/g, '');
  return (digits.match(/\d/g) || []).length >= 5 ? `tel:${digits}` : '';
}
export function mailHref(email) {
  const value = String(email ?? '').trim();
  return EMAIL.test(value) ? `mailto:${value}` : '';
}

// Interventi di un professionista (dal registro delle manutenzioni): quanti, quanto speso, l'ultimo.
export function professionalStats(events = [], professionalId) {
  const own = events.filter(event => event.professional_id === professionalId)
    .sort((a, b) => String(b.done_on).localeCompare(String(a.done_on)));
  const total = Math.round(own.reduce((sum, event) => sum + (Number(event.cost) || 0), 0) * 100) / 100;
  return { count: own.length, total, last: own[0]?.done_on || '', events: own };
}
