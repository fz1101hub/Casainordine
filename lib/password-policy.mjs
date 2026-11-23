// Regola unica per le password: almeno 8 caratteri alla registrazione, al recupero e al cambio.
// Chi ha già una password più corta entra lo stesso, poi l'app gli chiede di sceglierne una nuova.
export const MIN_PASSWORD_LENGTH = 8;
const KEY = 'cio-password-upgrade';

export function passwordTooShort(password) {
  return String(password ?? '').length < MIN_PASSWORD_LENGTH;
}

const normalEmail = email => String(email || '').trim().toLowerCase();

// Si segna prima dell'accesso (l'evento SIGNED_IN può arrivare prima della risposta) e vale solo
// per quell'indirizzo: un altro account aperto poi nella stessa scheda non vede la richiesta.
export function markPasswordUpgrade(storage, email) {
  try { storage?.setItem(KEY, normalEmail(email)); } catch {}
}
export function clearPasswordUpgrade(storage) {
  try { storage?.removeItem(KEY); } catch {}
}
export function needsPasswordUpgrade(storage, email) {
  try {
    const saved = storage?.getItem(KEY);
    return !!saved && saved === normalEmail(email);
  } catch { return false; }
}
