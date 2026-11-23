// Email dei promemoria e dei riepiloghi, con Resend. Spostate qui da app/api/cron/route.js per
// provarle (tests/promemoria-completi.test.mjs): testo nella lingua di chi riceve, HTML con i dati
// dell'utente sempre convertiti, pulsante verso l'app vera.
import { publicAppUrl } from './server.mjs';
import { billReminderCopy } from './notification-copy.mjs';
import { billSummaryCopy } from './notification-summary.mjs';

const htmlEscape = text => String(text || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export async function emailReminder(recipient, bill, language='it', appUrl=publicAppUrl()) {
  const apiKey = process.env.RESEND_API_KEY, from = process.env.RESEND_FROM;
  if (!apiKey || !from) return {skipped:true};
  const copy = billReminderCopy({language,name:bill.title,dueDate:bill.due_date});
  const response = await fetch('https://api.resend.com/emails', {
    method:'POST', headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},
    body:JSON.stringify({from,to:recipient,
      subject:`Casa in Ordine · ${copy.subject}`,
      html:`<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#24323a"><p style="white-space:pre-line">${htmlEscape(copy.text)}</p><p><a href="${htmlEscape(appUrl)}" style="display:inline-block;background:#156e65;color:white;padding:12px 18px;border-radius:9px;text-decoration:none">Casa in Ordine</a></p></div>`
    })
  });
  const result = await response.json().catch(()=>({}));
  if (!response.ok) throw new Error(String(result.message || `Email HTTP ${response.status}`).slice(0,160));
  return {sent:true};
}

export async function emailSummary(recipient,bills,today,language='it',appUrl=publicAppUrl()){
  const key=process.env.RESEND_API_KEY,from=process.env.RESEND_FROM;
  if(!key||!from)return {skipped:true};
  const copy=billSummaryCopy({language,today,bills});
  const rows=copy.rows.map(b=>`<li>${htmlEscape(b.title)} (${htmlEscape(b.supplier)}) — ${htmlEscape(b.date)} — ${htmlEscape(b.amount)}</li>`).join('');
  const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},
    body:JSON.stringify({from,to:recipient,subject:`Casa in Ordine · ${copy.subject}`,
      html:`<div style="font-family:Arial,sans-serif"><h2>${htmlEscape(copy.heading)}</h2><p>${htmlEscape(copy.description)}</p><ul>${rows}</ul><p><a href="${htmlEscape(appUrl)}">${htmlEscape(copy.openLabel)}</a></p></div>`})});
  const body=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(String(body.message||`Email HTTP ${response.status}`).slice(0,160));
  return {sent:true};
}
