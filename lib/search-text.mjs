// Confronto del testo cercato, condiviso dalla ricerca universale (lib/search.mjs, caricata alla
// prima apertura) e dall'elenco delle bollette (nella pagina principale): modulo piccolo apposta.
export const MIN_SEARCH_LENGTH = 2;
const MAX_WORDS = 4;

// Parole cercate: senza i caratteri jolly del database (% _ *) né quelli che rompono il filtro.
export function searchWords(input) {
  const clean = String(input ?? '').normalize('NFKC').replace(/[%_*\\"]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
  return [...new Set(clean.toLowerCase().split(' ').filter(word => word.length >= MIN_SEARCH_LENGTH))].slice(0, MAX_WORDS);
}

// Ricerca più tollerante (scelta dell'utente, 24 novembre 2026; tests/ricerca.test.mjs):
// - accenti: «societa» trova «Società» e «città» trova «Citta»;
// - finale delle parole: «bollette» trova «Bolletta», «fattura» trova «Fatture»;
// - categorie nella lingua dell'app: «electricity» o «Strom» trovano le bollette «Luce»;
// - errori di battitura (solo se nient'altro trova niente, sui dati già caricati): «bolleta», «fbra».
export const fold = s => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const VOWEL = /[aeiouy]/;
// Modello per ilike: la vocale finale (spesso accentata in italiano, e diversa fra singolare e
// plurale) e le vocali scritte con l'accento valgono come «una lettera qualsiasi» (_).
export function wordPattern(word) {
  const original = String(word).normalize('NFC').toLowerCase();
  const chars = [...original].map(c => (fold(c) !== c && VOWEL.test(fold(c)) ? '_' : fold(c)));
  if (chars.length >= 4 && VOWEL.test(chars[chars.length - 1])) chars[chars.length - 1] = '_';
  return chars.join('');
}
// Lo stesso confronto del database, in JavaScript: il modello di wordPattern su testo senza accenti.
export const patternRegex = word => new RegExp(wordPattern(word).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/_/g, '.'));
// Testo libero (elenco delle bollette): tutte le parole, senza accenti e con la vocale finale libera.
export function textMatches(haystack, text) {
  const words = searchWords(text);
  const folded = fold(haystack);
  return words.every(word => patternRegex(word).test(folded));
}

