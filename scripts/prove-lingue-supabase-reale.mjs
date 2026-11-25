// Collaudo 3.2 con Auth e PostgREST reali, esclusivamente su Supabase locale.
// Avviare uno stack locale usa-e-getta e applicare migrate_v32_languages.sql.
// SUPABASE_LOCAL_ANON_KEY=<chiave locale> node scripts/prove-lingue-supabase-reale.mjs
// Non usa credenziali amministrative, non legge dati preesistenti.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const url = 'http://127.0.0.1:54321';
const key = process.env.SUPABASE_LOCAL_ANON_KEY;
assert.ok(key, 'Manca SUPABASE_LOCAL_ANON_KEY');
const client = () => createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
const table = 'user_language_preferences';
const unwrap = ({ data, error }) => { if (error) throw new Error('Operazione Supabase fallita: ' + (error.code || error.status || 'unknown')); return data; };
const password = randomUUID() + 'Aa1!';
const accounts = [];
for (const label of ['a', 'b']) {
  const api = client();
  const email = label + '-' + randomUUID() + '@example.test';
  const data = unwrap(await api.auth.signUp({ email, password }));
  assert.ok(data.session && data.user, 'Lo stack locale deve consentire la registrazione senza conferma email per questa prova');
  accounts.push({ api, email, id: data.user.id });
}
const [a,b] = accounts;
const save = async (account, language) => unwrap(await account.api.from(table).upsert({ user_id: account.id, language }).select('language').single());
const read = async (api, id) => unwrap(await api.from(table).select('language').eq('user_id', id).maybeSingle());
await save(b, 'de');
for (const language of ['it','en','es','fr','de','pt']) {
  assert.equal((await save(a, language)).language, language);
  const fresh = client();
  unwrap(await fresh.auth.signInWithPassword({ email: a.email, password }));
  assert.equal((await read(fresh, a.id)).language, language);
  assert.equal(await read(fresh, b.id), null);
  assert.equal((await read(b.api, b.id)).language, 'de');
  unwrap(await fresh.auth.signOut());
  console.log('ok: persistenza e isolamento ' + language);
}
const denied = await a.api.from(table).upsert({ user_id: b.id, language: 'fr' });
assert.ok(denied.error, 'Scrittura incrociata non rifiutata');
assert.equal((await read(b.api, b.id)).language, 'de');
const invalid = await a.api.from(table).update({ language: 'xx' }).eq('user_id', a.id);
assert.ok(invalid.error, 'Lingua non valida accettata');
assert.equal((await read(a.api, a.id)).language, 'pt');
const anonymous = await client().from(table).select('language');
assert.ok(anonymous.error || anonymous.data?.length === 0, 'Accesso anonimo non isolato');
for (const account of accounts) {
  unwrap(await account.api.from(table).delete().eq('user_id', account.id));
  unwrap(await account.api.auth.signOut());
}
console.log('ok: scrittura incrociata, vincolo lingua e accesso anonimo');
 // Gli account sintetici restano nello stack usa-e-getta; smaltire solo tale stack.
