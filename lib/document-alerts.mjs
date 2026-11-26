// Documenti di famiglia (lib/family-documents.mjs): ogni giorno, quando comincia il preavviso per
// il rinnovo e il giorno dopo la scadenza, un avviso «document» per chi li ha scritti o per tutti i
// membri della casa. Una volta sola per data (user_alerts è unico per persona, tipo, voce e data):
// se si cambia la scadenza dopo il rinnovo, gli avvisi ripartono dalla nuova data.
import { documentNotices, DOC_LIMITS } from './family-documents.mjs';
import { addDaysISO as addDays } from './dates.mjs';
import { deliverAlerts } from './extra-alerts.mjs';
import { readAll } from './batch.mjs';
import { translate, normalizeLanguage, formatDate } from './i18n.mjs';

// Tabella non ancora creata (migrate_v63 non eseguita): niente da fare, nessun errore.
const MISSING_TABLE = new Set(['42P01', 'PGRST205']);
const clean = value => String(value ?? '').replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁠-⁩﻿]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80).trim();

// Testo dell'avviso nella lingua di chi lo riceve.
export function documentAlertCopy(source, language = 'it') {
  const lang = normalizeLanguage(language), holder = clean(source?.holder), label = clean(source?.label);
  if (!holder || typeof source?.expires_on !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(source.expires_on)) throw new TypeError('Invalid document alert');
  const date = formatDate(source.expires_on, lang);
  const what = label || translate(lang, 'iddocs.kind.' + (source.kind || 'other'));
  const days = Math.max(0, Number(source.days) || 0);
  return source.type === 'expired'
    ? { title: translate(lang, 'server.document.expiredTitle', { what, holder }), body: translate(lang, 'server.document.expiredBody', { date }) }
    : { title: translate(lang, 'server.document.renewTitle', { what, holder }), body: translate(lang, 'server.document.renewBody', { date, days }) };
}

export async function processDocumentAlerts(admin, today, counts, options = {}) {
  let docs;
  try {
    docs = await readAll(admin, 'family_documents', 'id,user_id,home_id,holder,kind,label,expires_on,notice_days',
      q => q.gte('expires_on', addDays(today, -DOC_LIMITS.expiredDays - 1)).lte('expires_on', addDays(today, 365)).order('id'));
  } catch (error) { if (!MISSING_TABLE.has(error?.code)) counts.errors.push(`Documenti: ${error?.message || error}`); return; }
  const entries = documentNotices(docs || [], today).map(n => ({ item: { user_id: n.doc.user_id, home_id: n.doc.home_id },
    event: { kind: 'document', reference_id: n.doc.id, event_date: n.event_date },
    copy: language => documentAlertCopy({ holder: n.doc.holder, kind: n.doc.kind, label: n.doc.label, expires_on: n.doc.expires_on, days: n.days, type: n.type }, language) }));
  counts.document_matches = entries.length;
  if (entries.length) await deliverAlerts(admin, entries, counts, { today, label: 'documenti', ...options });
}
