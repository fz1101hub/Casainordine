// Letture a pagine e a gruppi di id dal browser (lib/select-all.mjs), contro il Supabase finto con il
// limite di 1000 righe di Supabase. Con centinaia di id in un solo «in» l'indirizzo supera i 16 KB
// che Supabase accetta (errore 520): qui il finto rifiuta gli indirizzi troppo lunghi come il vero.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { startFakeSupabase } from './helpers/fake-supabase.mjs';
import { selectAll, selectIn } from '../lib/select-all.mjs';

let fake, client;
const id = (p, i) => `${p}-0000-4000-8000-${String(i).padStart(12, '0')}`;
test.before(async () => {
  fake = await startFakeSupabase({ maxRows: 1000, maxUrl: 16000 });
  client = createClient(fake.url, 'chiave-di-servizio-finta', { auth: { persistSession: false, autoRefreshToken: false } });
  fake.seed('home_expenses', Array.from({ length: 600 }, (_, i) => ({ id: id('e0000000', i), home_id: 'h1', title: `Spesa ${i}` })));
  fake.seed('home_expense_shares', Array.from({ length: 600 }, (_, i) => [1, 2, 3].map(u => ({ expense_id: id('e0000000', i), user_id: `u${u}`, amount: 10 }))).flat());
});
test.after(() => fake?.close());

test('con 600 id in un solo «in» la richiesta fallisce (come su Supabase)', async () => {
  const ids = fake.rows('home_expenses').map(e => e.id);
  const { error } = await client.from('home_expense_shares').select('expense_id').in('expense_id', ids);
  assert.ok(error, 'indirizzo troppo lungo');
});

test('selectIn: 600 id a gruppi di 100, 1800 righe oltre il limite di 1000', async () => {
  const ids = fake.rows('home_expenses').map(e => e.id);
  const { data, error } = await selectIn((part, count) => client.from('home_expense_shares').select('expense_id,user_id,amount', count ? { count: 'exact' } : undefined).in('expense_id', part).order('expense_id').order('user_id'), ids);
  assert.equal(error, null);
  assert.equal(data.length, 1800);
  assert.equal(new Set(data.map(r => `${r.expense_id}|${r.user_id}`)).size, 1800, 'nessuna riga ripetuta');
});

test('selectAll: tutte le righe, a pagine', async () => {
  const { data } = await selectAll(count => client.from('home_expense_shares').select('expense_id,user_id', count ? { count: 'exact' } : undefined).order('expense_id').order('user_id'));
  assert.equal(data.length, 1800);
});
