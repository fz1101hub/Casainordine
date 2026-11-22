// Pure, provider-independent notification copy. The caller must resolve the recipient's
// own language (never the shared home's language) and authorize delivery separately.
// Testi nel dizionario unico (chiavi «server.reminder.*»).
import {translate,normalizeLanguage,formatDate} from './i18n.mjs';
export function billReminderCopy({language='it',name='',dueDate}={}){
 const lang=normalizeLanguage(language),date=formatDate(dueDate,lang);
 if(date==='—')throw new TypeError('Invalid bill due date');
 if(typeof name!=='string')throw new TypeError('Invalid bill name');
 // Bound work before regex normalization and grapheme segmentation; keep the source untouched.
 if(name.length>32768)throw new TypeError('Bill name too long');
 const safeName=name.replace(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g,' ').replace(/[\u0000-\u001f\u007f-\u009f\u00ad\u034f\u061c\u180e\u200b-\u200c\u200e-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/g,' ').replace(/(?<!\p{Extended_Pictographic})\u200d|\u200d(?!\p{Extended_Pictographic})/gu,' ').replace(/\s+/g,' ').trim();
 // Truncate by grapheme clusters to avoid splitting emoji sequences or combining marks.
 // Intl.Segmenter is available in supported runtimes; code-point fallback is safe for surrogate pairs.
 const segments=typeof Intl.Segmenter==='function'
  ? new Intl.Segmenter(lang,{granularity:'grapheme'}).segment(safeName)
  : safeName;
 let limitedName='',count=0;
 for(const part of segments){
  if(count++===160)break;
  limitedName+=typeof part==='string'?part:part.segment;
 }
 limitedName=limitedName.trim();
 if(!limitedName)throw new TypeError('Missing bill name');
 // interpolate usa una funzione come sostituto: «$&», «$$» o «$'» nel nome restano testo.
 return {subject:translate(lang,'server.reminder.subject'),text:translate(lang,'server.reminder.due',{date,name:limitedName})+'\n\n'+translate(lang,'server.reminder.open')};
}
