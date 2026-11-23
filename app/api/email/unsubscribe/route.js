import { getAdmin, publicAppUrl } from '../../../../lib/server.mjs';
import { validUnsubscribe } from '../../../../lib/email-unsubscribe.mjs';
import { translate, normalizeLanguage } from '../../../../lib/i18n.mjs';
export const runtime = 'nodejs';

// Smettere di ricevere un tipo di email (lib/reminder-email.mjs), senza accedere all'app.
// GET mostra solo la domanda: i programmi che controllano i collegamenti nelle email li aprono, e
// non devono disiscrivere nessuno. POST spegne le email: il pulsante della pagina, o il clic
// «Annulla iscrizione» di Gmail, Outlook e Apple Mail (List-Unsubscribe-Post, RFC 8058).
// - promemoria: profiles.reminder_emails = false (restano le notifiche nell'app e sul telefono);
// - riepilogo: profiles.summary_frequency = 'off'.
// La pagina non mostra dati della persona: chi ha il collegamento vede solo la domanda.
const escape = text => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function page(lang, appUrl, content, status = 200) {
  const title = translate(lang, 'server.unsubscribe.title');
  const html = `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${escape(title)}</title></head>`
    + `<body style="margin:0;background:#f4f7f5;font-family:Arial,Helvetica,sans-serif;color:#24323a"><main style="max-width:480px;margin:40px auto;padding:24px;background:#ffffff;border-radius:14px;font-size:16px;line-height:1.5">`
    + `<h1 style="font-size:20px;margin:0 0 12px">${escape(title)}</h1>${content}`
    + `<p style="margin:20px 0 0"><a href="${escape(appUrl)}" style="color:#16776b;font-weight:bold">${escape(translate(lang, 'server.unsubscribe.open'))}</a></p></main></body></html>`;
  return new Response(html, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}

const params = request => {
  const q = new URL(request.url).searchParams;
  return { u: q.get('u'), t: q.get('t'), k: q.get('k'), lang: normalizeLanguage(q.get('l') || 'it') };
};

export async function GET(request) {
  const { u, t, k, lang } = params(request), appUrl = publicAppUrl(request);
  if (!validUnsubscribe({ u, t, k })) return page(lang, appUrl, `<p>${escape(translate(lang, 'server.unsubscribe.invalid'))}</p>`, 400);
  const action = new URL(request.url);
  return page(lang, appUrl, `<p>${escape(translate(lang, `server.unsubscribe.ask.${t}`))}</p>`
    + `<form method="post" action="${escape(action.pathname + action.search)}"><button type="submit" style="font:inherit;font-weight:bold;background:#156e65;color:#ffffff;border:0;border-radius:9px;padding:12px 18px;min-height:44px;cursor:pointer">${escape(translate(lang, 'server.unsubscribe.confirm'))}</button></form>`);
}

export async function POST(request) {
  const { u, t, k, lang } = params(request), appUrl = publicAppUrl(request);
  if (!validUnsubscribe({ u, t, k })) return page(lang, appUrl, `<p>${escape(translate(lang, 'server.unsubscribe.invalid'))}</p>`, 400);
  let admin;
  try { admin = getAdmin(); } catch { return page(lang, appUrl, `<p>${escape(translate(lang, 'server.unsubscribe.invalid'))}</p>`, 503); }
  const patch = t === 'reminder' ? { reminder_emails: false } : { summary_frequency: 'off' };
  const { error } = await admin.from('profiles').update(patch).eq('id', u);
  if (error) return page(lang, appUrl, `<p>${escape(translate(lang, 'server.unsubscribe.invalid'))}</p>`, 500);
  return page(lang, appUrl, `<p role="status">${escape(translate(lang, `server.unsubscribe.done.${t}`))}</p>`);
}
