// Acquisizione unica (Fase 2, 3.3): una sola azione per foto o PDF. Il documento si legge sul
// dispositivo (lib/document-reader.js); qui si propone dove salvarlo — bolletta, ricevuta di
// pagamento o prova d'acquisto con garanzia — e si preparano i campi. Non scrive nulla: decide
// sempre la persona. Modulo per il browser, senza testi (le etichette sono nel dizionario).
import { normalizeDate, parseMoney } from './dates.mjs';

export const CAPTURE_KINDS = Object.freeze(['bill', 'receipt', 'purchase']);
// Garanzia legale sui beni di consumo in Italia: due anni dalla consegna (Codice del consumo).
export const LEGAL_WARRANTY_YEARS = 2;

const PURCHASE = /(?<![\p{L}])(?:scontrino|documento\s+commerciale|garanzia|prova\s+d['’]acquisto|fattura\s+(?:di\s+)?acquisto|ricevuta\s+d['’]acquisto|numero\s+di\s+serie|n\.?\s*serie|matricola|modello|warranty|proof\s+of\s+purchase|sales\s+receipt|kassenbon|kaufbeleg|garantie|ticket\s+de\s+caisse|garantía|ticket\s+de\s+compra|recibo\s+de\s+compra|talão\s+de\s+compra)(?![\p{L}])/iu;
const BILL = /(?<![\p{L}])(?:totale\s+(?:da\s+)?pagare|importo\s+da\s+pagare|periodo\s+di\s+(?:fatturazione|riferimento)|pod|pdr|lettura|consumi|kwh|smc)(?![\p{L}])/iu;
const DATE = /\b(\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}|\d{4}-\d{2}-\d{2})\b/g;
const SERIAL = /(?:matricola|s\/n|serial(?:\s+number)?|numero\s+di\s+serie|n\.?\s*(?:di\s+)?serie)\s*[:#.]?\s*([A-Z0-9][A-Z0-9-]{4,30})/i;
const MODEL = /(?:modello|model|mod\.)\s*[:#.]?\s*([^\n]{2,60})/i;
// Importo di una ricevuta: «importo», «totale», «pagato» seguito da una cifra con i centesimi.
const PAID_AMOUNT = /(?:importo|totale|pagato|amount|total|betrag|montant|importe|valor)[^\d\n]{0,25}(\d{1,3}(?:[.\s]\d{3})*[.,]\d{2}|\d+[.,]\d{2})/i;
// Data del pagamento: quella vicina a «pagato», «eseguito», «data operazione»; altrimenti la prima data.
const PAID_DATE = /(?:pagat[oa]|pagamento\s+eseguito|eseguit[oa]|addebitat[oa]|data\s+(?:operazione|pagamento|esecuzione|valuta)|paid(?:\s+on)?|payment\s+date|bezahlt|zahlungsdatum|pay[ée]|date\s+de\s+paiement|pagado|fecha\s+de\s+pago|pago\s+em|data\s+de\s+pagamento)[^\d\n]{0,30}(\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}|\d{4}-\d{2}-\d{2})/i;
const REFERENCE = /(?:CRO|TRN|ID\s+transazione|transaction\s+id|codice\s+(?:di\s+)?riferimento|riferimento\s+(?:operazione|pagamento))\s*[:#.]?\s*([A-Z0-9][A-Z0-9-]{5,40})/i;

function firstDate(text) {
  for (const match of String(text || '').matchAll(DATE)) { const iso = normalizeDate(match[1]); if (iso) return iso; }
  return '';
}
export function addYears(iso, years) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return '';
  const [y, m, d] = iso.split('-').map(Number);
  const last = new Date(Date.UTC(y + years, m, 0)).getUTCDate(); // 29 febbraio → 28 febbraio
  return `${y + years}-${String(m).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
}

// Proposta: ricevuta se il lettore delle bollette l'ha riconosciuta come tale; prova d'acquisto se
// ci sono parole d'acquisto e nessun segno di bolletta; altrimenti bolletta.
export function classifyCapture(text, details = {}) {
  const content = String(text || '').slice(0, 20000);
  if (details.documentType === 'ricevuta') return 'receipt';
  if (PURCHASE.test(content) && !BILL.test(content)) return 'purchase';
  return 'bill';
}

export function receiptFields(text, details = {}) {
  const found = String(text || '').match(PAID_AMOUNT)?.[1];
  const amount = details.amount ?? (found ? parseMoney(found) : NaN);
  const paidOn = normalizeDate(String(text || '').match(PAID_DATE)?.[1] || '') || firstDate(text);
  return { paid_on: paidOn, amount: Number.isFinite(amount) && amount > 0 ? amount : '', reference: String(text || '').match(REFERENCE)?.[1] || '' };
}

// Nome dell'oggetto: la riga prima del modello, se è una descrizione (lettere, non una data né
// un'intestazione d'acquisto); altrimenti il modello; altrimenti vuoto (il negozio non è l'oggetto).
function productName(lines, modelIndex) {
  for (let i = modelIndex - 1; i >= 0 && i >= modelIndex - 2; i--) {
    const line = lines[i].trim();
    if (/[\p{L}]{3}/u.test(line) && !DATE_ONLY.test(line) && !PURCHASE.test(line)) return line.slice(0, 80);
  }
  return '';
}
const DATE_ONLY = /^[\s\d\/.\-:]+$/;
export function purchaseFields(text) {
  const content = String(text || '');
  const purchased_on = firstDate(content);
  const lines = content.split(/\r?\n/);
  const modelIndex = lines.findIndex(line => MODEL.test(line));
  const model = modelIndex >= 0 ? lines[modelIndex].match(MODEL)[1].trim().replace(/\s{2,}/g, ' ').slice(0, 60) : '';
  const name = (modelIndex >= 0 ? productName(lines, modelIndex) : '') || model;
  return { name, model, serial_number: content.match(SERIAL)?.[1] || '', purchased_on, warranty_until: addYears(purchased_on, LEGAL_WARRANTY_YEARS) };
}

// Bolletta da collegare a una ricevuta: una sola bolletta non pagata con lo stesso importo
// (al centesimo), meglio se dello stesso fornitore. Se i candidati sono più d'uno, nessuna scelta.
export function matchBill(bills = [], { amount, supplier = '' } = {}) {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) return '';
  const same = bills.filter(b => !b.paid_at && Math.round(Number(b.amount) * 100) === Math.round(value * 100));
  const name = String(supplier).trim().toLowerCase();
  const bySupplier = name ? same.filter(b => String(b.supplier || '').toLowerCase().includes(name) || name.includes(String(b.supplier || '').toLowerCase().trim() || '\u0000')) : [];
  const pick = bySupplier.length === 1 ? bySupplier : same;
  return pick.length === 1 ? pick[0].id : '';
}

// Tutto quello che serve alla finestra di scelta: tipo proposto e campi per ciascuna destinazione.
export function captureProposal(text, details = {}, bills = []) {
  const receipt = receiptFields(text, details);
  return { suggested: classifyCapture(text, details), receipt: { ...receipt, bill_id: matchBill(bills, { amount: receipt.amount, supplier: details.supplier }) },
    purchase: purchaseFields(text) };
}
