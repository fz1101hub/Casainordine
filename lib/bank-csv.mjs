// Estratti conto in CSV (scelta dell'utente, 24 novembre 2026): i file scaricati dalla banca o da
// PayPal hanno colonne «Data», «Descrizione», «Importo» (negativo per le uscite) oppure «Entrate» e
// «Uscite», righe di intestazione prima della tabella, separatori e codifiche diversi. Prima il
// caricamento rispondeva soltanto «mancano le colonne Importo e Scadenza».
// Dall'estratto conto si prendono solo i pagamenti di bollette: quelli che corrispondono a una
// bolletta da pagare la segnano pagata, gli altri diventano bollette già pagate (storico). I
// movimenti che non sono bollette (spesa, stipendio, bonifici a persone) non si importano.
import { normalizeDate, parseMoney } from './dates.mjs';
import { matchOutstandingBill, supplierMatches } from './payment-recognition.mjs';

// Testo del file: UTF-8 (con o senza BOM) oppure Windows-1252, la codifica dei CSV salvati da Excel
// in italiano e di molte banche («Società», «Comunità» diventavano «Soci�t�»).
export function decodeCsvBytes(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^﻿/, ''); }
  catch { return new TextDecoder('windows-1252').decode(bytes); }
}

// Righe e campi con il separatore più frequente fra ; , e tabulazione (contato fuori dalle virgolette).
export function splitCsv(text) {
  const sample = text.split(/\r?\n/).slice(0, 40).join('\n').replace(/"[^"]*"/g, '');
  const counts = [';', ',', '\t'].map(d => [d, sample.split(d).length]);
  const delimiter = counts.sort((a, b) => b[1] - a[1])[0][0];
  const rows = []; let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') { if (quoted && text[i + 1] === '"') { field += '"'; i++; } else quoted = !quoted; }
    else if (c === delimiter && !quoted) { row.push(field); field = ''; }
    else if ((c === '\n' || c === '\r') && !quoted) { if (c === '\r' && text[i + 1] === '\n') i++; row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  row.push(field); rows.push(row);
  return rows.map(r => r.map(v => v.trim())).filter(r => r.some(Boolean));
}

const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[_\-]+/g, ' ').replace(/\s+/g, ' ').trim();
const COLUMNS = {
  date: ['data', 'data contabile', 'data operazione', 'data registrazione', 'data movimento', 'data valuta', 'date', 'booking date', 'completed date', 'started date', 'data dell operazione'],
  description: ['descrizione', 'descrizione operazione', 'descrizione operazioni', 'descrizione completa', 'dettagli', 'operazione', 'causale', 'description', 'payee', 'nome', 'beneficiario', 'payment reference', 'tipo', 'merchant', 'controparte'],
  amount: ['importo', 'importo (eur)', 'importo eur', 'importo in euro', 'amount', 'amount (eur)', 'lordo', 'valore', 'importo operazione'],
  debit: ['uscite', 'addebiti', 'addebito', 'dare', 'debit', 'debito'],
  credit: ['entrate', 'accrediti', 'accredito', 'avere', 'credit', 'credito'],
  status: ['stato', 'state', 'status'],
};
const DATE_RANK = COLUMNS.date; // «Data contabile» prima di «Data valuta»
const DONE = /^(?:completat[ao]|completed|eseguit[ao]|contabilizzat[ao]|booked|cleared)$/;

// Importo con segno: «-87,50», «87,50-», «(87,50)», «-87.50», «€ -1.234,56».
export function signedAmount(raw) {
  let s = String(raw || '').replace(/[€\s]|EUR/gi, '');
  if (!s) return NaN;
  let negative = false;
  if (/^\(.*\)$/.test(s)) { negative = true; s = s.slice(1, -1); }
  if (/^[-−]/.test(s)) { negative = true; s = s.slice(1); }
  if (/-$/.test(s)) { negative = true; s = s.slice(0, -1); }
  if (/^\+/.test(s)) s = s.slice(1);
  const value = parseMoney(s);
  return Number.isFinite(value) ? (negative ? -value : value) : NaN;
}
function bankDate(raw) {
  const s = String(raw || '').trim().split(/[ T]/)[0];
  return normalizeDate(s) || normalizeDate(s.replace(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2})$/, (all, d, m, y) => `${d}/${m}/20${y}`));
}

// null se il file non sembra un estratto conto; altrimenti le uscite (importo positivo).
export function parseBankStatement(text) {
  const rows = splitCsv(text);
  for (let h = 0; h < Math.min(rows.length, 30); h++) {
    const head = rows[h].map(norm);
    const find = list => { for (const name of list) { const i = head.indexOf(norm(name)); if (i >= 0) return i; } return -1; };
    const date = find(DATE_RANK), amount = find(COLUMNS.amount), debit = find(COLUMNS.debit), credit = find(COLUMNS.credit), status = find(COLUMNS.status);
    const descriptions = head.map((name, i) => (COLUMNS.description.map(norm).includes(name) ? i : -1)).filter(i => i >= 0);
    if (date < 0 || !descriptions.length || (amount < 0 && debit < 0)) continue;
    const out = [];
    let credits = 0, ignored = 0;
    for (const row of rows.slice(h + 1)) {
      const day = bankDate(row[date]);
      if (!day) { ignored++; continue; }
      if (status >= 0 && row[status] && !DONE.test(norm(row[status]))) { ignored++; continue; }
      let value = NaN;
      if (debit >= 0 && row[debit]) value = -Math.abs(signedAmount(row[debit]));
      else if (credit >= 0 && row[credit]) value = Math.abs(signedAmount(row[credit]));
      else if (amount >= 0) value = signedAmount(row[amount]);
      if (!Number.isFinite(value) || value === 0) { ignored++; continue; }
      if (value > 0) { credits++; continue; }
      const description = [...new Set(descriptions.map(i => row[i]).filter(Boolean))].join(' · ').replace(/\s+/g, ' ').slice(0, 300);
      out.push({ date: day, amount: Math.round(-value * 100) / 100, description });
    }
    return { rows: out, credits, ignored };
  }
  return null;
}

// Fornitori comuni: nome da mostrare e categoria. La categoria si corregge con le parole del movimento.
const SUPPLIERS = [
  [/\benel\b/i, 'Enel Energia', 'Luce'], [/\beni\b|plenitude/i, 'Eni Plenitude', 'Gas'], [/\ba2a\b/i, 'A2A Energia', 'Luce'],
  [/\biren\b/i, 'Iren', 'Luce'], [/\bhera\b/i, 'Hera', 'Luce'], [/\bacea\b/i, 'Acea', 'Luce'], [/\bedison\b/i, 'Edison', 'Luce'],
  [/\bsorgenia\b/i, 'Sorgenia', 'Luce'], [/\bengie\b/i, 'Engie', 'Gas'], [/\billumia\b/i, 'Illumia', 'Luce'], [/\biberdrola\b/i, 'Iberdrola', 'Luce'],
  [/\boctopus\b/i, 'Octopus Energy', 'Luce'], [/\be\.?on\b/i, 'E.ON', 'Luce'], [/\bestra\b/i, 'Estra', 'Gas'], [/\bhera\s*comm\b/i, 'Hera Comm', 'Luce'],
  [/\btim\b|telecom italia/i, 'TIM', 'Internet'], [/\bvodafone\b/i, 'Vodafone', 'Internet'], [/wind\s*tre|\bwindtre\b/i, 'WindTre', 'Telefono'],
  [/\bfastweb\b/i, 'Fastweb', 'Internet'], [/\biliad\b/i, 'Iliad', 'Telefono'], [/\btiscali\b/i, 'Tiscali', 'Internet'], [/\bsky\b/i, 'Sky', 'Internet'],
  [/\bsmat\b/i, 'SMAT', 'Acqua'], [/acquedotto|publiacqua|abbanoa|\bgori\b|metropolitana milanese|\bmm spa\b|acque\b/i, null, 'Acqua'],
  [/condomin/i, null, 'Condominio'], [/\btari\b|tassa rifiuti|\bamsa\b|rifiuti/i, null, 'Rifiuti'],
];
// Pagamenti con carta, prelievi e carburante non sono bollette (per esempio «POS ENI STATION»),
// a meno che non corrispondano esattamente a una bolletta da pagare.
const NOT_BILL = /\b(?:pos|pagamento\s+(?:con\s+)?carta|carta\s+(?:n|di\s+credito|di\s+debito)|prelievo|atm|bancomat|apple\s*pay|google\s*pay|station|stazione|carburant|rifornimento|ricarica\s+(?:auto|veicolo)|enel\s*x)\b/i;
const BILL_HINT = /\b(?:addebito\s+(?:diretto|sdd|sepa)|sdd\b|sepa\s+direct\s+debit|direct\s+debit|bollett|utenz|fattura|pagopa|bollettino|cbill|\brid\b)/i;
function categoryHint(text, fallback) {
  const t = text.toLowerCase();
  if (/\b(?:energia elettrica|luce)\b/.test(t)) return 'Luce';
  if (/\b(?:gas|metano)\b/.test(t)) return 'Gas';
  if (/\b(?:acqua|idric)/.test(t)) return 'Acqua';
  if (/\b(?:fibra|adsl|internet)\b/.test(t)) return 'Internet';
  if (/\b(?:tari|rifiuti)\b/.test(t)) return 'Rifiuti';
  if (/condomin/.test(t)) return 'Condominio';
  if (/\b(?:mutuo|affitto|canone\s+locazione)\b/.test(t)) return 'Affitto / Mutuo';
  if (/\b(?:assicuraz|polizza)/.test(t)) return 'Assicurazione';
  return fallback || 'Altro';
}
// Nome del fornitore da un movimento senza fornitore noto: la parte della descrizione che non è il
// tipo di operazione, senza «Bonifico a», «Addebito SDD» e senza la causale dopo « - ».
const GENERIC = /^(?:bonifico(?:\s+sepa)?(?:\s+in\s+uscita)?|addebito(?:\s+diretto)?(?:\s+(?:sdd|sepa))?|sepa\s+direct\s+debit|direct\s+debit|outgoing\s+transfer|transfer|pagamento(?:\s+(?:bollettino|preautorizzato|inviato))?)$/i;
const PREFIX = /^(?:addebito\s+(?:diretto\s+)?(?:sdd|sepa)|bonifico(?:\s+sepa)?(?:\s+a\s+favore\s+di|\s+a)?|pagamento\s+bollettino|bollettino|sdd)\b\s*[:\-]?\s*/i;
function supplierName(description) {
  const parts = description.split(' · ').map(p => p.trim()).filter(p => p && !GENERIC.test(p));
  const pick = parts.find(p => SUPPLIERS.some(([re]) => re.test(p)) || BILL_HINT.test(p)) || parts[0] || description;
  return pick.replace(PREFIX, '').replace(/^a\s+/i, '').split(/\s+-\s+/)[0].trim().slice(0, 80);
}
// Impronta stabile del movimento (stesso file caricato due volte: nessun doppione).
function fingerprint(row) {
  let h = 0x811c9dc5;
  for (const ch of `${row.date}|${row.amount.toFixed(2)}|${norm(row.description)}`) { h ^= ch.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  return `bank:${row.date}:${h.toString(16).padStart(8, '0')}`;
}

// bills: tutte le bollette dello spazio (anche pagate: una ricevuta vecchia non chiude quella nuova).
// already: movimenti già presenti (stesso file caricato di nuovo, bolletta già segnata pagata) o con
// più bollette compatibili: non si aggiungono, altrimenti la stessa bolletta comparirebbe due volte.
export function billPaymentsFromBank(statement, bills) {
  const paid = [], added = [], used = new Set(), ids = new Set((bills || []).map(b => b.external_id).filter(Boolean));
  let skipped = 0, already = 0;
  const day = iso => Date.parse(`${iso}T12:00:00Z`);
  for (const row of statement?.rows || []) {
    const evidence = { amount: row.amount, receivedAt: `${row.date}T12:00:00Z`, subject: row.description, text: '', sender: '' };
    const bill = matchOutstandingBill(evidence, (bills || []).filter(b => !used.has(b.id)));
    if (bill) { used.add(bill.id); paid.push({ bill, row }); continue; }
    const cents = Math.round(row.amount * 100);
    const compatible = (bills || []).some(b => Math.round(Number(b.amount) * 100) === cents && Math.abs(day(b.due_date) - day(row.date)) <= 90 * 86_400_000
      && supplierMatches(b.supplier, { subject: row.description }));
    if (ids.has(fingerprint(row)) || compatible) { already++; continue; }
    const known = SUPPLIERS.find(([re]) => re.test(row.description));
    if (NOT_BILL.test(row.description) || (!known && !BILL_HINT.test(row.description))) { skipped++; continue; }
    const supplier = known?.[1] || supplierName(row.description);
    added.push({ supplier, category: categoryHint(row.description, known?.[2]), amount: row.amount, due_date: row.date,
      paid_at: `${row.date}T12:00:00.000Z`, is_estimate: false, source: 'csv', external_id: fingerprint(row), description: row.description });
  }
  return { paid, added, skipped, already };
}
