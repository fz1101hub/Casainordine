-- Casa in Ordine: giardino e orto (richiesta dell'utente del 25 novembre 2026).
-- Da eseguire una volta nel SQL Editor di Supabase, DOPO migrate_v56_account_cleanup.sql. Rieseguibile.
--
-- - home_garden_plants: le piante (o gruppi di piante: «pomodori dell'orto», «siepe di lauro»),
--   con dove sono e, se scelta, la proposta da cui partono (lib/garden.mjs);
-- - home_garden_tasks: il piano di ogni pianta: concimazioni, trattamenti, potature, rinvasi…
--   con prodotto, dose, mesi in cui farli, ogni quanti giorni ripeterli in quei mesi (0 = una
--   volta per periodo), prossima data e promemoria sì/no;
-- - home_garden_log: il registro di quello che si è fatto (data, prodotto, dose, note).
-- I promemoria li manda il lavoro giornaliero (lib/garden-alerts.mjs) come avvisi «garden», con la
-- notifica push se la persona la vuole (user_alert_preferences.push_garden).
-- Accesso come le altre voci della casa: i membri leggono, proprietario ed editor scrivono; nello
-- spazio personale solo l'autore. Piano e registro seguono la loro pianta. Al massimo 300 piante
-- per spazio, 40 interventi per pianta e 2000 righe di registro per pianta.
-- Finché la migrazione non è eseguita la sezione dice che va attivata e il lavoro giornaliero la salta.
begin;

create table if not exists public.home_garden_plants (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 home_id uuid references public.homes(id) on delete cascade,
 name text not null check (char_length(btrim(name)) between 2 and 120),
 preset text check (preset ~ '^[a-z][a-z_]{1,39}$'),
 kind text not null default 'other' check (kind in ('ornamental','fruit','vegetable','herb','lawn','hedge','indoor','other')),
 location text not null default '' check (char_length(location) <= 80),
 notes text not null default '' check (char_length(notes) <= 1000),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists idx_home_garden_plants_home on public.home_garden_plants(home_id) where home_id is not null;
create index if not exists idx_home_garden_plants_user on public.home_garden_plants(user_id) where home_id is null;
comment on table public.home_garden_plants is 'Giardino e orto: piante o gruppi di piante, con la proposta da cui partono.';

create table if not exists public.home_garden_tasks (
 id uuid primary key default gen_random_uuid(),
 plant_id uuid not null references public.home_garden_plants(id) on delete cascade,
 created_by uuid default auth.uid() references auth.users(id) on delete set null,
 kind text not null default 'other' check (kind in ('fertilize','treatment','pruning','repotting','sowing','harvest','watering','other')),
 title text not null check (char_length(btrim(title)) between 2 and 120),
 product text not null default '' check (char_length(product) <= 120),
 dose text not null default '' check (char_length(dose) <= 120),
 notes text not null default '' check (char_length(notes) <= 1000),
 months smallint[] not null check (cardinality(months) between 1 and 12 and months <@ array[1,2,3,4,5,6,7,8,9,10,11,12]::smallint[]),
 every_days smallint not null default 0 check (every_days between 0 and 365),
 next_on date,
 last_done_on date,
 remind boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists idx_home_garden_tasks_plant on public.home_garden_tasks(plant_id);
create index if not exists idx_home_garden_tasks_created_by on public.home_garden_tasks(created_by);
-- Il lavoro giornaliero cerca gli interventi con promemoria arrivati alla loro data.
create index if not exists idx_home_garden_tasks_next on public.home_garden_tasks(next_on) where remind and next_on is not null;
comment on table public.home_garden_tasks is 'Giardino e orto: piano degli interventi di una pianta (mesi, ripetizione, prossima data).';

create table if not exists public.home_garden_log (
 id uuid primary key default gen_random_uuid(),
 plant_id uuid not null references public.home_garden_plants(id) on delete cascade,
 task_id uuid references public.home_garden_tasks(id) on delete set null,
 created_by uuid default auth.uid() references auth.users(id) on delete set null,
 done_on date not null,
 kind text not null default 'other' check (kind in ('fertilize','treatment','pruning','repotting','sowing','harvest','watering','other')),
 title text not null check (char_length(btrim(title)) between 2 and 120),
 product text not null default '' check (char_length(product) <= 120),
 dose text not null default '' check (char_length(dose) <= 120),
 notes text not null default '' check (char_length(notes) <= 1000),
 created_at timestamptz not null default now()
);
create index if not exists idx_home_garden_log_plant on public.home_garden_log(plant_id, done_on desc);
create index if not exists idx_home_garden_log_task on public.home_garden_log(task_id) where task_id is not null;
create index if not exists idx_home_garden_log_created_by on public.home_garden_log(created_by);
comment on table public.home_garden_log is 'Giardino e orto: registro degli interventi fatti (concimi, trattamenti, potature…).';

-- Data di modifica.
create or replace function private.v57_garden_touch() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;
revoke all on function private.v57_garden_touch() from public, anon, authenticated;
drop trigger if exists v57_garden_plants_touch on public.home_garden_plants;
create trigger v57_garden_plants_touch before update on public.home_garden_plants
 for each row execute function private.v57_garden_touch();
drop trigger if exists v57_garden_tasks_touch on public.home_garden_tasks;
create trigger v57_garden_tasks_touch before update on public.home_garden_tasks
 for each row execute function private.v57_garden_touch();

-- Limiti: 300 piante per spazio, 40 interventi e 2000 righe di registro per pianta.
create or replace function private.v57_garden_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
 if tg_table_name = 'home_garden_plants' then
  perform pg_advisory_xact_lock(hashtextextended('v57_plants:' || coalesce(new.home_id, new.user_id)::text, 0));
  if (select count(*) from public.home_garden_plants p
      where case when new.home_id is null then p.home_id is null and p.user_id = new.user_id else p.home_id = new.home_id end) >= 300 then
   raise exception 'Ci sono già 300 piante in questo spazio.' using errcode = 'P0001';
  end if;
 elsif tg_table_name = 'home_garden_tasks' then
  perform pg_advisory_xact_lock(hashtextextended('v57_tasks:' || new.plant_id::text, 0));
  if (select count(*) from public.home_garden_tasks t where t.plant_id = new.plant_id) >= 40 then
   raise exception 'Questa pianta ha già 40 interventi.' using errcode = 'P0001';
  end if;
 else
  perform pg_advisory_xact_lock(hashtextextended('v57_log:' || new.plant_id::text, 0));
  if (select count(*) from public.home_garden_log l where l.plant_id = new.plant_id) >= 2000 then
   raise exception 'Il registro di questa pianta è pieno (2000 righe).' using errcode = 'P0001';
  end if;
 end if;
 return new;
end $$;
revoke all on function private.v57_garden_limit() from public, anon, authenticated;
drop trigger if exists v57_garden_plants_limit on public.home_garden_plants;
create trigger v57_garden_plants_limit before insert on public.home_garden_plants
 for each row execute function private.v57_garden_limit();
drop trigger if exists v57_garden_tasks_limit on public.home_garden_tasks;
create trigger v57_garden_tasks_limit before insert on public.home_garden_tasks
 for each row execute function private.v57_garden_limit();
drop trigger if exists v57_garden_log_limit on public.home_garden_log;
create trigger v57_garden_log_limit before insert on public.home_garden_log
 for each row execute function private.v57_garden_limit();

-- Una riga del registro può citare solo un intervento della stessa pianta.
create or replace function private.v57_garden_log_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
 if new.task_id is not null and not exists(select 1 from public.home_garden_tasks t where t.id = new.task_id and t.plant_id = new.plant_id) then
  raise exception 'Intervento di un''altra pianta' using errcode = '23514';
 end if;
 return new;
end $$;
revoke all on function private.v57_garden_log_guard() from public, anon, authenticated;
drop trigger if exists v57_garden_log_guard on public.home_garden_log;
create trigger v57_garden_log_guard before insert or update on public.home_garden_log
 for each row execute function private.v57_garden_log_guard();

-- Chi può vedere (write=false) o modificare (write=true) una pianta, e quindi il suo piano e il registro.
create or replace function private.v57_plant_access(target uuid, write boolean) returns boolean
language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.home_garden_plants p where p.id = target
  and case when write then private.v19_can_edit(p.user_id, p.home_id) else private.v19_can_read(p.user_id, p.home_id) end)
$$;
revoke all on function private.v57_plant_access(uuid, boolean) from public, anon;
grant execute on function private.v57_plant_access(uuid, boolean) to authenticated, service_role;

-- Regole di accesso.
alter table public.home_garden_plants enable row level security;
drop policy if exists v57_plants_read on public.home_garden_plants;
drop policy if exists v57_plants_insert on public.home_garden_plants;
drop policy if exists v57_plants_update on public.home_garden_plants;
drop policy if exists v57_plants_delete on public.home_garden_plants;
create policy v57_plants_read on public.home_garden_plants for select to authenticated
 using (private.v19_can_read(user_id, home_id));
create policy v57_plants_insert on public.home_garden_plants for insert to authenticated
 with check (user_id = (select auth.uid()) and private.v19_can_edit(user_id, home_id));
create policy v57_plants_update on public.home_garden_plants for update to authenticated
 using (private.v19_can_edit(user_id, home_id)) with check (private.v19_can_edit(user_id, home_id));
create policy v57_plants_delete on public.home_garden_plants for delete to authenticated
 using (private.v19_can_edit(user_id, home_id));
revoke all on public.home_garden_plants from anon, authenticated;
grant select, insert, delete on public.home_garden_plants to authenticated;
grant update (name, preset, kind, location, notes) on public.home_garden_plants to authenticated;

do $$
declare t text;
begin
 foreach t in array array['home_garden_tasks','home_garden_log'] loop
  execute format('alter table public.%I enable row level security', t);
  execute format('drop policy if exists v57_read on public.%I', t);
  execute format('drop policy if exists v57_insert on public.%I', t);
  execute format('drop policy if exists v57_update on public.%I', t);
  execute format('drop policy if exists v57_delete on public.%I', t);
  execute format('create policy v57_read on public.%I for select to authenticated using (private.v57_plant_access(plant_id, false))', t);
  execute format('create policy v57_insert on public.%I for insert to authenticated with check (created_by = (select auth.uid()) and private.v57_plant_access(plant_id, true))', t);
  execute format('create policy v57_update on public.%I for update to authenticated using (private.v57_plant_access(plant_id, true)) with check (private.v57_plant_access(plant_id, true))', t);
  execute format('create policy v57_delete on public.%I for delete to authenticated using (private.v57_plant_access(plant_id, true))', t);
  execute format('revoke all on public.%I from anon, authenticated', t);
  execute format('grant select, insert, delete on public.%I to authenticated', t);
 end loop;
end $$;
-- Si cambiano i dati dell'intervento, non la pianta a cui appartiene né chi l'ha scritto.
grant update (kind, title, product, dose, notes, months, every_days, next_on, last_done_on, remind) on public.home_garden_tasks to authenticated;
grant update (done_on, kind, title, product, dose, notes) on public.home_garden_log to authenticated;

-- Avvisi del giardino e interruttore delle loro notifiche push.
alter table public.user_alerts drop constraint if exists user_alerts_kind_check;
alter table public.user_alerts add constraint user_alerts_kind_check
 check (kind in ('contract','maintenance','warranty','meter','missing_bill','mail_sync','move','savings','fraud','automation','garden'));
alter table public.user_alert_preferences add column if not exists push_garden boolean not null default true;

commit;
