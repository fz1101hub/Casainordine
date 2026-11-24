// Numeri scritti a mano negli importi e nelle quantità.
// Un <input type="number"> non va bene: Chrome legge «12,50» come 1250 e Safari lo scarta.
// Qui si accettano virgola o punto, separatori delle migliaia, spazi, apostrofi e il simbolo dell'euro,
// e si restituisce un decimale col punto («1234.5») che il resto dell'app usa già.
import { localeFor, normalizeLanguage } from './i18n-core.mjs';

const DECIMAL_SEPARATOR = { it: ',', en: '.', es: ',', fr: ',', de: ',', pt: ',' };

function validGroups(groups) {
  return /^[1-9]\d{0,2}$/.test(groups[0]) && groups.slice(1).every(g => /^\d{3}$/.test(g));
}

function plain(intPart, fracPart = '') {
  const int = intPart.replace(/^0+(?=\d)/, '') || '0';
  return fracPart ? `${int}.${fracPart}` : int;
}

// Restituisce { value, error }.
// value: '' se il campo è vuoto, altrimenti un decimale col punto; null se il testo non è un numero.
// error: null, 'invalid', 'decimals', 'min' o 'max'.
export function parseNumberInput(raw, { lang = 'it', decimals = 2, min, max } = {}) {
  let s = String(raw ?? '')
    .replace(/[\s  '’`]/g, '')
    .replace(/^(?:€|eur(?:o)?)/i, '')
    .replace(/(?:€|eur(?:o)?)$/i, '');
  if (!s) return { value: '', error: null };
  let negative = false;
  if (/^[+\-−]/.test(s)) { negative = s[0] !== '+'; s = s.slice(1); }
  if (/^[.,]\d/.test(s)) s = '0' + s;          // ,5 → 0,5
  if (/\d[.,]$/.test(s)) s = s.slice(0, -1);   // «12,» mentre si scrive
  if (!/^\d+(?:[.,]\d+)*$/.test(s)) return { value: null, error: 'invalid' };

  const dot = s.lastIndexOf('.'), comma = s.lastIndexOf(',');
  let intPart, fracPart = '';
  if (dot >= 0 && comma >= 0) {
    const decimal = dot > comma ? '.' : ',', group = decimal === '.' ? ',' : '.';
    const parts = s.split(decimal);
    if (parts.length !== 2) return { value: null, error: 'invalid' };
    const groups = parts[0].split(group);
    if (groups.length > 1 && !validGroups(groups)) return { value: null, error: 'invalid' };
    intPart = groups.join(''); fracPart = parts[1];
  } else if (dot < 0 && comma < 0) {
    intPart = s;
  } else {
    const sep = dot >= 0 ? '.' : ',';
    const parts = s.split(sep);
    if (parts.length > 2) {
      // Lo stesso segno più volte separa solo le migliaia (1.234.567).
      if (!validGroups(parts)) return { value: null, error: 'invalid' };
      intPart = parts.join('');
    } else if (parts[1].length === 3 && validGroups(parts)) {
      // «1.500» o «1,500»: negli importi (2 decimali) sono migliaia;
      // nelle quantità decide la lingua: il suo separatore decimale vale come virgola.
      const decimalSep = DECIMAL_SEPARATOR[normalizeLanguage(lang)] || ',';
      if (decimals >= 3 && sep === decimalSep) { intPart = parts[0]; fracPart = parts[1]; }
      else intPart = parts.join('');
    } else {
      intPart = parts[0]; fracPart = parts[1];
    }
  }
  if (fracPart.length > decimals) return { value: null, error: 'decimals' };
  const text = plain(intPart, fracPart.replace(/0+$/, ''));
  const value = negative && Number(text) !== 0 ? `-${text}` : text;
  const n = Number(value);
  if (!Number.isFinite(n) || intPart.length > 15) return { value: null, error: 'invalid' };
  if (min !== undefined && min !== null && min !== '' && n < Number(min)) return { value, error: 'min' };
  if (max !== undefined && max !== null && max !== '' && n > Number(max)) return { value, error: 'max' };
  return { value, error: null };
}

// Il numero come lo scrive chi usa quella lingua, senza separatore delle migliaia (12,50 · 12.50).
export function formatNumberInput(value, lang = 'it', decimals = 2) {
  if (value === '' || value === null || value === undefined) return '';
  const n = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isFinite(n)) return String(value);
  const options = decimals === 2
    ? { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false }
    : { minimumFractionDigits: 0, maximumFractionDigits: decimals, useGrouping: false };
  return new Intl.NumberFormat(localeFor(lang), options).format(n);
}

// Stesso numero? Serve a capire se il valore arrivato dall'esterno è quello già scritto.
export function sameNumber(a, b) {
  const empty = v => v === '' || v === null || v === undefined;
  if (empty(a) || empty(b)) return empty(a) && empty(b);
  return Number(a) === Number(b);
}
