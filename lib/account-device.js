// Dopo la cancellazione dell'account: toglie da questo dispositivo quello che apparteneva all'account
// (GDPR art. 17). Prima restavano le bozze offline (anche foto e PDF di bollette), le copie offline
// delle schede SOS e l'iscrizione alle notifiche del browser.
// Non tocca quello degli altri account che usano lo stesso dispositivo, né le bozze salvate senza
// accesso. Ogni passo è indipendente e ha un tempo massimo: l'uscita non si blocca.
import { removeAccountDrafts } from './offline-queue.js';
import { OFFLINE_PREFIX } from './sos-vault.mjs';

const within = (promise, ms) => Promise.race([promise, new Promise(done => setTimeout(() => done(null), ms))]);

export async function forgetAccountOnDevice(userId, { storage = globalThis.localStorage, navigatorRef = globalThis.navigator } = {}) {
  if (!userId) return { drafts: 0, sos: 0, push: false };
  const result = { drafts: 0, sos: 0, push: false };
  try { result.drafts = (await within(removeAccountDrafts(userId), 3000)) || 0; } catch {}
  try {
    const prefix = `${OFFLINE_PREFIX}${userId}:`, doomed = [];
    for (let i = 0; i < storage.length; i++) { const key = storage.key(i); if (key?.startsWith(prefix)) doomed.push(key); }
    for (const key of doomed) storage.removeItem(key);
    result.sos = doomed.length;
  } catch {}
  // Le iscrizioni sul server spariscono con l'account; qui si toglie quella del browser.
  try {
    const registration = navigatorRef?.serviceWorker ? await within(navigatorRef.serviceWorker.ready, 1500) : null;
    const subscription = await registration?.pushManager?.getSubscription();
    if (subscription) result.push = Boolean(await within(subscription.unsubscribe(), 1500));
  } catch {}
  return result;
}
