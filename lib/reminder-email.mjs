// Email dei promemoria e dei riepiloghi, con Resend (scelta dell'utente «Email dei promemoria più
// complete», 23 novembre 2026). Ogni email ha:
// - una versione HTML (documento completo, lingua dichiarata, larghezza massima 560 px, colori
//   leggibili) e una versione solo testo con gli stessi contenuti;
// - in fondo il motivo per cui arriva e un collegamento per smettere di riceverla;
// - le intestazioni List-Unsubscribe e List-Unsubscribe-Post (RFC 8058), con cui Gmail, Outlook e
//   Apple Mail mostrano «Annulla iscrizione» e disiscrivono con un clic.
// Il collegamento porta a /api/email/unsubscribe con un codice firmato (lib/email-unsubscribe.mjs):
// spegne solo quel tipo di email, solo per quella persona.
// I dati dell'utente (titoli, fornitori) sono sempre convertiti nell'HTML.
import { createHash } from 'node:crypto';
import { publicAppUrl } from './server.mjs';
import { billReminderCopy } from './notification-copy.mjs';
import { billSummaryCopy } from './notification-summary.mjs';
import { translate, normalizeLanguage } from './i18n.mjs';
import { unsubscribeUrl } from './email-unsubscribe.mjs';

const htmlEscape = text => String(text || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Documento HTML comune: corpo, pulsante verso l'app, piè con motivo e disiscrizione.
function layout({ lang, title, body, button, appUrl, why, stopLabel, stopUrl }) {
  const settings = translate(lang, 'server.email.settings');
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${htmlEscape(title)}</title></head>`
    + `<body style="margin:0;padding:0;background:#f4f7f5"><div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;padding:24px 18px;color:#24323a;font-size:16px;line-height:1.5">`
    + `<p style="margin:0 0 16px;font-weight:bold;color:#16776b">Casa in Ordine</p>${body}`
    + `<p style="margin:24px 0"><a href="${htmlEscape(appUrl)}" style="display:inline-block;background:#156e65;color:#ffffff;padding:12px 18px;border-radius:9px;text-decoration:none;font-weight:bold">${htmlEscape(button)}</a></p>`
    + `<hr style="border:0;border-top:1px solid #d8e2dc;margin:24px 0 12px">`
    + `<p style="margin:0 0 6px;font-size:13px;color:#4d5d56">${htmlEscape(why)} ${htmlEscape(settings)}</p>`
    + `<p style="margin:0;font-size:13px"><a href="${htmlEscape(stopUrl)}" style="color:#24323a">${htmlEscape(stopLabel)}</a></p>`
    + `</div></body></html>`;
}

const footerText = (lang, kind, stopUrl) => `\n\n—\n${translate(lang, `server.email.why.${kind}`)} ${translate(lang, 'server.email.settings')}\n${translate(lang, `server.email.stop.${kind}`)}: ${stopUrl}`;
const unsubscribeHeaders = stopUrl => ({ 'List-Unsubscribe': `<${stopUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' });

// Contenuto del promemoria (senza invio): usato da emailReminder e dalle prove.
export function reminderEmail({ language = 'it', bill, appUrl = publicAppUrl(), userId }) {
  const lang = normalizeLanguage(language);
  const copy = billReminderCopy({ language: lang, name: bill.title, dueDate: bill.due_date });
  const stopUrl = unsubscribeUrl(appUrl, userId, 'reminder', lang);
  const subject = `Casa in Ordine · ${copy.subject}`;
  const [main, open] = copy.text.split('\n\n');
  const body = `<p style="margin:0 0 12px;font-size:18px">${htmlEscape(main)}</p><p style="margin:0">${htmlEscape(open || '')}</p>`;
  return {
    subject,
    html: layout({ lang, title: subject, body, button: translate(lang, 'server.summary.open'), appUrl, why: translate(lang, 'server.email.why.reminder'), stopLabel: translate(lang, 'server.email.stop.reminder'), stopUrl }),
    text: `${copy.text}\n\n${appUrl}${footerText(lang, 'reminder', stopUrl)}`,
    headers: unsubscribeHeaders(stopUrl),
  };
}

// Contenuto del riepilogo (senza invio).
export function summaryEmail({ language = 'it', bills, today, appUrl = publicAppUrl(), userId }) {
  const lang = normalizeLanguage(language);
  const copy = billSummaryCopy({ language: lang, today, bills });
  const stopUrl = unsubscribeUrl(appUrl, userId, 'summary', lang);
  const subject = `Casa in Ordine · ${copy.subject}`;
  const rows = copy.rows.map(b => `<li style="margin:0 0 8px"><b>${htmlEscape(b.title)}</b> (${htmlEscape(b.supplier)})<br>${htmlEscape(b.date)} — ${htmlEscape(b.amount)}</li>`).join('');
  const body = `<h1 style="margin:0 0 8px;font-size:20px">${htmlEscape(copy.heading)}</h1><p style="margin:0 0 12px">${htmlEscape(copy.description)}</p><ul style="margin:0;padding-left:20px">${rows}</ul>`;
  const lines = copy.rows.map(b => `- ${b.title} (${b.supplier}) — ${b.date} — ${b.amount}`).join('\n');
  return {
    subject,
    html: layout({ lang, title: subject, body, button: copy.openLabel, appUrl, why: translate(lang, 'server.email.why.summary'), stopLabel: translate(lang, 'server.email.stop.summary'), stopUrl }),
    text: `${copy.heading}\n${copy.description}\n\n${lines}\n\n${copy.openLabel}: ${appUrl}${footerText(lang, 'summary', stopUrl)}`,
    headers: unsubscribeHeaders(stopUrl),
  };
}

// A blocchi: fino a 100 email per chiamata (/emails/batch di Resend). Con centinaia di persone
// un'email per chiamata superava sia il minuto concesso al lavoro notturno sia il limite di Resend
// (pochi invii al secondo, poi errore 429). Restituisce un esito per email, nello stesso ordine.
// - Idempotency-Key: se la stessa chiamata viene ripetuta, Resend non manda due volte;
// - 429: si aspetta quanto chiede Resend (al massimo 5 s) e si riprova, fino a 2 volte;
// - blocco rifiutato per altri motivi (per esempio un indirizzo non valido): si riprova email per
//   email, così le altre partono lo stesso.
export async function sendEmailBatch(messages, { wait = ms => new Promise(done => setTimeout(done, ms)) } = {}) {
  const apiKey = process.env.RESEND_API_KEY, from = process.env.RESEND_FROM;
  if (!apiKey || !from) return messages.map(() => ({ skipped: true }));
  const results = [];
  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100);
    const body = chunk.map(m => ({ from, to: m.to, subject: m.subject, html: m.html, text: m.text, headers: m.headers }));
    const key = 'casa-' + createHash('sha256').update(JSON.stringify(body.map(b => [b.to, b.subject, b.text]))).digest('hex').slice(0, 48);
    let outcome = null;
    for (let attempt = 0; attempt < 3 && !outcome; attempt++) {
      let response;
      try {
        response = await fetch('https://api.resend.com/emails/batch', { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': key }, body: JSON.stringify(body) });
      } catch { break; }
      if (response.ok) { outcome = chunk.map(() => ({ sent: true })); break; }
      if (response.status !== 429 || attempt === 2) break;
      await wait(Math.min(5, Number(response.headers.get('retry-after')) || 1) * 1000);
    }
    if (!outcome) {
      outcome = [];
      for (const message of chunk) {
        try { outcome.push(await send(message.to, message)); }
        catch (e) { outcome.push({ error: String(e.message).slice(0, 150) }); }
      }
    }
    results.push(...outcome);
  }
  return results;
}

// Prepara e manda a blocchi promemoria e riepiloghi; un'email che non si può preparare (dati non
// validi) ha il suo errore e non ferma le altre.
async function buildAndSend(items, build) {
  const built = items.map(item => { try { return build(item); } catch (e) { return { error: String(e.message).slice(0, 150) }; } });
  const ready = built.filter(b => !b.error);
  const sent = await sendEmailBatch(ready);
  let k = 0;
  return built.map(b => (b.error ? { error: b.error } : sent[k++]));
}
export const sendReminderEmails = items => buildAndSend(items, i => ({ to: i.address, ...reminderEmail({ language: i.language, bill: i.bill, appUrl: i.appUrl, userId: i.userId }) }));
export const sendSummaryEmails = items => buildAndSend(items, i => ({ to: i.address, ...summaryEmail({ language: i.language, bills: i.bills, today: i.today, appUrl: i.appUrl, userId: i.userId }) }));

async function send(to, message) {
  const apiKey = process.env.RESEND_API_KEY, from = process.env.RESEND_FROM;
  if (!apiKey || !from) return { skipped: true };
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to, subject: message.subject, html: message.html, text: message.text, headers: message.headers }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(String(result.message || `Email HTTP ${response.status}`).slice(0, 160));
  return { sent: true };
}

export async function emailReminder(recipient, bill, language = 'it', appUrl = publicAppUrl(), userId) {
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM) return { skipped: true };
  return send(recipient, reminderEmail({ language, bill, appUrl, userId }));
}

export async function emailSummary(recipient, bills, today, language = 'it', appUrl = publicAppUrl(), userId) {
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM) return { skipped: true };
  return send(recipient, summaryEmail({ language, bills, today, appUrl, userId }));
}
