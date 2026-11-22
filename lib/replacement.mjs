// Fondo sostituzioni (Fase 2, 3.3): per ogni oggetto di casa (dalle Manutenzioni) una vita utile
// indicativa, il costo stimato di sostituzione e quanto mettere da parte ogni mese per arrivarci.
// Le durate sono indicative (uso domestico normale): la persona le può cambiare, e l'app lo dice.
// Modulo senza testi: i tipi sono chiavi («replacement.type.<chiave>»).

// life: anni indicativi; words: parole del nome (nelle 6 lingue) che fanno proporre il tipo.
export const REPLACEMENT_TYPES = Object.freeze({
  boiler: { life: 15, words: ['caldaia', 'boiler', 'caldera', 'chaudière', 'chaudiere', 'heizkessel', 'therme', 'caldeira'] },
  heat_pump: { life: 15, words: ['pompa di calore', 'heat pump', 'bomba de calor', 'pompe à chaleur', 'wärmepumpe', 'bomba de calor'] },
  water_heater: { life: 10, words: ['scaldabagno', 'boiler elettrico', 'water heater', 'calentador', 'termo', 'chauffe-eau', 'warmwasserspeicher', 'esquentador', 'termoacumulador'] },
  air_conditioner: { life: 12, words: ['condizionatore', 'climatizzatore', 'air conditioner', 'aire acondicionado', 'climatiseur', 'klimaanlage', 'ar condicionado'] },
  washing_machine: { life: 10, words: ['lavatrice', 'washing machine', 'washer', 'lavadora', 'lave-linge', 'waschmaschine', 'máquina de lavar roupa', 'maquina de lavar roupa'] },
  dryer: { life: 10, words: ['asciugatrice', 'dryer', 'secadora', 'sèche-linge', 'seche-linge', 'trockner', 'máquina de secar', 'maquina de secar'] },
  dishwasher: { life: 10, words: ['lavastoviglie', 'dishwasher', 'lavavajillas', 'lave-vaisselle', 'geschirrspüler', 'spülmaschine', 'máquina de lavar loiça', 'maquina de lavar loica'] },
  fridge: { life: 12, words: ['frigorifero', 'frigo', 'fridge', 'refrigerator', 'nevera', 'frigorífico', 'frigorifico', 'réfrigérateur', 'refrigerateur', 'kühlschrank'] },
  oven: { life: 15, words: ['forno', 'oven', 'horno', 'four', 'backofen'] },
  hob: { life: 15, words: ['piano cottura', 'hob', 'cooktop', 'placa', 'vitrocerámica', 'plaque de cuisson', 'kochfeld', 'placa de fogão'] },
  tv: { life: 8, words: ['televisore', 'tv', 'television', 'televisión', 'télévision', 'fernseher', 'televisão'] },
  computer: { life: 5, words: ['computer', 'pc', 'portatile', 'laptop', 'ordenador', 'portátil', 'ordinateur', 'rechner', 'computador'] },
  mattress: { life: 8, words: ['materasso', 'mattress', 'colchón', 'colchon', 'matelas', 'matratze', 'colchão', 'colchao'] },
  smoke_alarm: { life: 10, words: ['rilevatore', 'smoke alarm', 'detector', 'détecteur', 'detecteur', 'rauchmelder', 'detetor'] },
  paint: { life: 8, words: ['tinteggiatura', 'pittura', 'paint', 'pintura', 'peinture', 'anstrich'] },
  other: { life: 10, words: [] },
});
export const REPLACEMENT_TYPE_KEYS = Object.freeze(Object.keys(REPLACEMENT_TYPES));
export const REPLACEMENT_LIMITS = Object.freeze({ minLife: 1, maxLife: 60, maxAmount: 100000000 });

const lower = text => String(text ?? '').toLocaleLowerCase('it');
// Tipo proposto dal nome dell'oggetto (la parola più lunga trovata vince: «boiler elettrico» prima di «boiler»).
// Una parola lunga vale anche in fondo a una parola composta («Küchenkühlschrank»).
export function guessType(name) {
  const text = ` ${lower(name)} `;
  let best = 'other', length = 0;
  for (const [type, { words }] of Object.entries(REPLACEMENT_TYPES))
    for (const word of words) {
      if (word.length <= length) continue;
      const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const start = word.length >= 6 ? '' : '(^|[^\\p{L}])';
      if (new RegExp(`${start}${escaped}([^\\p{L}]|$)`, 'u').test(text)) { best = type; length = word.length; }
    }
  return best;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const amount = value => {
  if (value === '' || value === null || value === undefined) return null;
  const n = Math.round(Number(String(value).replace(',', '.')) * 100) / 100;
  return Number.isFinite(n) && n >= 0 && n <= REPLACEMENT_LIMITS.maxAmount ? n : NaN;
};

// Controlla il piano di un oggetto: {value} oppure {error:'replacement.error.*'}.
export function normalizePlan(input = {}) {
  const item_type = REPLACEMENT_TYPE_KEYS.includes(input.item_type) ? input.item_type : 'other';
  let life_years = null;
  if (input.life_years !== '' && input.life_years !== null && input.life_years !== undefined) {
    life_years = Number(input.life_years);
    if (!Number.isInteger(life_years) || life_years < REPLACEMENT_LIMITS.minLife || life_years > REPLACEMENT_LIMITS.maxLife) return { error: 'replacement.error.life' };
  }
  // Somma già da parte: vuota vuol dire zero.
  const cost = amount(input.cost), saved = amount(input.saved === '' || input.saved === null || input.saved === undefined ? 0 : input.saved);
  if (Number.isNaN(cost)) return { error: 'replacement.error.cost' };
  if (Number.isNaN(saved) || saved === null) return { error: 'replacement.error.saved' };
  const installed_on = ISO.test(input.installed_on || '') ? input.installed_on : null;
  return { value: { item_type, life_years, cost, saved, installed_on } };
}

const addYears = (iso, years) => {
  const [y, m, d] = iso.split('-').map(Number);
  const last = new Date(Date.UTC(y + years, m, 0)).getUTCDate();
  return `${y + years}-${String(m).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
};
// Mesi interi da oggi alla data (0 se è già passata).
export function monthsUntil(today, iso) {
  const [ty, tm, td] = today.split('-').map(Number), [y, m, d] = iso.split('-').map(Number);
  const months = (y - ty) * 12 + (m - tm) - (d < td ? 1 : 0);
  return Math.max(0, months);
}

// Stima per un oggetto: quando andrà sostituito e quanto mettere da parte al mese.
//   status: missing_date (manca la data d'installazione o d'acquisto), missing_cost (manca il costo),
//   due (vita indicativa finita: da controllare o sostituire), ok.
export function replacementEstimate(asset = {}, plan = {}, today) {
  const type = REPLACEMENT_TYPE_KEYS.includes(plan.item_type) ? plan.item_type : guessType(asset.name);
  const life = Number(plan.life_years) || REPLACEMENT_TYPES[type].life;
  const start = ISO.test(plan.installed_on || '') ? plan.installed_on : ISO.test(asset.purchased_on || '') ? asset.purchased_on : null;
  const cost = plan.cost === null || plan.cost === undefined || plan.cost === '' ? null : Number(plan.cost);
  const saved = Number(plan.saved) || 0;
  const base = { type, life, start, cost, saved, dueOn: null, monthsLeft: null, monthly: null, needed: null };
  if (!start) return { ...base, status: 'missing_date' };
  const dueOn = addYears(start, life);
  const monthsLeft = monthsUntil(today, dueOn);
  if (cost === null) return { ...base, dueOn, monthsLeft, status: dueOn <= today ? 'due' : 'missing_cost' };
  const needed = Math.max(0, Math.round((cost - saved) * 100) / 100);
  const monthly = monthsLeft > 0 ? Math.round((needed / monthsLeft) * 100) / 100 : needed;
  return { ...base, dueOn, monthsLeft, needed, monthly, status: dueOn <= today ? 'due' : 'ok' };
}

// Totale del fondo: quanto mettere da parte al mese per gli oggetti con data e costo, e quanto manca
// per quelli già oltre la vita indicativa (non diviso per mesi: servirebbe subito).
export function fundSummary(estimates = []) {
  const planned = estimates.filter(e => e.status === 'ok');
  const due = estimates.filter(e => e.status === 'due' && e.needed !== null);
  const round = n => Math.round(n * 100) / 100;
  return {
    monthly: round(planned.reduce((sum, e) => sum + e.monthly, 0)),
    dueNow: round(due.reduce((sum, e) => sum + e.needed, 0)),
    saved: round(estimates.reduce((sum, e) => sum + (e.saved || 0), 0)),
    counted: planned.length, dueCount: estimates.filter(e => e.status === 'due').length,
    incomplete: estimates.filter(e => e.status === 'missing_date' || e.status === 'missing_cost').length,
  };
}
