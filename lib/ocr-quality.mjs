import { extractBillFields } from './document-import.mjs';

// Heuristic to decide whether a second local OCR pass may be useful.
export function ocrFieldsScore(text){
  const x=extractBillFields(text);
  return (x.amount!==null?3:0)+(x.due_date?3:0)+(x.supplier?1:0);
}
export function needsOcrRetry(text,confidence){
  const x=extractBillFields(text);
  return x.amount===null || !x.due_date || (Number.isFinite(confidence)&&confidence<45);
}
export function preferOcrText(first,second){
  const primary=ocrFieldsScore(first.text),alternative=ocrFieldsScore(second.text);
  if(alternative!==primary)return alternative>primary?second:first;
  // Confidence is used only as a tie-breaker, never as payment evidence.
  return (second.confidence||0)>(first.confidence||0)+5?second:first;
}
