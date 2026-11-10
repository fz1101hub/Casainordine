-- Casa in Ordine: cancellazione dell'account anche per chi ha spese o spesa condivise.
-- Da eseguire una volta nel SQL Editor di Supabase, dopo migrate_v33_audit.sql. Rieseguibile.
--
-- Prima chi aveva registrato o pagato una spesa condivisa, o aggiunto un articolo alla lista della
-- spesa di una casa, non poteva cancellare l'account (diritto alla cancellazione, GDPR art. 17):
-- le chiavi esterne verso auth.users lo impedivano. Scelta approvata il 10 novembre: le voci
-- restano alla casa senza nome ("ex membro"), così i conti degli altri non cambiano.
begin;

-- Le quote avevano come chiave primaria (expense_id, user_id), che non ammette un utente vuoto:
-- diventa una chiave propria, con l'unicità di (spesa, persona) mantenuta.
alter table public.home_expense_shares add column if not exists id uuid not null default gen_random_uuid();
do $$
declare pk record;
begin
  select conname, pg_get_constraintdef(oid) as def into pk from pg_constraint
    where conrelid = 'public.home_expense_shares'::regclass and contype = 'p';
  if pk.conname is not null and pk.def not like 'PRIMARY KEY (id)%' then
    execute format('alter table public.home_expense_shares drop constraint %I', pk.conname);
    alter table public.home_expense_shares add constraint home_expense_shares_pkey primary key (id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'home_expense_shares_expense_user_key') then
    alter table public.home_expense_shares add constraint home_expense_shares_expense_user_key unique (expense_id, user_id);
  end if;
end $$;

do $$
declare r record; c text;
begin
  for r in select * from (values
    ('home_expenses','created_by'), ('home_expenses','paid_by'),
    ('home_expense_shares','user_id'), ('home_shopping','created_by')) v(t, col)
  loop
    select con.conname into c from pg_constraint con
      join pg_attribute a on a.attrelid = con.conrelid and a.attnum = con.conkey[1]
      where con.conrelid = ('public.' || r.t)::regclass and con.contype = 'f'
        and a.attname = r.col and con.confrelid = 'auth.users'::regclass;
    if c is not null then execute format('alter table public.%I drop constraint %I', r.t, c); end if;
    execute format('alter table public.%I alter column %I drop not null', r.t, r.col);
    execute format('alter table public.%I add constraint %I foreign key (%I) references auth.users(id) on delete set null',
      r.t, r.t || '_' || r.col || '_fkey', r.col);
  end loop;
end $$;

-- Le case di cui l'account è proprietario si cancellano per prime, con tutto il loro contenuto:
-- altrimenti la cancellazione a cascata della casa e l'azzeramento dei nomi nelle sue spese si
-- intralciano. L'API di cancellazione dell'app rifiuta l'operazione se la casa ha altri membri.
create or replace function public.v37_before_user_delete() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.homes where owner_id = old.id;
  return old;
end $$;
revoke all on function public.v37_before_user_delete() from public, anon, authenticated;
drop trigger if exists v37_before_user_delete on auth.users;
create trigger v37_before_user_delete before delete on auth.users
  for each row execute function public.v37_before_user_delete();

commit;
