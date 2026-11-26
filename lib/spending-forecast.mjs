// Previsione delle uscite dei prossimi mesi, da tutto quello che l'app già conosce:
// - bollette con scadenza nel mese (anche quelle stimate create dalle utenze ricorrenti);
// - utenze ricorrenti attive oltre i 45 giorni in cui il lavoro notturno crea le bollette stimate
//   (le scadenze dei veicoli con un costo diventano bollette o utenze, quindi sono già qui);
// - rate dei piani in corso (rette, sport, collaboratori domestici, acconti e contributi);
// - una stima dallo storico per le bollette che tornano con regolarità ma non hanno un'utenza.
// Ogni voce si conta una volta sola: una bolletta già presente nel mese prende il posto della
// stima della stessa utenza o dello stesso fornitore. Tutti gli importi sono in centesimi.
import { nextRecurringDue } from './dates.mjs';
import { firstRecurringFrom } from './reminder-window.mjs';

export const FORECAST_PARTS = ['bills', 'utilities', 'estimated', 'installments'];
export const FORECAST_HORIZONS = [6, 12];

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const monthIndex = iso => Number(iso.slice(0, 4)) * 12 + Number(iso.slice(5, 7)) - 1;
const monthOfIndex = i => `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`;
const lastDay = month => { const [y, m] = month.split('-').map(Number); return `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`; };
const seriesKey = (supplier, title, category) => `${String(supplier || title || '').toLowerCase().trim()}|${category || ''}`;

export function toCents(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}

export function forecastMonths(today, count) {
  const start = monthIndex(today);
  return Array.from({ length: Math.max(1, Math.min(24, Number(count) || 12)) }, (_, i) => monthOfIndex(start + i));
}

// Primo e ultimo giorno del periodo (per leggere le rate solo di quei mesi).
export function forecastRange(today, count) {
  const list = forecastMonths(today, count);
  return { first: `${list[0]}-01`, last: lastDay(list.at(-1)) };
}

export function spendingForecast({ bills = [], utilities = [], plans = [], installments = [], months = 12, today }) {
  const list = forecastMonths(today, months);
  const first = `${list[0]}-01`, last = lastDay(list.at(-1));
  const rows = new Map(list.map(month => [month, { month, bills: 0, utilities: 0, estimated: 0, installments: 0, total: 0, unknown: 0, items: [] }]));
  const add = (month, part, cents, item) => {
    const row = rows.get(month);
    if (!row) return;
    row[part] += cents; row.total += cents;
    row.items.push({ part, ...item, cents });
  };
  const valid = (bills || []).filter(b => b && ISO.test(b.due_date || '') && toCents(b.amount) !== null);

  // 1. Bollette già registrate (pagate o no: sono le uscite del mese).
  const seenUtility = new Set(), seenSeries = new Set();
  for (const b of valid) {
    const month = b.due_date.slice(0, 7);
    if (!rows.has(month)) continue;
    add(month, 'bills', toCents(b.amount), { label: b.title || b.supplier || '', date: b.due_date, estimate: !!b.is_estimate });
    if (b.utility_id) seenUtility.add(`${b.utility_id}|${month}`);
    seenSeries.add(`${seriesKey(b.supplier, b.title, b.category)}|${month}`);
  }

  // 2. Utenze ricorrenti: le date che il lavoro notturno non ha ancora trasformato in bollette.
  const active = (utilities || []).filter(u => u && u.active !== false && u.frequency && u.frequency !== 'none' && ISO.test(u.next_due_date || ''));
  const utilityIds = new Set(active.map(u => u.id));
  const utilitySeries = new Set(active.map(u => seriesKey(u.supplier, '', u.category)));
  for (const u of active) {
    const cents = toCents(u.estimated_amount);
    if (!cents) continue;
    let date = firstRecurringFrom(u.next_due_date, first, u.frequency, u.billing_day), steps = 0;
    while (date && date <= last && steps < 60) {
      const month = date.slice(0, 7);
      if (!seenUtility.has(`${u.id}|${month}`) && !seenSeries.has(`${seriesKey(u.supplier, '', u.category)}|${month}`)) {
        add(month, 'utilities', cents, { label: `${u.category} · ${u.supplier}`, date, estimate: true });
        seenUtility.add(`${u.id}|${month}`);
      }
      date = nextRecurringDue(date, u.frequency, u.billing_day);
      steps++;
    }
  }

  // 3. Stima dallo storico: bollette che tornano a intervalli regolari senza un'utenza ricorrente.
  // Media delle ultime 6, intervallo medio delle ultime 5; una serie ferma da più di due intervalli
  // (fornitore cambiato, casa venduta) non si stima più.
  const history = new Map();
  for (const b of valid) {
    if (b.due_date >= first || (b.utility_id && utilityIds.has(b.utility_id))) continue;
    const key = seriesKey(b.supplier, b.title, b.category);
    if (utilitySeries.has(key)) continue;
    if (!history.has(key)) history.set(key, []);
    history.get(key).push(b);
  }
  const firstIndex = monthIndex(first);
  for (const [key, items] of history) {
    items.sort((a, b) => a.due_date.localeCompare(b.due_date));
    if (items.length < 2) continue;
    const recent = items.slice(-5).map(b => monthIndex(b.due_date));
    const gaps = recent.slice(1).map((m, i) => m - recent[i]).filter(n => n > 0);
    if (!gaps.length) continue;
    const cadence = Math.max(1, Math.min(24, Math.round(gaps.reduce((s, n) => s + n, 0) / gaps.length)));
    const lastMonth = recent.at(-1);
    if (firstIndex - lastMonth > cadence * 2) continue;
    const lastSix = items.slice(-6);
    const avg = Math.round(lastSix.reduce((s, b) => s + toCents(b.amount), 0) / lastSix.length);
    if (!avg) continue;
    const sample = items.at(-1);
    for (const month of list) {
      const index = monthIndex(`${month}-01`);
      if (index <= lastMonth || (index - lastMonth) % cadence !== 0 || seenSeries.has(`${key}|${month}`)) continue;
      add(month, 'estimated', avg, { label: sample.title || sample.supplier || '', date: null, estimate: true, every: cadence });
    }
  }

  // 4. Rate dei piani in corso; una rata pagata conta quanto si è pagato davvero.
  const open = new Map((plans || []).filter(p => p && (!p.ended_on || p.ended_on >= first)).map(p => [p.id, p]));
  for (const r of installments || []) {
    if (!r || !open.has(r.plan_id) || !ISO.test(r.due_on || '')) continue;
    const month = r.due_on.slice(0, 7);
    if (!rows.has(month)) continue;
    const raw = r.paid_on ? (r.paid_cents ?? r.amount_cents) : r.amount_cents;
    const cents = Number.isInteger(raw) && raw >= 0 ? raw : null;
    const plan = open.get(r.plan_id);
    if (cents === null) { rows.get(month).unknown++; continue; }
    add(month, 'installments', cents, { label: `${plan.title} · ${r.label}`, date: r.due_on, estimate: false });
  }

  const out = list.map(month => {
    const row = rows.get(month);
    row.items.sort((a, b) => b.cents - a.cents || String(a.date || '').localeCompare(String(b.date || '')));
    return row;
  });
  const total = out.reduce((s, r) => s + r.total, 0);
  const peak = out.reduce((best, r) => (r.total > (best?.total ?? -1) ? r : best), null);
  return {
    months: out,
    total,
    average: Math.round(total / out.length),
    peak: peak && peak.total > 0 ? { month: peak.month, total: peak.total } : null,
    unknown: out.reduce((s, r) => s + r.unknown, 0),
    max: Math.max(0, ...out.map(r => r.total)),
    historyRecords: valid.filter(b => b.due_date < first).length,
  };
}
