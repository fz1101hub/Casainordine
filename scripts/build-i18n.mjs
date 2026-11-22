// Genera i dizionari per il browser dal catalogo lib/i18n.mjs, che resta l'unica fonte dei testi.
// - lib/i18n-dicts/<lingua>.json: testi dell'app (il browser scarica solo la lingua scelta);
// - lib/i18n-dicts/<lingua>.<sezione>.json: testi delle sezioni che si aprono a parte (oggi V20), scaricati quando le apri;
// - public/offline-copy.js: testi della pagina offline (funziona senza rete, quindi tutte le lingue).
// Le chiavi «server.*» (email, notifiche, avvisi del cron) restano solo sul server.
// Parte da solo con npm install, npm run build e npm run dev; i file generati non si committano.
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { TRANSLATIONS } from '../lib/i18n.mjs';

export const SECTIONS = ['v20'];
export function groupOf(key) {
  const prefix = key.split('.', 1)[0];
  if (prefix === 'server' || prefix === 'offline' || SECTIONS.includes(prefix)) return prefix;
  return 'app';
}

// { it: { app: {...}, v20: {...}, offline: {...}, server: {...} }, en: {...}, ... }
export function dictionaries() {
  return Object.fromEntries(Object.entries(TRANSLATIONS).map(([code, entries]) => {
    const groups = { app: {}, offline: {}, server: {}, ...Object.fromEntries(SECTIONS.map(section => [section, {}])) };
    for (const [key, value] of Object.entries(entries)) groups[groupOf(key)][key] = value;
    return [code, groups];
  }));
}

export function offlineCopy(all = dictionaries()) {
  return Object.fromEntries(Object.entries(all).map(([code, groups]) => [code,
    Object.fromEntries(Object.entries(groups.offline).map(([key, value]) => [key.slice('offline.'.length), value]))]));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = fileURLToPath(new URL('../lib/i18n-dicts/', import.meta.url));
  mkdirSync(dir, { recursive: true });
  const all = dictionaries();
  for (const [code, groups] of Object.entries(all)) {
    writeFileSync(`${dir}${code}.json`, JSON.stringify(groups.app));
    for (const section of SECTIONS) writeFileSync(`${dir}${code}.${section}.json`, JSON.stringify(groups[section]));
  }
  writeFileSync(fileURLToPath(new URL('../public/offline-copy.js', import.meta.url)),
    '// Generato da scripts/build-i18n.mjs a partire da lib/i18n.mjs: non modificare a mano.\n' +
    `export const OFFLINE_COPY = ${JSON.stringify(offlineCopy(all))};\n`);
  console.log(`Dizionari scritti in lib/i18n-dicts/ (${Object.keys(all).join(', ')}; sezioni ${SECTIONS.join(', ')}) e public/offline-copy.js`);
}
