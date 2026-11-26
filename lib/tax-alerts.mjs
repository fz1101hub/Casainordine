// Scadenze fiscali di famiglia (lib/tax-calendar.mjs): ogni giorno, quando comincia il preavviso di
// una scadenza seguita e non ancora segnata come fatta, un avviso «tax» per chi l'ha scelta o per
// tutti i membri della casa. Una volta sola per scadenza (user_alerts è unico per persona, tipo,
// voce e data).
import { taxNotices } from './tax-calendar.mjs';
import { deliverAlerts } from './extra-alerts.mjs';
import { readAll } from './batch.mjs';
import { translate, normalizeLanguage, formatDate } from './i18n.mjs';

const MISSING_TABLE = new Set(['42P01', 'PGRST205']);

export function taxAlertCopy(source, language = 'it') {
  const lang = normalizeLanguage(language);
  if (typeof source?.key !== 'string' || typeof source?.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(source.date)) throw new TypeError('Invalid tax alert');
  const what = translate(lang, `taxes.cal.deadline.${source.key}`, { year: source.year });
  const date = formatDate(source.date, lang), days = Math.max(0, Number(source.days) || 0);
  return { title: translate(lang, 'server.tax.title', { what }),
    body: translate(lang, days === 0 ? 'server.tax.today' : 'server.tax.soon', { date, count: days }) + ' ' + translate(lang, `taxes.cal.hint.${source.key}`) };
}

export async function processTaxAlerts(admin, today, counts, options = {}) {
  let rows;
  try { rows = await readAll(admin, 'tax_calendar_settings', 'id,user_id,home_id,groups,remind_days,done', q => q.order('id')); }
  catch (error) { if (!MISSING_TABLE.has(error?.code)) counts.errors.push(`Scadenze fiscali: ${error?.message || error}`); return; }
  const entries = [];
  for (const row of rows) {
    for (const n of taxNotices(row, today)) entries.push({ item: { user_id: row.user_id, home_id: row.home_id },
      event: { kind: 'tax', reference_id: row.id, event_date: n.date },
      copy: language => taxAlertCopy({ key: n.key, year: n.year, date: n.date, days: n.days }, language) });
  }
  counts.tax_matches = entries.length;
  if (entries.length) await deliverAlerts(admin, entries, counts, { today, label: 'scadenze fiscali', ...options });
}
