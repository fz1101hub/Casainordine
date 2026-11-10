import { normalizeDate, parseMoney } from './dates.mjs';

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
  if (quoted) throw new Error('CSV: virgolette non chiuse');
  row.push(field); if (row.some(v => v.trim())) rows.push(row);
  return rows;
}

const alias = {
  title: ['titolo', 'descrizione', 'voce', 'title'],
  supplier: ['fornitore', 'gestore', 'supplier'],
  amount: ['importo', 'totale', 'amount', 'euro'],
  due_date: ['scadenza', 'data scadenza', 'data_scadenza', 'due_date'],
  category: ['categoria', 'tipo', 'category'],
  status: ['stato', 'pagato', 'status']
};
function norm(x) { return x.toLowerCase().trim().replace(/^\uFEFF/, '').replace(/[_-]+/g,' ').replace(/\s+/g,' '); }
export function parseBillsCsv(text) {
  const first = text.split(/\r?\n/, 1)[0] || '';
  const delimiter = (first.match(/;/g) || []).length >= (first.match(/,/g) || []).length ? ';' : ',';
  const rows = parseRows(text, delimiter);
  if (rows.length < 2) throw new Error('CSV vuoto o senza righe');
  const headers = rows.shift().map(norm);
  // Aliases go through the same normalization as headers: "due_date" and "Due-Date" both become "due date".
  const idx = Object.fromEntries(Object.entries(alias).map(([key, options]) => [key, headers.findIndex(h => options.map(norm).includes(h))]));
  if (idx.amount < 0 || idx.due_date < 0) throw new Error('Sono necessarie le colonne importo e scadenza');
  const bills = [], errors = [];
  rows.forEach((row, i) => {
    const get = key => idx[key] < 0 ? '' : String(row[idx[key]] || '').trim();
    const amount = parseMoney(get('amount')), due_date = normalizeDate(get('due_date'));
    if (!Number.isFinite(amount) || amount <= 0 || !due_date) { errors.push(`Riga ${i + 2}: importo o data non validi`); return; }
    const status = norm(get('status'));
    bills.push({ title: get('title') || `Bolletta ${get('supplier') || 'casa'}`,
      supplier: get('supplier'), category: get('category') || 'Altro',
      amount, due_date, paid_at: ['sì','si','true','1','pagato','pagata','paid','yes'].includes(status) ? new Date().toISOString() : null,
      is_estimate: false, source: 'csv' });
  });
  return { bills, errors };
}
