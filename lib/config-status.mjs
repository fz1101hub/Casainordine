// Stato della configurazione del server (scelta dell'utente, 23 novembre 2026): quali impostazioni
// ci sono e quali mancano, mai i loro valori. Serve a chi installa l'app per capire che cosa
// aggiungere su Vercel e, dopo il Redeploy, se ha funzionato.
//
// Per ogni voce: key, level («required» o «optional»), state e missing (nomi delle variabili da
// aggiungere o correggere). state:
//   ok       la voce è completa;
//   missing  manca tutto;
//   partial  manca una parte;
//   invalid  c'è ma il formato non va (o la chiave è rifiutata).
const present = v => typeof v === 'string' && v.trim().length > 0;
const httpsOrigin = v => { try { const u = new URL(v); return (u.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(u.hostname)) && u.pathname === '/' && !u.search && !u.hash; } catch { return false; } };
const key32 = v => { try { return Buffer.from(v || '', 'base64').length === 32; } catch { return false; } };

// Ogni voce: le variabili che servono e, se c'è, il controllo del formato.
export const CONFIG_ITEMS = Object.freeze([
  { key: 'database', level: 'required', vars: ['SUPABASE_SECRET_KEY'] },
  { key: 'appUrl', level: 'required', vars: ['APP_URL'], valid: env => httpsOrigin(env.APP_URL) },
  { key: 'email', level: 'optional', vars: ['RESEND_API_KEY', 'RESEND_FROM'] },
  { key: 'push', level: 'optional', vars: ['NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT'], valid: env => /^mailto:/.test(env.VAPID_SUBJECT || ''), invalidVars: ['VAPID_SUBJECT'] },
  { key: 'mailKey', level: 'optional', vars: ['MAIL_TOKEN_ENCRYPTION_KEY'], valid: env => key32(env.MAIL_TOKEN_ENCRYPTION_KEY) },
  { key: 'gmail', level: 'optional', vars: ['GOOGLE_MAIL_CLIENT_ID', 'GOOGLE_MAIL_CLIENT_SECRET'] },
  { key: 'outlook', level: 'optional', vars: ['MICROSOFT_MAIL_CLIENT_ID', 'MICROSOFT_MAIL_CLIENT_SECRET'] },
  { key: 'cron', level: 'optional', vars: ['CRON_SECRET'], valid: env => String(env.CRON_SECRET || '').length >= 16 },
]);

export function configStatus(env = process.env) {
  return CONFIG_ITEMS.map(({ key, level, vars, valid, invalidVars }) => {
    const missing = vars.filter(name => !present(env[name]));
    if (missing.length === vars.length) return { key, level, state: 'missing', missing };
    if (missing.length) return { key, level, state: 'partial', missing };
    if (valid && !valid(env)) return { key, level, state: 'invalid', missing: invalidVars || vars };
    return { key, level, state: 'ok', missing: [] };
  });
}

// Con la chiave del database presente si prova una lettura: una chiave sbagliata o di un altro
// progetto viene rifiutata da Supabase.
export async function checkDatabase(admin) {
  try {
    const { error } = await admin.from('profiles').select('id', { head: true, count: 'exact' }).limit(1);
    return error ? 'invalid' : 'ok';
  } catch {
    return 'invalid';
  }
}
