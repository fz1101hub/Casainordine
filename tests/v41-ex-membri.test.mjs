// v4.1: quello che un membro ha inserito in una casa condivisa resta alla casa quando lascia la
// casa o cancella l'account, e compare come «Nome (ex membro)» (scelta del 12 novembre). Il comportamento nel database è provato sul database
// locale (vedi la descrizione della PR); qui la parte dell'app e il contenuto della migrazione.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sharedDocumentPaths, removeUserFiles } from '../lib/account-deletion.mjs';
import { LANGUAGES, translate } from '../lib/i18n.mjs';
import { memberName, balanceRows } from '../lib/member-names.mjs';
const source = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

function storageMock(files) {
  const removed = [], calls = [];
  const admin = {
    storage: { from(bucket) { return {
      async list(folder, { limit, offset = 0 }) {
        calls.push({ bucket, offset });
        const left = (files[bucket] || []).filter(name => !removed.includes(`${bucket}:${folder}/${name}`)).sort();
        return { data: left.slice(offset, offset + limit).map(name => ({ name })), error: null };
      },
      async remove(paths) { for (const p of paths) removed.push(`${bucket}:${p}`); return { error: null }; },
    }; } },
  };
  return { admin, removed, calls };
}

function tableMock({ probeError = null, owned = [], documents = [] } = {}) {
  return { from(table) {
    const q = { filters: {}, cols: '',
      select(cols) { q.cols = cols; return q; },
      eq(k, v) { q.filters[k] = v; return q; },
      not(k) { q.filters['!null:' + k] = true; return q; },
      async limit() {
        if (table === 'home_documents') return { data: [], error: probeError };
        return { data: owned.filter(h => h.owner_id === q.filters.owner_id), error: null };
      },
      async range(from, to) {
        const rows = documents.filter(d => d.user_id === q.filters.user_id && d.home_id);
        return { data: rows.slice(from, to + 1), error: null };
      },
    };
    return q;
  } };
}

test('Account: si tengono i file dei documenti delle case di altri, non quelli delle proprie', async () => {
  const admin = tableMock({
    owned: [{ id: 'mia', owner_id: 'u1' }],
    documents: [
      { user_id: 'u1', home_id: 'altrui', storage_path: 'u1/condiviso.pdf' },
      { user_id: 'u1', home_id: 'mia', storage_path: 'u1/casa-mia.pdf' },
      { user_id: 'u2', home_id: 'altrui', storage_path: 'u2/di-altri.pdf' },
    ],
  });
  assert.deepEqual([...await sharedDocumentPaths(admin, 'u1')], ['u1/condiviso.pdf']);
});

test('Account: senza la migrazione v4.1 non si tiene nessun file (le righe spariscono)', async () => {
  assert.equal((await sharedDocumentPaths(tableMock({ probeError: { code: '42703' } }), 'u1')).size, 0);
  await assert.rejects(sharedDocumentPaths(tableMock({ probeError: { code: '08006' } }), 'u1'),
    'un errore di rete ferma la cancellazione invece di cancellare i file della casa');
});

test('Account: i file tenuti restano, tutti gli altri si cancellano anche oltre le prime 100 voci', async () => {
  const many = Array.from({ length: 230 }, (_, i) => `f${String(i).padStart(3, '0')}.pdf`);
  const keep = new Set(['u1/f000.pdf', 'u1/f150.pdf', 'u1/f229.pdf', 'u1/mail.pdf']);
  const { admin, removed } = storageMock({ 'house-documents': many, 'mail-bills': ['mail.pdf'] });
  const count = await removeUserFiles(admin, 'u1', keep);
  assert.equal(count, 228, '230 documenti meno 3 tenuti, più 1 allegato email');
  for (const kept of ['f000.pdf', 'f150.pdf', 'f229.pdf']) assert.ok(!removed.includes(`house-documents:u1/${kept}`), kept);
  assert.ok(removed.includes('mail-bills:u1/mail.pdf'), 'gli allegati email sono sempre personali');
});

test('Account: l’API tiene i file condivisi e poi cancella l’utente', () => {
  const route = source('app/api/account/delete/route.js');
  const order = ['sharedOwnedHomes(admin, user.id)', 'sharedDocumentPaths(admin, user.id)', 'removeUserFiles(admin, user.id, keep)', 'admin.auth.admin.deleteUser(user.id)']
    .map(x => route.indexOf(x));
  assert.ok(order.every((v, i) => v > 0 && (i === 0 || v > order[i - 1])), order.join(','));
});

test('Migrazione v4.1: passaggio al proprietario, solo durante la cancellazione', () => {
  const sql = source('supabase/migrate_v41_ex_membri.sql');
  assert.match(sql, /create trigger v41_hand_over_shared_rows before delete on auth\.users/);
  // Parte dopo v37_before_user_delete (ordine alfabetico), che cancella le case dell'utente.
  assert.ok('v41_hand_over_shared_rows' > 'v37_before_user_delete');
  assert.match(sql, /set_config\('casa\.ex_membro', uid::text, true\)/);
  assert.match(sql, /set_config\('casa\.ex_membro', '', true\)/);
  assert.match(sql, /c\.confdeltype = 'c'/, 'tutte le tabelle con autore a cascata e casa, anche future');
  assert.match(sql, /not in \('public\.home_members'::regclass, 'public\.home_sos_keys'::regclass\)/);
  assert.match(sql, /check \(split_part\(storage_path, '\/', 1\) = coalesce\(former_user_id, user_id\)::text\)/);
  assert.match(sql, /deferrable initially immediate/);
  // Le quattro funzioni di controllo ammettono il passaggio e nient'altro.
  for (const fn of ['prevent_home_scope_change', 'v19_reference_guard', 'v20_reference_guard', 'v21_scope_guard']) {
    const body = sql.slice(sql.indexOf(`FUNCTION public.${fn}()`));
    assert.match(body.slice(0, 900), /private\.v41_handover_ok\(to_jsonb\(old\), to_jsonb\(new\)\)/, fn);
  }
  assert.match(sql, /new_row - array\['user_id', 'former_user_id'\]\) = \(old_row - array\['user_id', 'former_user_id'\]\)/);
  assert.match(sql, /h\.owner_id::text = new_row->>'user_id'/);
  assert.match(sql, /L''autore originale di un documento non si può impostare/);
  assert.match(sql, /revoke all on function private\.v41_hand_over_shared_rows\(\) from public, anon, authenticated/);
  assert.match(sql, /^begin;$/m); assert.match(sql, /^commit;$/m);
});

test('Testo della cancellazione: i dati restano alla casa con il nome e «ex membro», in 6 lingue', () => {
  for (const { code } of LANGUAGES) {
    const help = translate(code, 'account.deleteHelp'), former = translate(code, 'family.formerMember');
    assert.ok(help.includes(former), `${code}: ${help}`);
  }
});

test('Nomi: membri con la parte dell’email, ex membri come «Nome (ex membro)»', () => {
  const members = [{ user_id: 'a', email: 'anna@example.com' }];
  const former = [{ user_id: 'b', display_name: 'bruno' }, { user_id: 'c', display_name: null }];
  assert.equal(memberName('a', { members, former, formerLabel: 'ex membro' }), 'anna');
  assert.equal(memberName('b', { members, former, formerLabel: 'ex membro' }), 'bruno (ex membro)');
  assert.equal(memberName('c', { members, former, formerLabel: 'ex membro' }), 'ex membro');
  assert.equal(memberName('z', { members, former, formerLabel: 'former member' }), 'former member');
  assert.equal(memberName(null, { members, former }), 'ex membro');
});

test('Saldi: compaiono anche gli ex membri che devono ancora dare o ricevere', () => {
  const members = [{ user_id: 'a', email: 'anna@example.com' }];
  const former = [{ user_id: 'b', display_name: 'bruno' }, { user_id: 'c', display_name: 'carla' }];
  const rows = balanceRows({ members, former, balanceCents: { a: -1000, b: 1000, c: 0 } });
  assert.deepEqual(rows.map(r => [r.user_id, r.former, r.balance]), [['a', false, -10], ['b', true, 10]]);
  // Senza i saldi del database (migrazione v3.4 mancante) restano i membri, calcolati nel browser.
  assert.deepEqual(balanceRows({ members, former, balanceCents: null, fallback: () => 250 }).map(r => r.balance), [2.5]);
});

test('Migrazione v4.1: ex membri con il nome, identificativi conservati, saldi completi', () => {
  const sql = source('supabase/migrate_v41_ex_membri.sql');
  assert.match(sql, /create table if not exists public\.home_former_members/);
  assert.match(sql, /create policy v41_former_members_read on public\.home_former_members for select to authenticated\n using \(public\.is_home_member\(home_id\)\)/);
  assert.match(sql, /revoke all on public\.home_former_members from public, anon, authenticated;\ngrant select on public\.home_former_members to authenticated;/);
  assert.match(sql, /split_part\(coalesce\(old\.email, ''\), '@', 1\)/, 'si salva solo il nome, non l’email');
  assert.match(sql, /create trigger v41_member_left after insert or delete on public\.home_members/);
  for (const [table, column] of [['home_expenses', 'paid_by'], ['home_expense_shares', 'user_id'], ['house_tasks', 'assigned_to'], ['home_audit_log', 'actor_id']])
    assert.ok(sql.includes(`('public.${table}'::regclass, '${column}')`), `${table}.${column}`);
  assert.match(sql, /select f\.user_id from public\.home_former_members f where f\.home_id = home/);
});

test('Interfaccia: nomi degli ex membri in spese, saldi e attività', () => {
  const hub = source('app/HouseholdHub.jsx'), page = source('app/page.jsx');
  assert.match(hub, /from\('home_former_members'\)\.select\('user_id,display_name,left_at'\)/);
  assert.match(hub, /nameOf\(e\.paid_by\)/); assert.match(hub, /nameOf\(s\.user_id\)/);
  assert.match(hub, /balanceRows\(\{members:rows\.members,former:rows\.former/);
  assert.match(page, /tr\('tasks\.assignedTo',\{name:/);
  assert.doesNotMatch(page, /Assegnata a \$\{/);
});
