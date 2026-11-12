// Genera lib/i18n-dicts/<lingua>.json dal catalogo lib/i18n.mjs (che resta l'unica fonte dei testi).
// Il browser scarica solo la lingua scelta invece di tutte e 6 (secondo audit, A1).
// Parte da solo con npm install, npm run build e npm run dev; i file generati non si committano.
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { TRANSLATIONS } from '../lib/i18n.mjs';

export function dictionaries() {
  return Object.fromEntries(Object.entries(TRANSLATIONS).map(([code, entries]) => [code, { ...entries }]));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = fileURLToPath(new URL('../lib/i18n-dicts/', import.meta.url));
  mkdirSync(dir, { recursive: true });
  for (const [code, entries] of Object.entries(dictionaries())) writeFileSync(`${dir}${code}.json`, JSON.stringify(entries));
  console.log(`Dizionari scritti in lib/i18n-dicts/: ${Object.keys(TRANSLATIONS).join(', ')}`);
}
