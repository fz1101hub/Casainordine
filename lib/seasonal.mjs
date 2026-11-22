// Programma stagionale (Fase 2, 3.3): le cose da fare in casa stagione per stagione, scelte in base
// al clima, al tipo di casa e a cosa c'è (caldaia, condizionatore, camino, giardino).
// Ogni voce torna ogni anno nei suoi mesi; «fatto» vale per l'anno della stagione (period).
// Modulo senza testi: titolo e spiegazione sono «seasonal.item.<id>» e «seasonal.why.<id>».

export const CLIMATES = Object.freeze(['cold', 'mild', 'warm']);
export const HOME_TYPES = Object.freeze(['apartment', 'house']);
export const FEATURES = Object.freeze(['boiler', 'air_conditioning', 'fireplace', 'garden']);
export const DEFAULT_PROFILE = Object.freeze({ climate: 'mild', home_type: 'apartment', features: Object.freeze(['boiler']) });

// months: mesi (1–12) per clima; un clima assente vuol dire «qui non serve».
// needs: tutte le condizioni richieste (tipo di casa «house» oppure una delle dotazioni).
export const SEASONAL_ITEMS = Object.freeze([
  { id: 'boiler_service', needs: ['boiler'], months: { cold: [9, 10], mild: [9, 10], warm: [10, 11] } },
  { id: 'radiators_bleed', needs: ['boiler'], months: { cold: [10], mild: [10, 11], warm: [11] } },
  { id: 'chimney_sweep', needs: ['fireplace'], months: { cold: [8, 9], mild: [9, 10], warm: [9, 10] } },
  { id: 'window_seals', needs: [], months: { cold: [9, 10], mild: [10], warm: [10, 11] } },
  { id: 'detectors', needs: [], months: { cold: [10], mild: [10], warm: [10] } },
  { id: 'gutters', needs: ['house'], months: { cold: [10, 11], mild: [10, 11], warm: [11] } },
  { id: 'frost_protection', needs: ['house'], months: { cold: [11], mild: [11, 12] } },
  { id: 'garden_winter', needs: ['garden'], months: { cold: [10, 11], mild: [11], warm: [12] } },
  { id: 'ventilation', needs: [], months: { cold: [12, 1], mild: [12, 1], warm: [1] } },
  { id: 'drains', needs: [], months: { cold: [3], mild: [3], warm: [3] } },
  { id: 'roof_check', needs: ['house'], months: { cold: [4, 5], mild: [3, 4], warm: [3] } },
  { id: 'boiler_summer', needs: ['boiler'], months: { cold: [5], mild: [4], warm: [4] } },
  { id: 'irrigation', needs: ['garden'], months: { cold: [4, 5], mild: [3, 4], warm: [3] } },
  { id: 'insect_screens', needs: [], months: { cold: [5], mild: [4, 5], warm: [4] } },
  { id: 'ac_service', needs: ['air_conditioning'], months: { cold: [6], mild: [5], warm: [4, 5] } },
  { id: 'heat_ready', needs: [], months: { mild: [6], warm: [5, 6] } },
  { id: 'holiday_check', needs: [], months: { cold: [7, 8], mild: [7, 8], warm: [7, 8] } },
]);
export const SEASONAL_IDS = Object.freeze(SEASONAL_ITEMS.map(item => item.id));

// Profilo ripulito: valori noti, dotazioni senza doppioni nell'ordine di FEATURES.
export function normalizeProfile(input = {}) {
  const features = Array.isArray(input.features) ? input.features : DEFAULT_PROFILE.features;
  return {
    climate: CLIMATES.includes(input.climate) ? input.climate : DEFAULT_PROFILE.climate,
    home_type: HOME_TYPES.includes(input.home_type) ? input.home_type : DEFAULT_PROFILE.home_type,
    features: FEATURES.filter(feature => features.includes(feature)),
  };
}

// Le voci che valgono per questo profilo, con i loro mesi.
export function applicableItems(profileInput) {
  const profile = normalizeProfile(profileInput);
  return SEASONAL_ITEMS.filter(item => item.months[profile.climate]
    && item.needs.every(need => (need === 'house' ? profile.home_type === 'house' : profile.features.includes(need))))
    .map(item => ({ id: item.id, months: item.months[profile.climate] }));
}

const pad = n => String(n).padStart(2, '0');
const lastDay = (year, month) => new Date(Date.UTC(year, month, 0)).getUTCDate();
// Finestra di una voce che comincia nell'anno «year»: dal primo giorno del primo mese all'ultimo
// dell'ultimo; se i mesi scavalcano l'anno (dicembre → gennaio) finisce nell'anno dopo.
export function windowFor(months, year) {
  const first = months[0], last = months[months.length - 1];
  const endYear = last < first ? year + 1 : year;
  return { period: String(year), start: `${year}-${pad(first)}-01`, end: `${endYear}-${pad(last)}-${pad(lastDay(endYear, last))}` };
}

// Stato di una voce oggi: la finestra in corso, oppure la prossima.
//   now: siamo nei suoi mesi; soon: comincia entro 60 giorni; later: più avanti.
export function occurrence(months, today) {
  const year = Number(today.slice(0, 4));
  for (const y of [year - 1, year, year + 1]) {
    const window = windowFor(months, y);
    if (window.end < today) continue;
    if (window.start <= today) return { ...window, status: 'now' };
    const days = Math.round((Date.parse(window.start) - Date.parse(today)) / 86400000);
    return { ...window, status: days <= 60 ? 'soon' : 'later' };
  }
  return null;
}

// Ultima finestra già chiusa, se è finita da non più di LATE_DAYS giorni.
export const LATE_DAYS = 45;
export function recentlyMissed(months, today) {
  const year = Number(today.slice(0, 4));
  for (const y of [year, year - 1, year - 2]) {
    const window = windowFor(months, y);
    if (window.end >= today) continue;
    const days = Math.round((Date.parse(today) - Date.parse(window.end)) / 86400000);
    return days <= LATE_DAYS ? { ...window, status: 'late' } : null;
  }
  return null;
}

// Programma completo. done: righe {item_id, period, done_on}.
//   late: la stagione è appena finita e non risulta fatta (resta in vista per 45 giorni);
//   now / soon / later: la finestra in corso o la prossima; done: fatta per quella finestra.
export function seasonalPlan(profileInput, done = [], today) {
  const doneKey = new Map(done.map(row => [`${row.item_id}:${row.period}`, row]));
  const plan = { late: [], now: [], soon: [], later: [], done: [] };
  for (const item of applicableItems(profileInput)) {
    const missed = recentlyMissed(item.months, today);
    if (missed) {
      const record = doneKey.get(`${item.id}:${missed.period}`) || null;
      plan[record ? 'done' : 'late'].push({ id: item.id, months: item.months, ...missed, done: record });
      continue;
    }
    const next = occurrence(item.months, today);
    if (!next) continue;
    const record = doneKey.get(`${item.id}:${next.period}`);
    const entry = { id: item.id, months: item.months, ...next, done: record || null };
    if (record) plan.done.push(entry); else plan[next.status].push(entry);
  }
  for (const list of Object.values(plan)) list.sort((a, b) => a.start.localeCompare(b.start) || a.id.localeCompare(b.id));
  return plan;
}
