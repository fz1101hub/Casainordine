// Scadenze fiscali di famiglia (scelta dell'utente del 26 novembre 2026, mattina): 730, modello
// Redditi, IMU e ISEE per l'Assegno unico, con i documenti da raccogliere per il 730. Le date sono
// quelle fisse di ogni anno; i termini fiscali che cadono di sabato o in un giorno festivo passano al
// primo giorno lavorativo (shift), come dicono le istruzioni dell'Agenzia delle Entrate. Proroghe
// decise di anno in anno non sono qui: il testo invita a controllare.
// Fonti (26 novembre 2026): Agenzia delle Entrate (precompilata dal 30 aprile, 730 entro il 30
// settembre, CU entro il 16 marzo), legge 160/2019 art. 1 c. 762 (IMU 16 giugno e 16 dicembre),
// INPS (DSU per l'Assegno unico entro fine febbraio, arretrati se entro il 30 giugno).
import { nextWorkingDay } from './installments.mjs';
import { addDaysISO } from './dates.mjs';

export const TAX_GROUPS = Object.freeze(['730', 'redditi', 'imu', 'isee']);
// kind: info (si apre qualcosa), deadline (da presentare), payment (da pagare).
export const TAX_DEADLINES = Object.freeze([
  Object.freeze({ key: 'isee', group: 'isee', month: 2, day: 28, shift: false, kind: 'deadline' }),
  Object.freeze({ key: 'cu', group: '730', month: 3, day: 16, shift: true, kind: 'info' }),
  Object.freeze({ key: 'precompiled', group: '730', month: 4, day: 30, shift: false, kind: 'info' }),
  Object.freeze({ key: 'imu_first', group: 'imu', month: 6, day: 16, shift: true, kind: 'payment' }),
  Object.freeze({ key: 'redditi_payment', group: 'redditi', month: 6, day: 30, shift: true, kind: 'payment' }),
  Object.freeze({ key: 'isee_arrears', group: 'isee', month: 6, day: 30, shift: false, kind: 'deadline' }),
  Object.freeze({ key: '730', group: '730', month: 9, day: 30, shift: true, kind: 'deadline' }),
  Object.freeze({ key: 'redditi', group: 'redditi', month: 10, day: 31, shift: true, kind: 'deadline' }),
  Object.freeze({ key: 'redditi_second', group: 'redditi', month: 11, day: 30, shift: true, kind: 'payment' }),
  Object.freeze({ key: 'imu_balance', group: 'imu', month: 12, day: 16, shift: true, kind: 'payment' }),
]);
// Documenti da raccogliere per il 730; category: voci delle Spese detraibili da contare.
export const TAX_DOCS = Object.freeze([
  Object.freeze({ key: 'cu', categories: [] }),
  Object.freeze({ key: 'medical', categories: ['medical'] }),
  Object.freeze({ key: 'veterinary', categories: ['veterinary'] }),
  Object.freeze({ key: 'education', categories: ['education'] }),
  Object.freeze({ key: 'nursery', categories: ['nursery'] }),
  Object.freeze({ key: 'sport', categories: ['sport'] }),
  Object.freeze({ key: 'mortgage', categories: ['mortgage'] }),
  Object.freeze({ key: 'rent', categories: ['rent'] }),
  Object.freeze({ key: 'renovation', categories: ['renovation', 'energy', 'furniture'] }),
  Object.freeze({ key: 'insurance', categories: ['insurance'] }),
  Object.freeze({ key: 'domestic_worker', categories: ['domestic_worker'] }),
]);
export const TAX_CAL_LIMITS = Object.freeze({ remindMin: 1, remindMax: 60, remindDefault: 14, doneMax: 400 });
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const pad = n => String(n).padStart(2, '0');

export const doneKey = (key, year) => `${key}_${year}`;
export const docKey = (key, year) => `doc_${key}_${year}`;

export function normalizeTaxSettings(source = {}) {
  const groups = TAX_GROUPS.filter(g => Array.isArray(source.groups) && source.groups.includes(g));
  const remind = Math.round(Number(source.remind_days));
  const done = [...new Set((Array.isArray(source.done) ? source.done : []).filter(k => typeof k === 'string' && /^[a-z0-9_]{1,40}_\d{4}$/.test(k)))]
    .sort().slice(-TAX_CAL_LIMITS.doneMax);
  return { groups, remind_days: remind >= TAX_CAL_LIMITS.remindMin && remind <= TAX_CAL_LIMITS.remindMax ? remind : TAX_CAL_LIMITS.remindDefault, done };
}

// Data della scadenza in quell'anno (spostata al primo giorno lavorativo se serve).
export function deadlineDate(deadline, year) {
  const iso = `${year}-${pad(deadline.month)}-${pad(deadline.day)}`;
  return deadline.shift ? nextWorkingDay(iso) : iso;
}

// Scadenze dei gruppi scelti da oggi a 12 mesi (e quelle passate da meno di 7 giorni, se non fatte).
export function taxAgenda(settings, today) {
  const s = normalizeTaxSettings(settings);
  if (!ISO.test(today || '') || !s.groups.length) return [];
  const year = Number(today.slice(0, 4)), from = addDaysISO(today, -7), until = addDaysISO(today, 366);
  const out = [];
  for (const y of [year, year + 1]) {
    for (const d of TAX_DEADLINES) {
      if (!s.groups.includes(d.group)) continue;
      const date = deadlineDate(d, y), done = s.done.includes(doneKey(d.key, y));
      if (date < from || date > until || (done && date < today)) continue;
      out.push({ key: d.key, group: d.group, kind: d.kind, year: y, date, done,
        state: done ? 'done' : date < today ? 'late' : date === today ? 'today' : 'soon', days: Math.round((Date.parse(date) - Date.parse(today)) / 864e5) });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.key.localeCompare(b.key));
}

// Avvisi del lavoro giornaliero: dal giorno del preavviso alla scadenza, una volta (data dell'evento:
// la scadenza). Le «info» (CU, precompilata) arrivano il giorno stesso.
export function taxNotices(settings, today) {
  const s = normalizeTaxSettings(settings);
  return taxAgenda(s, today).filter(a => !a.done && a.days >= 0 && a.days <= (a.kind === 'info' ? 0 : s.remind_days));
}

// Anno d'imposta del 730 che si prepara: fino al 30 settembre quello dell'anno prima, poi si guarda
// già al prossimo (redditi dell'anno in corso).
export function taxYearFor(today) {
  const year = Number(today.slice(0, 4));
  return today <= deadlineDate(TAX_DEADLINES.find(d => d.key === '730'), year) ? year - 1 : year;
}

// Documenti per il 730 dell'anno d'imposta: voci registrate nelle Spese detraibili e «pronto».
export function taxChecklist(settings, items = [], taxYear) {
  const s = normalizeTaxSettings(settings);
  return TAX_DOCS.map(doc => {
    const count = doc.categories.length ? items.filter(i => Number(i.tax_year) === taxYear && doc.categories.includes(i.category)).length : 0;
    return { key: doc.key, count, ready: s.done.includes(docKey(doc.key, taxYear)), counted: doc.categories.length > 0 };
  });
}

export function toggleDone(settings, key) {
  const s = normalizeTaxSettings(settings);
  const done = s.done.includes(key) ? s.done.filter(k => k !== key) : [...s.done, key];
  return normalizeTaxSettings({ ...s, done });
}
