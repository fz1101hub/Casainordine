// Bollette dalle email (scelta dell'utente, 24 novembre 2026): la sincronizzazione vera di una casella
// IMAP (lib/mail-imap.mjs) con una casella finta che contiene email vere (MIME, lette da mailparser),
// il client Supabase vero contro il Supabase finto e i PDF fatti come quelli dei fornitori.
// Controlla: bollette importate con importo, scadenza, periodo, consumo e PDR letti dal PDF; nessun
// doppione alla seconda sincronizzazione; niente pubblicità, ricevute, loghi, file finti o troppo
// grandi; limite di documenti per giro; errore della casella senza dettagli della password.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { startFakeSupabase } from './helpers/fake-supabase.mjs';
import { syncImapConnection } from '../lib/mail-imap.mjs';
import { encryptSecret } from '../lib/mail-core.mjs';
import { textPdf, columnsPdf } from '../scripts/text-pdf.mjs';

const USER = '11111111-1111-4111-8111-111111111111', CONNECTION = '50000000-0000-4000-8000-000000000001';
let fake, admin;

// Email MIME con allegati in base64, come le manda un fornitore.
function mime({ from, subject, text = 'In allegato il documento.', attachments = [], date = 'Mon, 23 Nov 2026 09:15:00 +0100' }) {
  const boundary = 'confine-' + Math.random().toString(36).slice(2);
  const parts = [`--${boundary}\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n${text}\r\n`];
  for (const a of attachments) {
    const b64 = Buffer.from(a.bytes).toString('base64').replace(/.{76}/g, '$&\r\n');
    parts.push(`--${boundary}\r\nContent-Type: ${a.type}; name="${a.name}"\r\nContent-Disposition: attachment; filename="${a.name}"\r\nContent-Transfer-Encoding: base64\r\n\r\n${b64}\r\n`);
  }
  return Buffer.from(`From: ${from}\r\nTo: mario@example.org\r\nSubject: ${subject}\r\nDate: ${date}\r\nMessage-ID: <${Math.random().toString(36).slice(2)}@example.org>\r\nMIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary="${boundary}"\r\n\r\n${parts.join('')}--${boundary}--\r\n`);
}
const pdf = lines => ({ name: 'bolletta.pdf', type: 'application/pdf', bytes: textPdf(lines) });
const png = name => ({ name, type: 'image/png', bytes: Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4c50000000049454e44ae426082', 'hex') });

// Casella finta: gli stessi metodi di ImapFlow che usa la sincronizzazione.
function mailbox(messages, { fail = false } = {}) {
  const byUid = new Map(messages.map((m, i) => [i + 1, m]));
  return {
    mailbox: { uidValidity: 777 },
    on() {},
    async connect() { if (fail) throw new Error('AUTHENTICATIONFAILED password sbagliata per mario@example.org: segreto123'); },
    async getMailboxLock() { return { release() {} }; },
    async search() { return [...byUid.keys()]; },
    async fetchOne(uid, what) {
      const raw = byUid.get(uid);
      if (what.source) return { source: raw };
      const head = raw.toString('latin1').split('\r\n\r\n')[0];
      const subject = head.match(/^Subject: (.*)$/m)?.[1] || '', from = head.match(/^From: .*?<?([^<>\s]+@[^<>\s]+)>?$/m)?.[1] || '';
      return { size: raw.length, envelope: { subject, from: [{ address: from }] } };
    },
    async logout() {}, close() {},
  };
}

test.before(async () => {
  process.env.MAIL_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
  fake = await startFakeSupabase();
  admin = createClient(fake.url, 'chiave-di-servizio-finta', { auth: { persistSession: false, autoRefreshToken: false } });
  fake.seed('mail_connections', [{ id: CONNECTION, user_id: USER, provider: 'libero', email_address: 'mario@example.org', status: 'active', refresh_token_enc: encryptSecret('password-per-app') }]);
});
test.after(() => fake?.close());
const connection = () => fake.rows('mail_connections')[0];
// Sincronizzazione che deve riuscire: se fallisce, la prova mostra l'errore vero (raramente, sotto carico,
// le prime due prove fallivano con il solo messaggio generico e non si capiva il perché).
async function syncOk(options) {
  let cause = null;
  const result = await syncImapConnection(admin, connection(), { ...options, onError: e => { cause = e; } });
  assert.ok(!result.error, `la sincronizzazione non doveva fallire: ${cause?.stack || cause}${cause?.cause ? `\ncausa: ${cause.cause?.stack || cause.cause}` : ''}`);
  return result;
}
const docs = () => fake.rows('mail_documents');

const MESSAGES = [
  // 1. Bolletta del gas con il PDF: si importa, con i dati letti.
  mime({ from: 'GasNord Energia <bollette@gasnord.example>', subject: 'La tua bolletta di novembre', attachments: [pdf(['GasNord Energia S.r.l.',
    'Fornitura gas naturale - PDR 00881234567890', 'Periodo di riferimento dal 1 settembre 2026 al 31 ottobre 2026', 'Consumi fatturati: 120 Smc',
    'TOTALE DA PAGARE 112,50 €', 'Da pagare entro il 15 dicembre 2026'])] }),
  // 2. Bolletta della luce a due colonne, con il logo del fornitore: solo il PDF.
  mime({ from: 'Lumen Casa <noreply@lumen.example>', subject: 'Fattura luce e gas', attachments: [png('logo.png'),
    { name: 'fattura_2026_889912.pdf', type: 'application/pdf', bytes: columnsPdf([['Lumen Casa S.p.A.', 'Bolletta luce e gas'], ['Scadenza', 'Totale da pagare'], ['18/12/2026', '€ 156,20'], ['Periodo', 'Consumi luce'], ['01/09/2026 - 31/10/2026', '305 kWh']]) }] }),
  // 3. Pubblicità con un PDF: no.
  mime({ from: 'Offerte <promo@negozio.example>', subject: 'Offerta speciale solo per te', attachments: [{ ...pdf(['Sconto 30%']), name: 'volantino.pdf' }] }),
  // 4. Ricevuta di pagamento: non è una bolletta da importare.
  mime({ from: 'Banca <avvisi@banca.example>', subject: 'Ricevuta di pagamento', text: 'Pagamento eseguito di 64,00 euro a GasNord Energia.', attachments: [{ ...pdf(['Quietanza di pagamento', 'Importo 64,00']), name: 'ricevuta.pdf' }] }),
  // 5. «Fattura» con un file che non è un PDF (eseguibile rinominato): no.
  mime({ from: 'Fatture <fatture@sconosciuto.example>', subject: 'Fattura in scadenza', attachments: [{ name: 'fattura.pdf', type: 'application/pdf', bytes: Buffer.from('MZ\x90\x00 eseguibile') }] }),
  // 6. Email «sospetta» senza allegati, solo un link per pagare: niente da importare.
  mime({ from: 'Servizio Clienti <assistenza@enel-pagamenti.example>', subject: 'Bolletta non pagata: paga subito', text: 'Clicca qui per pagare: http://pagamento.example/paga' }),
  // 7. Archivio compresso: no.
  mime({ from: 'Acque del Fiume <bollette@acque.example>', subject: 'Bolletta acqua', attachments: [{ name: 'bolletta.zip', type: 'application/zip', bytes: Buffer.from('PK\x03\x04archivio') }] }),
];

test('prima sincronizzazione: due bollette importate, con i dati letti dal PDF', async () => {
  const result = await syncOk({ imapClient: mailbox(MESSAGES) });
  assert.equal(result.error, undefined);
  assert.equal(result.imported, 2, JSON.stringify(result));
  const [gas, luce] = docs().sort((a, b) => a.message_id.localeCompare(b.message_id));
  assert.deepEqual([gas.filename, gas.mime_type, gas.sender], ['bolletta.pdf', 'application/pdf', 'bollette@gasnord.example']);
  assert.deepEqual(
    [gas.suggestion.amount, gas.suggestion.due_date, gas.suggestion.category, gas.suggestion.pdr, gas.suggestion.period_start, gas.suggestion.period_end, gas.suggestion.consumption_value, gas.suggestion.consumption_unit],
    [112.5, '2026-12-15', 'Gas', '00881234567890', '2026-09-01', '2026-10-31', 120, 'Smc']);
  // Le due colonne del PDF restano sulla stessa riga: importo e scadenza trovati.
  assert.deepEqual([luce.filename, luce.suggestion.amount, luce.suggestion.due_date, luce.suggestion.period_start], ['fattura_2026_889912.pdf', 156.2, '2026-12-18', '2026-09-01']);
  // Il file è salvato nella cartella della persona, con un nome nuovo; il logo no.
  const files = (fake.state.files['mail-bills'] || []).map(f => f.name);
  assert.equal(files.length, 2);
  assert.ok(files.every(name => name.startsWith(`${USER}/`) && name.endsWith('.pdf')));
  assert.equal(connection().status, 'active');
});

test('seconda sincronizzazione: nessun doppione', async () => {
  const result = await syncOk({ imapClient: mailbox(MESSAGES) });
  assert.equal(result.imported, 0);
  assert.equal(docs().length, 2);
  assert.equal((fake.state.files['mail-bills'] || []).length, 2, 'nessun file in più (e nessun file orfano)');
});

test('al massimo i documenti chiesti per giro', async () => {
  const many = Array.from({ length: 8 }, (_, i) => mime({ from: 'GasNord Energia <bollette@gasnord.example>', subject: `Bolletta n. ${i}`,
    attachments: [pdf(['GasNord Energia S.r.l.', `Totale da pagare € ${20 + i},00`, 'Scadenza 20/12/2026'])] }));
  const before = docs().length;
  const result = await syncOk({ imapClient: mailbox(many), docLimit: 3 });
  assert.equal(result.imported, 3);
  assert.equal(docs().length, before + 3);
});

test('casella che rifiuta l\'accesso: errore generico, senza password né dettagli del server', async () => {
  let cause = null;
  const result = await syncImapConnection(admin, connection(), { imapClient: mailbox([], { fail: true }), onError: e => { cause = e; } });
  assert.match(result.error, /Connessione IMAP non riuscita/);
  assert.match(String(cause?.message), /AUTHENTICATIONFAILED/, "l'errore originale arriva solo a onError");
  assert.equal(connection().status, 'error');
  assert.doesNotMatch(JSON.stringify(connection()) + result.error, /segreto123|AUTHENTICATIONFAILED|password-per-app/);
});
