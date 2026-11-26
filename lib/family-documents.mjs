// Documenti di famiglia in scadenza (scelta dell'utente del 26 novembre 2026, notte): carta
// d'identità, passaporto, patente, tessera sanitaria, permesso di soggiorno e altri, con la data di
// scadenza e il preavviso. Usato dal browser (app/FamilyDocuments.jsx, riquadro della Home) e dal
// lavoro giornaliero (lib/document-alerts.mjs). Niente dizionari qui: solo chiavi «iddocs.…».
import { addDaysISO as addDays } from './dates.mjs';

export const DOC_KINDS = Object.freeze(['identity_card', 'passport', 'driving_license', 'health_card', 'residence_permit', 'sport_certificate', 'other']);
// Preavviso di partenza: la carta d'identità si può rinnovare da 180 giorni prima e gli appuntamenti
// del Comune possono essere lontani; per il passaporto molti Paesi chiedono 6 mesi di validità
// residua; la patente si rinnova da 4 mesi prima; il permesso di soggiorno va rinnovato almeno 60
// giorni prima della scadenza.
// Il certificato medico sportivo di solito vale 12 mesi: un mese di preavviso per prenotare la visita.
export const DOC_NOTICE = Object.freeze({ identity_card: 120, passport: 180, driving_license: 120, health_card: 30, residence_permit: 90, sport_certificate: 30, other: 60 });
export const NOTICE_CHOICES = Object.freeze([14, 30, 60, 90, 120, 180, 270, 365]);
export const DOC_LIMITS = Object.freeze({ holder: 80, label: 80, notes: 500, perSpace: 300, expiredDays: 30 });

const ISO = /^\d{4}-\d{2}-\d{2}$/;
export const validDate = value => ISO.test(value || '') && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;
const text = (value, max) => String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, max);
const daysBetween = (from, to) => Math.round((Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 86400000);

// Documento controllato: {value} oppure {error:'iddocs.error.*'}. Senza data = senza scadenza.
export function normalizeDocument(input = {}) {
  const holder = text(input.holder, DOC_LIMITS.holder);
  if (!holder) return { error: 'iddocs.error.holder' };
  const kind = DOC_KINDS.includes(input.kind) ? input.kind : 'other';
  const expires_on = input.no_expiry || !input.expires_on ? null : String(input.expires_on);
  if (expires_on && !validDate(expires_on)) return { error: 'iddocs.error.date' };
  const notice = Number(input.notice_days ?? DOC_NOTICE[kind]);
  if (!Number.isInteger(notice) || notice < 7 || notice > 365) return { error: 'iddocs.error.notice' };
  return { value: { holder, kind, label: text(input.label, DOC_LIMITS.label), expires_on, notice_days: notice, notes: text(input.notes, DOC_LIMITS.notes) } };
}

// Stato: none (senza scadenza), expired (scaduto), renew (nel periodo del rinnovo), ok.
export function documentState(doc, today) {
  if (!validDate(doc?.expires_on)) return { state: 'none', days: null };
  const days = daysBetween(today, doc.expires_on);
  if (days < 0) return { state: 'expired', days };
  if (days <= (Number(doc.notice_days) || DOC_NOTICE[doc.kind] || 60)) return { state: 'renew', days };
  return { state: 'ok', days };
}

// Elenco ordinato: prima gli scaduti, poi da rinnovare, poi gli altri per scadenza, infine senza scadenza.
export function documentAgenda(docs = [], today) {
  const order = { expired: 0, renew: 1, ok: 2, none: 3 };
  return docs.map(doc => ({ doc, ...documentState(doc, today) }))
    .sort((a, b) => order[a.state] - order[b.state] || String(a.doc.expires_on || '').localeCompare(String(b.doc.expires_on || ''))
      || a.doc.holder.localeCompare(b.doc.holder));
}

// Avvisi del lavoro giornaliero: «da rinnovare» quando comincia il preavviso (data dell'evento: la
// scadenza) e «scaduto» il giorno dopo la scadenza (data dell'evento: quel giorno), per un mese.
export function documentNotices(docs = [], today) {
  const out = [];
  for (const doc of docs) {
    const { state, days } = documentState(doc, today);
    if (state === 'renew') out.push({ doc, type: 'renew', event_date: doc.expires_on, days });
    else if (state === 'expired' && -days <= DOC_LIMITS.expiredDays) out.push({ doc, type: 'expired', event_date: addDays(doc.expires_on, 1), days });
  }
  return out;
}

// Nomi già usati (dalle persone di Salute e dai documenti) per suggerirli nel modulo.
export function holderSuggestions(docs = [], people = []) {
  return [...new Set([...people.map(p => p.name), ...docs.map(d => d.holder)].map(n => String(n || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

// Rinnovo: il certificato sportivo si rinnova di solito per un anno; per gli altri la nuova data si sceglie.
export function suggestedRenewal(doc, today) {
  if (doc?.kind !== 'sport_certificate') return '';
  const base = validDate(doc.expires_on) && doc.expires_on > today ? doc.expires_on : today;
  const [y, m, d] = base.split('-').map(Number);
  return new Date(Date.UTC(y + 1, m - 1, d)).toISOString().slice(0, 10).replace(/-02-29$/, '-02-28');
}

// ===== Iscrizioni scolastiche =====
// Classi iniziali per chi segue il percorso regolare: infanzia l'anno in cui si compiono 3 anni,
// primaria a 6, secondaria di primo grado a 11, di secondo grado a 14 (le domande online di solito
// fra gennaio e febbraio; le date esatte le fissa ogni anno il Ministero con una circolare di dicembre).
export const SCHOOL_STEPS = Object.freeze([['nursery_school', 3], ['primary', 6], ['middle', 11], ['high', 14]]);
export const ENROLLMENT_NOTICE = '01-07';
// La prossima iscrizione di ogni bambino o ragazzo (fino al 28 febbraio dell'anno resta quella in corso).
export function schoolEnrollments(people = [], today) {
  const year = Number(String(today).slice(0, 4)), afterWindow = String(today).slice(5) > '02-28';
  const out = [];
  for (const person of people) {
    if (!validDate(person?.birth_on)) continue;
    const born = Number(person.birth_on.slice(0, 4));
    const step = SCHOOL_STEPS.find(([, age]) => born + age > year || (born + age === year && !afterWindow));
    if (step) out.push({ person, grade: step[0], year: born + step[1], schoolYear: `${born + step[1]}/${born + step[1] + 1}` });
  }
  return out.sort((a, b) => a.year - b.year || a.person.name.localeCompare(b.person.name));
}
// Avviso del lavoro giornaliero: dal 7 gennaio al 28 febbraio dell'anno dell'iscrizione.
export function enrollmentNotices(people = [], today) {
  const year = Number(String(today).slice(0, 4)), md = String(today).slice(5);
  if (md < ENROLLMENT_NOTICE || md > '02-28') return [];
  return schoolEnrollments(people, today).filter(e => e.year === year).map(e => ({ ...e, event_date: `${year}-${ENROLLMENT_NOTICE}` }));
}
