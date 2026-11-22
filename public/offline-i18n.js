// Testi della pagina offline (public/offline.html) nelle 6 lingue dell'app.
// La lingua è quella scelta nell'app (preferenza dell'account usato sul dispositivo, poi quella
// generale), altrimenti quella del browser. Tono come nel resto dell'app: tu in italiano,
// spagnolo e tedesco; forma di cortesia in inglese neutro, francese e portoghese.
// I testi arrivano dal dizionario unico (lib/i18n.mjs, chiavi «offline.*»): li scrive
// scripts/build-i18n.mjs in public/offline-copy.js.
import { OFFLINE_COPY } from './offline-copy.js';
export { OFFLINE_COPY };

const KEY = 'casainordine-language-v32';
const LOCALES = { it: 'it-IT', en: 'en-GB', es: 'es-ES', fr: 'fr-FR', de: 'de-DE', pt: 'pt-PT' };

const pick = value => { const code = String(value || '').toLowerCase().split(/[-_]/)[0]; return OFFLINE_COPY[code] ? code : null; };
// accountId: l'account usato sul dispositivo (deviceAccountId di offline-standalone.js), o null.
export function offlineLanguage(storage = globalThis.localStorage, nav = globalThis.navigator, accountId = null) {
  try {
    if (accountId) { const own = pick(storage.getItem(`${KEY}:user:${accountId}`)); if (own) return own; }
    const shared = pick(storage.getItem(KEY)); if (shared) return shared;
  } catch {}
  return pick(nav?.languages?.[0] || nav?.language) || 'it';
}
export const offlineLocale = lang => LOCALES[lang] || 'it-IT';
export function offlineText(lang, key, params = {}) {
  const text = (OFFLINE_COPY[lang] || OFFLINE_COPY.it)[key] ?? OFFLINE_COPY.it[key] ?? key;
  return text.replace(/\{(\w+)\}/g, (match, name) => params[name] ?? match);
}
// Gli errori di offline-standalone.js e sos-private.js sono in italiano: si mostrano tradotti.
export function offlineError(lang, error) {
  const message = String(error?.message || '');
  if (/memoria offline/i.test(message)) return offlineText(lang, 'errStorage');
  if (/titolo troppo corto/i.test(message)) return offlineText(lang, 'errTitle');
  if (/file non valido/i.test(message)) return offlineText(lang, 'errFile');
  return offlineText(lang, 'errGeneric');
}
// Testi della pagina: data-t = testo, data-t-placeholder = segnaposto del campo.
export function applyOfflineCopy(doc, lang) {
  doc.documentElement.lang = lang;
  doc.title = offlineText(lang, 'title');
  for (const el of doc.querySelectorAll('[data-t]')) el.textContent = offlineText(lang, el.dataset.t);
  for (const el of doc.querySelectorAll('[data-t-placeholder]')) el.placeholder = offlineText(lang, el.dataset.tPlaceholder);
}
