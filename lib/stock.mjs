// Scorte domestiche (Fase 2, 3.3): cosa c'è in casa, sotto quale soglia ricomprarlo e quanto se ne
// compra di solito. Quando una scorta scende alla soglia l'app propone di metterla nella lista della
// spesa: la aggiunge solo chi preme il pulsante (niente aggiunte silenziose).
// Modulo senza testi: le unità sono chiavi («stock.unit.<chiave>»).

export const STOCK_UNITS = Object.freeze(['pcs', 'pack', 'roll', 'kg', 'g', 'l', 'ml']);
export const STOCK_LIMITS = Object.freeze({ name: 120, location: 60, maxQuantity: 100000, perSpace: 300 });

const clean = (value, max) => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const round2 = n => Math.round(n * 100) / 100;
const amount = value => {
  if (value === '' || value === null || value === undefined) return NaN;
  const n = Number(String(value).replace(',', '.'));
  return Number.isFinite(n) ? round2(n) : NaN;
};

// Controlla e ripulisce una scorta; {value} oppure {error:'stock.error.*'}.
export function normalizeStockItem(input = {}) {
  const name = clean(input.name, STOCK_LIMITS.name);
  if (name.length < 2) return { error: 'stock.error.name' };
  const unit = STOCK_UNITS.includes(input.unit) ? input.unit : 'pcs';
  const quantity = amount(input.quantity ?? 0);
  if (!(quantity >= 0 && quantity <= STOCK_LIMITS.maxQuantity)) return { error: 'stock.error.quantity' };
  const threshold = amount(input.threshold ?? 0);
  if (!(threshold >= 0 && threshold <= STOCK_LIMITS.maxQuantity)) return { error: 'stock.error.threshold' };
  const usualBuy = amount(input.usual_buy ?? 1);
  if (!(usualBuy > 0 && usualBuy <= STOCK_LIMITS.maxQuantity)) return { error: 'stock.error.buy' };
  return { value: { name, unit, quantity, threshold, usual_buy: usualBuy, location: clean(input.location, STOCK_LIMITS.location) } };
}

// out: finita; low: alla soglia o sotto; ok: c'è.
export function stockStatus(item) {
  const quantity = Number(item.quantity) || 0;
  if (quantity <= 0) return 'out';
  return quantity <= (Number(item.threshold) || 0) ? 'low' : 'ok';
}

// Di quanto cambia un tocco su − o +: un pezzo, mezzo chilo o litro, 100 grammi o millilitri.
export function stepFor(unit) {
  return unit === 'kg' || unit === 'l' ? 0.5 : unit === 'g' || unit === 'ml' ? 100 : 1;
}
export function adjustQuantity(quantity, delta) {
  return Math.min(STOCK_LIMITS.maxQuantity, Math.max(0, round2((Number(quantity) || 0) + delta)));
}

// Stesso prodotto nella lista della spesa: maiuscole, accenti e spazi non contano.
export const titleKey = text => String(text ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

// Proposta per la lista della spesa: le scorte finite o sotto soglia (prima le finite), con
// l'indicazione di quelle già in lista da comprare.
export function shoppingProposal(items = [], shoppingTitles = []) {
  const inList = new Set(shoppingTitles.map(titleKey));
  const order = { out: 0, low: 1 };
  return items.filter(item => stockStatus(item) !== 'ok')
    .map(item => ({ item, status: stockStatus(item), inList: inList.has(titleKey(item.name)) }))
    .sort((a, b) => order[a.status] - order[b.status] || a.item.name.localeCompare(b.item.name));
}

// Riordino: dall'alto le scorte da ricomprare, poi le altre in ordine di nome.
export function sortStock(items = []) {
  const order = { out: 0, low: 1, ok: 2 };
  return [...items].sort((a, b) => order[stockStatus(a)] - order[stockStatus(b)] || a.name.localeCompare(b.name));
}
