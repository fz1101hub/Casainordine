import { extractBillFields } from './document-import.mjs';

// Heuristic to decide whether a second local OCR pass may be useful.
export function ocrFieldsScore(text){
  const x=extractBillFields(text);
  return (x.amount!==null?3:0)+(x.due_date?3:0)+(x.supplier?1:0);
}
// Secondo passaggio anche con una lettura solo discreta (sotto 85): nelle foto piccole o molto
// compresse una cifra si legge male (156,20 → 186,20; € 112,50 → € 11250) e la prima lettura
// sembra completa (tests/bollette-foto.test.mjs, scripts/prove-foto.mjs).
export const OCR_GOOD_CONFIDENCE=85;
export function needsOcrRetry(text,confidence){
  const x=extractBillFields(text);
  return x.amount===null || !x.due_date || (Number.isFinite(confidence)&&confidence<OCR_GOOD_CONFIDENCE);
}
// Le due letture trovano importi o scadenze diversi: i campi vanno ricontrollati.
export function ocrReadingsDisagree(first,second){
  const a=extractBillFields(first?.text||''),b=extractBillFields(second?.text||'');
  return (a.amount!==null&&b.amount!==null&&a.amount!==b.amount)||(Boolean(a.due_date)&&Boolean(b.due_date)&&a.due_date!==b.due_date);
}
export function preferOcrText(first,second){
  const primary=ocrFieldsScore(first.text),alternative=ocrFieldsScore(second.text);
  if(alternative!==primary)return alternative>primary?second:first;
  // Confidence is used only as a tie-breaker, never as payment evidence.
  return (second.confidence||0)>(first.confidence||0)+5?second:first;
}
