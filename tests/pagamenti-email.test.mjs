// Pagamenti dalle email (scelta dell'utente, 24 novembre 2026): email realistiche di banca, PayPal,
// Satispay, pagoPA, Poste e fornitori (tests/fixtures/pagamenti-esempio.mjs), poi il percorso vero
// con il Supabase finto: ricevuta trovata nella casella, abbinamento, conferma e conferma automatica.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { startFakeSupabase } from './helpers/fake-supabase.mjs';
import { extractPaymentEvidence, matchOutstandingBill, supplierKey } from '../lib/payment-recognition.mjs';
import { processPaymentMessage } from '../lib/payment-sync.mjs';
import { EMAIL, BOLLETTE } from './fixtures/pagamenti-esempio.mjs';

for (const email of EMAIL) {
  test(`email: ${email.name}`, () => {
    const evidence = extractPaymentEvidence(email);
    assert.equal(evidence?.amount ?? null, email.expected, 'importo letto');
    assert.equal(evidence ? matchOutstandingBill(evidence, BOLLETTE)?.id ?? null : null, email.bill, 'bolletta abbinata');
  });
}

// Casa condivisa: Bruno (proprietario) ha inserito la bolletta della luce, Anna (editor) la paga
// con l'addebito sulla sua banca, Carla legge soltanto. Dario ha una bolletta personale identica.
const ANNA = '00000000-0000-4000-8000-00000000000a', BRUNO = '00000000-0000-4000-8000-00000000000b';
const CARLA = '00000000-0000-4000-8000-00000000000c', DARIO = '00000000-0000-4000-8000-00000000000d';
const HOME = '10000000-0000-4000-8000-000000000001';
const LUCE = '20000000-0000-4000-8000-000000000001', DARIO_LUCE = '20000000-0000-4000-8000-000000000002';
const SDD = { subject: 'Avviso di addebito SDD', sender: 'Banca <avvisi@banca.example>', receivedAt: '2026-11-17T09:30:00Z',
  text: 'Addebito SDD eseguito il 17/11/2026 a favore di IREN MERCATO SPA per un importo di EUR 45,90.' };
let fake, admin, tokenAnna;
const connection = user => ({ id: `c-${user.slice(-1)}`, user_id: user });

test.before(async () => {
  fake = await startFakeSupabase();
  Object.assign(process.env, { NEXT_PUBLIC_SUPABASE_URL: fake.url, NEXT_PUBLIC_SUPABASE_ANON_KEY: 'chiave-pubblica-finta', SUPABASE_SECRET_KEY: 'chiave-di-servizio-finta' });
  admin = createClient(fake.url, 'chiave-di-servizio-finta', { auth: { persistSession: false, autoRefreshToken: false } });
  tokenAnna = fake.addUser(ANNA, 'anna@example.org');
  fake.seed('homes', [{ id: HOME, name: 'Casa', owner_id: BRUNO }]);
  fake.seed('home_members', [
    { home_id: HOME, user_id: BRUNO, role: 'owner' }, { home_id: HOME, user_id: ANNA, role: 'editor' }, { home_id: HOME, user_id: CARLA, role: 'viewer' }]);
  fake.seed('bills', [
    { id: LUCE, user_id: BRUNO, home_id: HOME, supplier: 'Iren Mercato', amount: 45.9, due_date: '2026-11-18', paid_at: null },
    { id: DARIO_LUCE, user_id: DARIO, home_id: null, supplier: 'Iren Mercato', amount: 45.9, due_date: '2026-11-18', paid_at: null },
  ]);
  fake.seed('profiles', [{ id: ANNA, auto_confirm_payments: false }, { id: CARLA, auto_confirm_payments: false }]);
});
test.after(() => fake?.close());
const evidence = user => fake.rows('mail_payment_evidence').filter(e => e.user_id === user);

test('chi può modificare la casa: la ricevuta si abbina alla bolletta inserita da un altro membro', async () => {
  assert.equal(await processPaymentMessage(admin, connection(ANNA), { messageId: 'm1', ...SDD }), 'pending');
  const [row] = evidence(ANNA);
  assert.equal(row.bill_id, LUCE, 'la luce di casa, mai la bolletta personale di Dario');
  assert.equal(fake.rows('bills').find(b => b.id === LUCE).paid_at, null, 'senza consenso non si segna pagata da sola');
});

test('elenco delle ricevute: la bolletta proposta arriva con il nome della casa', async () => {
  const { GET } = await import('../app/api/mail/payments/route.js');
  fake.seed('mail_payment_evidence', [{ id: '41000000-0000-4000-8000-0000000000dd', user_id: ANNA, status: 'pending', amount: 45.9, bill_id: DARIO_LUCE,
    sender_email: 'x@banca.example', received_at: SDD.receivedAt, created_at: SDD.receivedAt }]);
  const response = await GET(new Request('https://casa.example/api/mail/payments', { headers: { authorization: `Bearer ${tokenAnna}` } }));
  const { payments } = await response.json();
  const home = payments.find(p => p.bill_id === LUCE);
  assert.deepEqual([home.bill.supplier, home.bill.home_name, Number(home.bill.amount)], ['Iren Mercato', 'Casa', 45.9]);
  // Una ricevuta che indicasse la bolletta personale di un altro non ne mostra nulla.
  const foreign = payments.find(p => p.id === '41000000-0000-4000-8000-0000000000dd');
  assert.deepEqual([foreign.bill_id, foreign.bill], [null, null]);
  fake.state.tables.mail_payment_evidence = fake.rows('mail_payment_evidence').filter(p => p.id !== '41000000-0000-4000-8000-0000000000dd');
});

test('chi legge soltanto: nessuna bolletta abbinata (un addebito generico senza bolletta si ignora)', async () => {
  assert.equal(await processPaymentMessage(admin, connection(CARLA), { messageId: 'm1', ...SDD }), 'ignored');
  assert.deepEqual(evidence(CARLA), []);
  // Con una parola da bolletta resta da guardare, ma sempre senza bolletta.
  assert.equal(await processPaymentMessage(admin, connection(CARLA), { messageId: 'm2', ...SDD, text: SDD.text + ' Bolletta luce di novembre.' }), 'pending');
  assert.equal(evidence(CARLA)[0].bill_id, null);
});

test('conferma di Anna: la bolletta di casa risulta pagata; quella personale di Dario no', async () => {
  const { PATCH } = await import('../app/api/mail/payments/route.js');
  const patch = body => PATCH(new Request('https://casa.example/api/mail/payments', { method: 'PATCH',
    headers: { authorization: `Bearer ${tokenAnna}`, 'content-type': 'application/json' }, body: JSON.stringify(body) }));
  const [row] = evidence(ANNA);
  row.id = '41000000-0000-4000-8000-000000000001';
  const other = await patch({ id: row.id, action: 'confirm', bill_id: DARIO_LUCE });
  assert.equal(other.status, 404, 'la bolletta personale di un altro non risulta nemmeno esistente');
  assert.equal(fake.rows('bills').find(b => b.id === DARIO_LUCE).paid_at, null);
  const ok = await patch({ id: row.id, action: 'confirm' });
  assert.equal(ok.status, 200, await ok.clone().text());
  assert.equal(Date.parse(fake.rows('bills').find(b => b.id === LUCE).paid_at), Date.parse(SDD.receivedAt));
  assert.equal(evidence(ANNA)[0].status, 'confirmed');
});

test('conferma automatica anche per la bolletta di casa: solo con consenso, mittente fidato e firma del dominio', async () => {
  fake.rows('bills').find(b => b.id === LUCE).paid_at = null;
  const message = { messageId: 'm2', ...SDD, senderAuth: 'reported_pass' };
  fake.rows('profiles').find(p => p.id === ANNA).auto_confirm_payments = true;
  fake.seed('mail_payment_trusted_senders', [{ id: 't1', user_id: ANNA, sender_email: 'avvisi@banca.example', supplier_key: supplierKey('Iren Mercato') }]);
  // Il fornitore deve comparire nell'oggetto o nel mittente: qui solo nel testo, quindi resta da confermare.
  assert.equal(await processPaymentMessage(admin, connection(ANNA), message), 'pending');
  assert.equal(fake.rows('bills').find(b => b.id === LUCE).paid_at, null);
  const named = { ...message, messageId: 'm3', subject: 'Addebito SDD eseguito - IREN MERCATO SPA' };
  assert.equal(await processPaymentMessage(admin, connection(ANNA), { ...named, senderAuth: 'unknown' }), 'pending', 'senza firma del dominio no');
  assert.equal(await processPaymentMessage(admin, connection(ANNA), { ...named, messageId: 'm4' }), 'auto_confirmed');
  assert.equal(Date.parse(fake.rows('bills').find(b => b.id === LUCE).paid_at), Date.parse(SDD.receivedAt));
  assert.equal(fake.rows('bills').find(b => b.id === DARIO_LUCE).paid_at, null);
});
