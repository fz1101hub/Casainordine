// Rate e scadenze (lib/installments.mjs): ogni giorno, quando comincia il preavviso di una rata non
// pagata e il giorno dopo la scadenza se è ancora da pagare, un avviso «installment» per chi l'ha
// scritta o per tutti i membri della casa. Una volta sola per data (user_alerts è unico per persona,
// tipo, voce e data).
import { installmentNotices, INST_LIMITS } from './installments.mjs';
import { addDaysISO as addDays } from './dates.mjs';
import { deliverAlerts } from './extra-alerts.mjs';
import { readAll, readIn } from './batch.mjs';
import { translate, normalizeLanguage, formatDate } from './i18n.mjs';

const MISSING_TABLE = new Set(['42P01', 'PGRST205']);
const clean = value => String(value ?? '').replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁠-⁩﻿]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120).trim();

export function installmentAlertCopy(source, language = 'it') {
  const lang = normalizeLanguage(language), plan = clean(source?.plan), label = clean(source?.label);
  if (!plan || !label || typeof source?.due_on !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(source.due_on)) throw new TypeError('Invalid installment alert');
  const date = formatDate(source.due_on, lang);
  const amount = Number(source.amount_cents) > 0 ? new Intl.NumberFormat(lang === 'en' ? 'en-IE' : lang, { style: 'currency', currency: 'EUR' }).format(Number(source.amount_cents) / 100) : '';
  const key = source.type === 'late' ? 'late' : Number(source.days) === 0 ? 'today' : 'soon';
  return { title: translate(lang, `server.installment.${key}Title`, { plan }),
    body: translate(lang, amount ? `server.installment.${key}Body` : `server.installment.${key}BodyNoAmount`, { label, date, amount, count: Math.max(0, Number(source.days) || 0) }) };
}

export async function processInstallmentAlerts(admin, today, counts, options = {}) {
  let installments, plans;
  try {
    installments = await readAll(admin, 'payment_installments', 'id,plan_id,label,due_on,amount_cents,paid_on',
      q => q.is('paid_on', null).gte('due_on', addDays(today, -INST_LIMITS.lateDays - 1)).lte('due_on', addDays(today, 61)).order('id'));
    plans = installments.length ? await readIn(admin, 'payment_plans', 'id,user_id,home_id,title,remind_days,ended_on', 'id', [...new Set(installments.map(i => i.plan_id))]) : [];
  } catch (error) { if (!MISSING_TABLE.has(error?.code)) counts.errors.push(`Rate: ${error?.message || error}`); return; }
  const entries = installmentNotices(installments, plans, today).map(n => ({ item: { user_id: n.plan.user_id, home_id: n.plan.home_id },
    event: { kind: 'installment', reference_id: n.inst.id, event_date: n.event_date },
    copy: language => installmentAlertCopy({ plan: n.plan.title, label: n.inst.label, due_on: n.inst.due_on, amount_cents: n.inst.amount_cents, days: n.days, type: n.type }, language) }));
  counts.installment_matches = entries.length;
  if (entries.length) await deliverAlerts(admin, entries, counts, { today, label: 'rate', ...options });
}
