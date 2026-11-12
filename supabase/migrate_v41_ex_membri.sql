-- Casa in Ordine: quello che un membro ha inserito in una casa condivisa resta alla casa, anche
-- quando lascia la casa o cancella l'account, e nell'app compare come «Nome (ex membro)».
-- Da eseguire una volta nel SQL Editor di Supabase, DOPO migrate_v40_sos_cifrate.sql. Rieseguibile.
--
-- Prima, quando un membro (non il proprietario) cancellava l'account, le chiavi esterne verso
-- auth.users cancellavano a cascata anche quello che aveva inserito nelle case condivise:
-- bollette, utenze, attività, documenti, contratti, letture, manutenzioni, schede SOS e altro.
-- Gli altri membri lo perdevano senza preavviso. Nelle spese condivise restava la voce, ma senza
-- nome (migrate_v37_account.sql).
--
-- Ora (scelta di Francesca, 12 novembre: «restano come ex membro, con il nome»):
--   - chi lascia una casa, o cancella l'account, finisce in home_former_members con il solo nome
--     che l'app mostra (la parte dell'email prima della @) e la data;
--   - le colonne che dicono chi ha pagato, a chi è assegnata un'attività, chi ha fatto una
--     modifica e simili conservano il suo identificativo: l'app lo mostra come «Nome (ex membro)»;
--   - le voci che aveva creato (bollette, documenti, attività...) restano nella casa; nel database
--     passano al proprietario, che serve per le regole di accesso, con il contenuto invariato;
--   - i file dei documenti restano nella cartella di chi li aveva caricati (home_documents.
--     former_user_id) e l'API di cancellazione dell'account non li cancella più.
-- Le voci personali, senza casa, si cancellano come prima.
begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------
-- 0. Ex membri: il nome da mostrare, senza email
-- ---------------------------------------------------------------------------------------
create table if not exists public.home_former_members (
 home_id uuid not null references public.homes(id) on delete cascade,
 user_id uuid not null,
 display_name text check (display_name is null or char_length(display_name) between 1 and 120),
 left_at timestamptz not null default now(),
 primary key (home_id, user_id)
);
comment on table public.home_former_members is
 'Chi ha lasciato la casa o cancellato l''account: solo il nome mostrato nell''app (la parte dell''email prima della @), per indicare le sue voci come «Nome (ex membro)».';
alter table public.home_former_members enable row level security;
drop policy if exists v41_former_members_read on public.home_former_members;
create policy v41_former_members_read on public.home_former_members for select to authenticated
 using (public.is_home_member(home_id));
revoke all on public.home_former_members from public, anon, authenticated;
grant select on public.home_former_members to authenticated;

-- Lo scrive il database: quando un membro esce (lascia, viene tolto o cancella l'account) e,
-- se rientra, lo toglie. Se si sta cancellando la casa intera non c'è niente da ricordare.
create or replace function private.v41_member_left() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
 if tg_op = 'DELETE' then
  if exists(select 1 from public.homes h where h.id = old.home_id and h.owner_id <> old.user_id) then
   insert into public.home_former_members(home_id, user_id, display_name, left_at)
   values (old.home_id, old.user_id, nullif(left(split_part(coalesce(old.email, ''), '@', 1), 120), ''), now())
   on conflict (home_id, user_id) do update
    set display_name = coalesce(excluded.display_name, public.home_former_members.display_name), left_at = excluded.left_at;
  end if;
  return old;
 end if;
 delete from public.home_former_members where home_id = new.home_id and user_id = new.user_id;
 return new;
end $$;
revoke all on function private.v41_member_left() from public, anon, authenticated;
drop trigger if exists v41_member_left on public.home_members;
create trigger v41_member_left after insert or delete on public.home_members
 for each row execute function private.v41_member_left();

-- I saldi della casa (migrate_v34_saldi.sql) includono anche gli ex membri: chi ha pagato e poi
-- è uscito deve ancora ricevere, o dare, la sua parte. Prima comparivano solo i membri attuali.
create or replace function public.v33_home_balances(home uuid)
returns table(user_id uuid, balance_cents bigint)
language sql stable security invoker set search_path = '' as $$
  with paid as (
    select e.paid_by as uid, sum(round(e.amount*100))::bigint as cents
    from public.home_expenses e where e.home_id = home group by e.paid_by
  ), owed as (
    select s.user_id as uid, sum(round(s.amount*100))::bigint as cents
    from public.home_expense_shares s join public.home_expenses e on e.id = s.expense_id
    where e.home_id = home group by s.user_id
  ), people as (
    select m.user_id from public.home_members m where m.home_id = home
    union
    select f.user_id from public.home_former_members f where f.home_id = home
  )
  select x.user_id, coalesce(p.cents, 0) - coalesce(o.cents, 0)
  from people x
  left join paid p on p.uid = x.user_id
  left join owed o on o.uid = x.user_id
  where public.is_home_member(home)
$$;
revoke all on function public.v33_home_balances(uuid) from public, anon;
grant execute on function public.v33_home_balances(uuid) to authenticated;

-- Le colonne che dicono CHI ha fatto qualcosa in una casa conservano l'identificativo anche
-- dopo la cancellazione dell'account (prima diventavano vuote: on delete set null). Il nome
-- da mostrare è in home_former_members.
-- Nota: non rieseguire migrate_v37_account.sql dopo questa, rimetterebbe le chiavi esterne.
do $$
declare c record;
begin
 for c in
  select con.conrelid::regclass as tab, con.conname
  from pg_catalog.pg_constraint con
  join pg_catalog.pg_attribute a on a.attrelid = con.conrelid and a.attnum = con.conkey[1]
  join (values ('public.home_expenses'::regclass, 'created_by'), ('public.home_expenses'::regclass, 'paid_by'),
               ('public.home_expense_shares'::regclass, 'user_id'), ('public.home_shopping'::regclass, 'created_by'),
               ('public.house_tasks'::regclass, 'assigned_to'), ('public.home_audit_log'::regclass, 'actor_id'),
               ('public.payment_receipts'::regclass, 'confirmed_by'), ('public.home_recycle_bin'::regclass, 'deleted_by'))
   as keep(tab, col) on keep.tab = con.conrelid and keep.col = a.attname
  where con.contype = 'f' and con.confrelid = 'auth.users'::regclass and cardinality(con.conkey) = 1
 loop
  execute format('alter table %s drop constraint %I', c.tab, c.conname);
 end loop;
end $$;

-- ---------------------------------------------------------------------------------------
-- 1. Documenti: il file resta dov'è
-- ---------------------------------------------------------------------------------------
alter table public.home_documents add column if not exists former_user_id uuid;
comment on column public.home_documents.former_user_id is
 'Chi aveva caricato il file, se poi ha cancellato l''account: il file resta nella sua cartella.';
alter table public.home_documents drop constraint if exists storage_owner_path;
alter table public.home_documents add constraint storage_owner_path
 check (split_part(storage_path, '/', 1) = coalesce(former_user_id, user_id)::text);

-- ---------------------------------------------------------------------------------------
-- 2. Bollette e utenze passano insieme
-- Una bolletta collegata a un'utenza ha lo stesso autore dell'utenza (chiave esterna composta).
-- Le due tabelle si aggiornano una dopo l'altra: durante il passaggio il controllo si sposta alla
-- fine della transazione. Negli altri casi resta immediato come prima.
-- ---------------------------------------------------------------------------------------
alter table public.bills alter constraint bills_utility_id_user_id_fkey deferrable initially immediate;

-- ---------------------------------------------------------------------------------------
-- 3. Quando un cambio di autore è ammesso
-- Solo durante il passaggio (casa.ex_membro = l'utente che si cancella), solo verso il
-- proprietario della stessa casa, e senza toccare nessun altro campo.
-- ---------------------------------------------------------------------------------------
create or replace function private.v41_handover_ok(old_row jsonb, new_row jsonb) returns boolean
language sql stable security definer set search_path = '' as $$
 select coalesce(current_setting('casa.ex_membro', true), '') = old_row->>'user_id'
  and new_row->>'home_id' is not null
  and new_row->>'home_id' = old_row->>'home_id'
  and (new_row - array['user_id', 'former_user_id']) = (old_row - array['user_id', 'former_user_id'])
  and (new_row->>'former_user_id') is not distinct from
      (case when old_row ? 'former_user_id' then coalesce(old_row->>'former_user_id', old_row->>'user_id') end)
  and exists(select 1 from public.homes h
             where h.id = (new_row->>'home_id')::uuid and h.owner_id::text = new_row->>'user_id')
$$;
revoke all on function private.v41_handover_ok(jsonb, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------
-- 4. Controlli esistenti: identici a prima, con in testa l'eccezione del punto 3.
-- In v19_reference_guard anche il controllo di home_documents.former_user_id.
-- ---------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prevent_home_scope_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
 -- v4.1: un membro ha cancellato l'account. I suoi dati in una casa condivisa passano al
 -- proprietario (private.v41_hand_over_shared_rows): cambia solo l'autore, il resto no.
 if tg_op='UPDATE' and coalesce(current_setting('casa.ex_membro', true), '') <> '' then
  if private.v41_handover_ok(to_jsonb(old), to_jsonb(new)) then return new; end if;
 end if;
 if old.user_id is distinct from new.user_id or old.home_id is distinct from new.home_id then
   raise exception 'Il proprietario e la casa non possono essere modificati';
 end if;
 return new;
end $function$;

CREATE OR REPLACE FUNCTION public.v20_reference_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare ref_user uuid; ref_home uuid; j jsonb := to_jsonb(new);
begin
 -- v4.1: un membro ha cancellato l'account. I suoi dati in una casa condivisa passano al
 -- proprietario (private.v41_hand_over_shared_rows): cambia solo l'autore, il resto no.
 if tg_op='UPDATE' and coalesce(current_setting('casa.ex_membro', true), '') <> '' then
  if private.v41_handover_ok(to_jsonb(old), to_jsonb(new)) then return new; end if;
 end if;
 if tg_op='UPDATE' and (new.user_id is distinct from old.user_id or new.home_id is distinct from old.home_id) then
   raise exception 'Impossibile cambiare proprietario o casa';
 end if;
 if tg_table_name='home_move_steps' then
   select user_id,home_id into ref_user,ref_home from public.home_move_plans where id=(j->>'plan_id')::uuid;
 elsif tg_table_name='pagopa_notices' and j->>'bill_id' is not null then
   select user_id,home_id into ref_user,ref_home from public.bills where id=(j->>'bill_id')::uuid;
 elsif tg_table_name='bill_security_reviews' then
   select user_id,home_id into ref_user,ref_home from public.bills where id=(j->>'bill_id')::uuid;
 else return new;
 end if;
 if not found or ref_home is distinct from new.home_id or (ref_home is null and ref_user is distinct from new.user_id) then
   raise exception 'Riferimento esterno allo spazio autorizzato';
 end if;
 return new;
end $function$;

CREATE OR REPLACE FUNCTION public.v21_scope_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare owner uuid; house uuid; pairs jsonb; ref jsonb; entity text; target uuid;
begin
 -- v4.1: un membro ha cancellato l'account. I suoi dati in una casa condivisa passano al
 -- proprietario (private.v41_hand_over_shared_rows): cambia solo l'autore, il resto no.
 if tg_op='UPDATE' and coalesce(current_setting('casa.ex_membro', true), '') <> '' then
  if private.v41_handover_ok(to_jsonb(old), to_jsonb(new)) then return new; end if;
 end if;
 if tg_op='UPDATE' and (new.user_id is distinct from old.user_id or new.home_id is distinct from old.home_id) then raise exception 'Non è consentito trasferire voci tra spazi';end if;
 if tg_table_name='home_inventory_items' then
  pairs=jsonb_build_array(jsonb_build_object('table','home_properties','id',new.property_id),jsonb_build_object('table','maintenance_assets','id',new.asset_id),jsonb_build_object('table','home_documents','id',new.document_id));
 elsif tg_table_name='home_refund_expectations' then
  pairs=jsonb_build_array(jsonb_build_object('table','bills','id',new.bill_id));
 elsif tg_table_name='home_vacation_shares' then
  pairs=jsonb_build_array(jsonb_build_object('table','home_vacation_plans','id',new.plan_id));
 else pairs='[]'::jsonb;end if;
 for ref in select value from jsonb_array_elements(pairs) loop
  if ref->>'id' is null then continue;end if;
  entity=ref->>'table';target=(ref->>'id')::uuid;
  if entity='home_properties' then select user_id,home_id into owner,house from public.home_properties where id=target;
  elsif entity='maintenance_assets' then select user_id,home_id into owner,house from public.maintenance_assets where id=target;
  elsif entity='home_documents' then select user_id,home_id into owner,house from public.home_documents where id=target;
  elsif entity='bills' then select user_id,home_id into owner,house from public.bills where id=target;
  elsif entity='home_vacation_plans' then select user_id,home_id into owner,house from public.home_vacation_plans where id=target;
  else raise exception 'Riferimento sconosciuto';end if;
  if not found or house is distinct from new.home_id or (house is null and owner is distinct from new.user_id) then raise exception 'Riferimento non appartiene allo stesso spazio';end if;
 end loop;
 return new;
end $function$;

CREATE OR REPLACE FUNCTION public.v19_reference_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 ref_user uuid; ref_home uuid;
 internal boolean := coalesce(current_setting('app.confirming_receipt',true),'')='yes';
 service boolean := coalesce((select auth.role()),'')='service_role';
 j jsonb := to_jsonb(new);
 o jsonb := case when tg_op='UPDATE' then to_jsonb(old) end;
begin
 -- v4.1: un membro ha cancellato l'account. I suoi dati in una casa condivisa passano al
 -- proprietario (private.v41_hand_over_shared_rows): cambia solo l'autore, il resto no.
 if tg_op='UPDATE' and coalesce(current_setting('casa.ex_membro', true), '') <> '' then
  if private.v41_handover_ok(to_jsonb(old), to_jsonb(new)) then return new; end if;
 end if;
 -- Cancellazione di un account: la chiave esterna confirmed_by viene azzerata in automatico.
 if tg_table_name='payment_receipts' and tg_op='UPDATE'
    and o->>'confirmed_by' is not null and j->>'confirmed_by' is null
    and (j - 'confirmed_by') = (o - 'confirmed_by')
    and not exists(select 1 from auth.users u where u.id=(o->>'confirmed_by')::uuid) then
  return new;
 end if;
 if tg_op='UPDATE' and (new.home_id is distinct from old.home_id or new.user_id is distinct from old.user_id) then raise exception 'Impossibile spostare record tra spazi'; end if;
 -- v4.1: l'autore originale di un documento lo scrive solo il passaggio al proprietario.
 if tg_table_name='home_documents' and (j->>'former_user_id') is distinct from (case when tg_op='UPDATE' then o->>'former_user_id' end) then
  raise exception 'L''autore originale di un documento non si può impostare';
 end if;
 if tg_op='INSERT' and new.user_id is distinct from (select auth.uid()) and not service then raise exception 'Autore non autorizzato'; end if;
 if tg_table_name='home_documents' and tg_op='UPDATE' and j->>'storage_path' is distinct from o->>'storage_path' then raise exception 'Il file di un documento non si può sostituire'; end if;
 if tg_table_name in ('home_documents','meter_readings','maintenance_assets','home_contracts','bills','utilities','meter_reminders') and j->>'property_id' is not null then
  select user_id,home_id into ref_user,ref_home from public.home_properties where id=(j->>'property_id')::uuid;
  if not found or ref_home is distinct from new.home_id or (ref_home is null and ref_user is distinct from new.user_id) then raise exception 'Immobile non appartenente allo spazio'; end if;
 end if;
 if tg_table_name='home_documents' and j->>'bill_id' is not null then
  select user_id,home_id into ref_user,ref_home from public.bills where id=(j->>'bill_id')::uuid;
  if not found or ref_home is distinct from new.home_id or (ref_home is null and ref_user is distinct from new.user_id) then raise exception 'Bolletta non appartenente allo spazio'; end if;
 end if;
 if tg_table_name in ('payment_receipts','maintenance_events','home_contracts') and j->>'document_id' is not null then
  select user_id,home_id into ref_user,ref_home from public.home_documents where id=(j->>'document_id')::uuid;
  if not found or ref_home is distinct from new.home_id or (ref_home is null and ref_user is distinct from new.user_id) then raise exception 'Documento non appartenente allo spazio'; end if;
 end if;
 if tg_table_name='payment_receipts' then
  select user_id,home_id into ref_user,ref_home from public.bills where id=(j->>'bill_id')::uuid;
  if not found or ref_home is distinct from new.home_id or (ref_home is null and ref_user is distinct from new.user_id) then raise exception 'Bolletta non appartenente allo spazio'; end if;
  if j->>'status'='confirmed' and (tg_op='INSERT' or o->>'status' is distinct from j->>'status') and not internal then raise exception 'Usa conferma protetta'; end if;
  if tg_op='INSERT' and (j->>'confirmed_at' is not null or j->>'confirmed_by' is not null) and not internal then raise exception 'Usa conferma protetta'; end if;
  if tg_op='UPDATE' and (j->>'confirmed_at' is distinct from o->>'confirmed_at' or j->>'confirmed_by' is distinct from o->>'confirmed_by') and not internal then raise exception 'Conferma non modificabile'; end if;
  if tg_op='UPDATE' and o->>'status'='confirmed' then raise exception 'Ricevuta già confermata, non modificabile'; end if;
 end if;
 if tg_table_name='maintenance_events' then
  select user_id,home_id into ref_user,ref_home from public.maintenance_assets where id=(j->>'asset_id')::uuid;
  if not found or ref_home is distinct from new.home_id or (ref_home is null and ref_user is distinct from new.user_id) then raise exception 'Manutenzione non appartenente allo spazio'; end if;
 end if;
 return new;
end $function$;

-- ---------------------------------------------------------------------------------------
-- 5. Registro delle modifiche: niente righe per il passaggio
-- ---------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.v20_audit_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r jsonb;uid uuid;house uuid;record_uuid uuid; description text;
begin
 -- v4.1: durante il passaggio dei dati di un ex membro non si scrive una riga per ogni voce.
 if coalesce(current_setting('casa.ex_membro', true), '') <> '' then return null; end if;
 r=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
 -- Home expenses/shopping use created_by and have no user_id; keep the initiator as owner metadata.
 uid=coalesce((r->>'user_id')::uuid,(r->>'created_by')::uuid,(select auth.uid()));
 house=(r->>'home_id')::uuid;
 record_uuid=(r->>'id')::uuid;
 description=left(coalesce(r->>'title',r->>'label',r->>'supplier',r->>'name','Elemento'),180);
 if uid is null then return null;end if;
 -- Cancellazione a cascata di un account o di una casa: il registro verrebbe a sua volta
 -- cancellato, e scriverlo farebbe fallire l'intera cancellazione.
 if not exists(select 1 from auth.users u where u.id=uid) then return null;end if;
 if house is not null and not exists(select 1 from public.homes h where h.id=house) then return null;end if;
 insert into public.home_audit_log(user_id,home_id,actor_id,source_table,record_id,action,summary)
 values(uid,house,(select auth.uid()),tg_table_name,record_uuid,tg_op,description);
 if tg_op='DELETE' and tg_table_name in ('house_tasks','home_shopping') then
  insert into public.home_recycle_bin(user_id,home_id,source_table,record_id,snapshot,deleted_by)
  values(uid,house,tg_table_name,record_uuid,r,(select auth.uid()))
  on conflict(source_table,record_id) do update set deleted_at=now(),restored_at=null,snapshot=excluded.snapshot,deleted_by=excluded.deleted_by;
 end if;
 return null;
end $function$;

-- ---------------------------------------------------------------------------------------
-- 6. Le voci dell'utente nelle case di altri, un attimo prima della cancellazione dell'account:
--    restano nella casa e nel database passano al proprietario (servono un autore e le regole
--    di accesso); nell'app chi ha pagato o fatto cosa resta l'ex membro.
-- ---------------------------------------------------------------------------------------
create or replace function private.v41_hand_over_shared_rows() returns trigger
language plpgsql security definer set search_path = '' as $$
declare uid uuid := old.id; t regclass;
begin
 perform set_config('casa.ex_membro', uid::text, true);
 set constraints public.bills_utility_id_user_id_fkey deferred;
 -- Promemoria e conferme di pagamento sono personali e si cancellano con l'account, ma puntano
 -- alle bollette insieme all'autore: prima si staccano, altrimenti l'autore non può cambiare.
 delete from public.reminders r using public.bills b, public.homes h
  where r.user_id = uid and r.bill_id = b.id and b.user_id = uid and b.home_id = h.id and h.owner_id <> uid;
 update public.mail_payment_evidence e set bill_id = null from public.bills b, public.homes h
  where e.user_id = uid and e.bill_id = b.id and b.user_id = uid and b.home_id = h.id and h.owner_id <> uid;
 -- Voci che il proprietario ha già registrato a nome suo: resta la sua.
 delete from public.pagopa_notices p using public.homes h
  where p.user_id = uid and p.home_id = h.id and h.owner_id <> uid
    and exists(select 1 from public.pagopa_notices o where o.user_id = h.owner_id and o.notice_code = p.notice_code);
 delete from public.meter_readings m using public.homes h
  where m.user_id = uid and m.home_id = h.id and h.owner_id <> uid
    and exists(select 1 from public.meter_readings o where o.user_id = h.owner_id and o.home_id = m.home_id
               and o.meter_name = m.meter_name and o.read_on = m.read_on);
 update public.bills b set external_id = null from public.homes h
  where b.user_id = uid and b.home_id = h.id and h.owner_id <> uid and b.external_id is not null
    and exists(select 1 from public.bills o where o.user_id = h.owner_id and o.source = b.source and o.external_id = b.external_id);
 -- Tutte le tabelle con un autore che si cancella a cascata e una casa, anche quelle future.
 for t in
  select c.conrelid::regclass from pg_catalog.pg_constraint c
  join pg_catalog.pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
  where c.contype = 'f' and c.confrelid = 'auth.users'::regclass and c.confdeltype = 'c'
    and c.connamespace = 'public'::regnamespace and cardinality(c.conkey) = 1 and a.attname = 'user_id'
    and exists(select 1 from pg_catalog.pg_attribute x where x.attrelid = c.conrelid and x.attname = 'home_id' and not x.attisdropped)
    and c.conrelid not in ('public.home_members'::regclass, 'public.home_sos_keys'::regclass)
  order by c.conrelid::regclass::text
 loop
  execute format('update %s x set user_id = h.owner_id%s from public.homes h where x.user_id = $1 and x.home_id = h.id and h.owner_id <> $1',
   t, case when t = 'public.home_documents'::regclass then ', former_user_id = coalesce(x.former_user_id, x.user_id)' else '' end)
  using uid;
 end loop;
 perform set_config('casa.ex_membro', '', true);
 return old;
end $$;
revoke all on function private.v41_hand_over_shared_rows() from public, anon, authenticated;

-- I trigger partono in ordine alfabetico: prima v37_before_user_delete cancella le case di cui
-- l'utente è proprietario, poi questo passa al proprietario le voci nelle case di altri.
drop trigger if exists v41_hand_over_shared_rows on auth.users;
create trigger v41_hand_over_shared_rows before delete on auth.users
 for each row execute function private.v41_hand_over_shared_rows();

commit;
