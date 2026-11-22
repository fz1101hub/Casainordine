import { normalizeDate, parseMoney } from './dates.mjs';
import { appError } from './friendly-error.mjs';

function parseRows(text, delimiter) {
  const rows = []; let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') { field += '"'; i++; }
      else quoted = !quoted;
    } else if (c === delimiter && !quoted) {
      row.push(field); field = '';
    } else if ((c === '\n' || c === '\r') && !quoted) {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); if (row.some(v => v.trim())) rows.push(row);
      row = []; field = '';
    } else field += c;
  }
  if (quoted) throw appError('csv.unclosedQuote');
  row.push(field); if (row.some(v => v.trim())) rows.push(row);
  return rows;
}

// Nomi delle colonne riconosciuti nelle 6 lingue dell'app (il modello scaricabile usa quelli della lingua scelta).
const alias = {
  title: ['titolo', 'descrizione', 'voce', 'title', 'description', 'descripción', 'título', 'concepto', 'titre', 'libellé', 'beschreibung', 'titel', 'bezeichnung', 'descrição'],
  supplier: ['fornitore', 'gestore', 'supplier', 'proveedor', 'fournisseur', 'anbieter', 'lieferant', 'fornecedor'],
  amount: ['importo', 'totale', 'amount', 'euro', 'importe', 'total', 'montant', 'betrag', 'valor', 'montante'],
  due_date: ['scadenza', 'data scadenza', 'data_scadenza', 'due_date', 'vencimiento', 'fecha de vencimiento', 'échéance', 'date d’échéance', "date d'échéance", 'fälligkeit', 'fällig am', 'fälligkeitsdatum', 'vencimento', 'data de vencimento'],
  category: ['categoria', 'tipo', 'category', 'categoría', 'catégorie', 'kategorie'],
  status: ['stato', 'pagato', 'status', 'estado', 'statut']
};
const PAID = ['sì', 'si', 'true', '1', 'pagato', 'pagata', 'paid', 'yes', 'pagado', 'pagada', 'payé', 'payée', 'oui', 'bezahlt', 'ja', 'pago', 'paga', 'sim'];
function norm(x) { return x.toLowerCase().trim().replace(/^\uFEFF/, '').replace(/[_-]+/g,' ').replace(/\s+/g,' '); }
// errors: {key, params} del dizionario; title vuoto se manca (lo propone chi importa, nella sua lingua).
export function parseBillsCsv(text) {
  const first = text.split(/\r?\n/, 1)[0] || '';
  const delimiter = (first.match(/;/g) || []).length >= (first.match(/,/g) || []).length ? ';' : ',';
  const rows = parseRows(text, delimiter);
  if (rows.length < 2) throw appError('csv.empty');
  const headers = rows.shift().map(norm);
  // Aliases go through the same normalization as headers: "due_date" and "Due-Date" both become "due date".
  const idx = Object.fromEntries(Object.entries(alias).map(([key, options]) => [key, headers.findIndex(h => options.map(norm).includes(h))]));
  if (idx.amount < 0 || idx.due_date < 0) throw appError('csv.columnsRequired');
  const bills = [], errors = [];
  rows.forEach((row, i) => {
    const get = key => idx[key] < 0 ? '' : String(row[idx[key]] || '').trim();
    const amount = parseMoney(get('amount')), due_date = normalizeDate(get('due_date'));
    if (!Number.isFinite(amount) || amount <= 0 || !due_date) { errors.push({ key: 'csv.rowInvalid', params: { row: i + 2 } }); return; }
    const status = norm(get('status'));
    bills.push({ title: get('title'),
      supplier: get('supplier'), category: get('category') || 'Altro',
      amount, due_date, paid_at: PAID.includes(status) ? new Date().toISOString() : null,
      is_estimate: false, source: 'csv' });
  });
  return { bills, errors };
}
