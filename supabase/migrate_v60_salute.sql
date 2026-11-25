-- Casa in Ordine: terapie, medicine e visite (richiesta dell'utente del 25 novembre 2026, sera:
-- «medicine da prendere e terapie da fare per sé o per altri, con il promemoria all'ora della
-- terapia o il giorno della visita, vaccinazione ecc.»). Da eseguire una volta nel SQL Editor di
-- Supabase, DOPO migrate_v59_animali_foto_meteo_730.sql. Rieseguibile.
--
-- Sono dati sanitari: stanno nello spazio scelto (di partenza quello personale, visibile solo a chi
-- li scrive); in una casa condivisa li vedono i membri, come le altre voci della casa.
-- - health_people: le persone seguite (sé stessi, figli, genitori…), anche senza account;
-- - health_therapies: medicine e terapie con dose, orari del giorno (fino a 12), ogni quanti giorni
--   o in quali giorni della settimana, dal giorno al giorno (o senza fine), promemoria sì/no e,
--   se si vuole, la confezione delle Scorte con quante unità si usano ogni volta;
-- - health_doses: le dosi del giorno, una per terapia e orario: «in attesa» quando parte il
--   promemoria, poi «presa» o «saltata»;
-- - health_appointments: visite, vaccinazioni, esami, ricette da rinnovare, con data, ora
--   facoltativa, luogo, promemoria (il giorno prima alle 18, la mattina stessa alle 8, un'ora
--   prima), ripetizione ogni N mesi e «fatto»;
-- - health_reminders_sent: promemoria delle visite già mandati (solo il server).
-- I promemoria li manda /api/cron/health ogni 5 minuti (migrate_v60_cron_salute.sql), come avvisi
-- «health» con la notifica push se la persona la vuole (user_alert_preferences.push_health); il
-- nome del farmaco o della visita compare nella notifica solo con health_push_details.
-- Limiti: 30 persone per spazio, 50 terapie e 500 appuntamenti per persona.
begin;

create table if not exists public.health_people (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 home_id uuid references public.homes(id) on delete cascade,
 name text not null check (char_length(btrim(name)) between 1 and 80),
 relation text not null default 'other' check (relation in ('self','partner','child','parent','other')),
 birth_on date,
 notes text not null default '' check (char_length(notes) <= 1000),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists idx_health_people_home on public.health_people(home_id) where home_id is not null;
create index if not exists idx_health_people_user on public.health_people(user_id) where home_id is null;
comment on table public.health_people is 'Salute: persone seguite (sé stessi, familiari), anche senza account.';

create table if not exists public.health_therapies (
 id uuid primary key default gen_random_uuid(),
 person_id uuid not null references public.health_people(id) on delete cascade,
 created_by uuid default auth.uid() references auth.users(id) on delete set null,
 kind text not null default 'medicine' check (kind in ('medicine','supplement','therapy','other')),
 name text not null check (char_length(btrim(name)) between 2 and 120),
 dose text not null default '' check (char_length(dose) <= 120),
 instructions text not null default '' check (char_length(instructions) <= 300),
 times time[] not null check (cardinality(times) between 1 and 12),
 every_days smallint not null default 1 check (every_days between 1 and 90),
 weekdays smallint[] check (weekdays is null or (cardinality(weekdays) between 1 and 7 and weekdays <@ array[1,2,3,4,5,6,7]::smallint[])),
 start_on date not null default current_date,
 end_on date,
 remind boolean not null default true,
 stock_item_id uuid references public.home_stock_items(id) on delete set null,
 stock_use numeric(10,2) check (stock_use is null or stock_use > 0 and stock_use <= 1000),
 notes text not null default '' check (char_length(notes) <= 1000),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check (end_on is null or end_on >= start_on)
);
create index if not exists idx_health_therapies_person on public.health_therapies(person_id);
create index if not exists idx_health_therapies_created_by on public.health_therapies(created_by);
create index if not exists idx_health_therapies_stock on public.health_therapies(stock_item_id) where stock_item_id is not null;
-- Il giro dei promemoria cerca le terapie attive con il promemoria acceso.
create index if not exists idx_health_therapies_active on public.health_therapies(start_on, end_on) where remind;
comment on table public.health_therapies is 'Salute: medicine e terapie con orari, giorni, durata e promemoria.';

create table if not exists public.health_doses (
 id uuid primary key default gen_random_uuid(),
 therapy_id uuid not null references public.health_therapies(id) on delete cascade,
 due_at timestamptz not null,
 status text not null default 'pending' check (status in ('pending','taken','skipped')),
 done_at timestamptz,
 created_by uuid default auth.uid() references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 unique (therapy_id, due_at)
);
create index if not exists idx_health_doses_therapy on public.health_doses(therapy_id, due_at desc);
create index if not exists idx_health_doses_created_by on public.health_doses(created_by);
comment on table public.health_doses is 'Salute: dosi del giorno (in attesa, presa, saltata), una per terapia e orario.';

create table if not exists public.health_appointments (
 id uuid primary key default gen_random_uuid(),
 person_id uuid not null references public.health_people(id) on delete cascade,
 created_by uuid default auth.uid() references auth.users(id) on delete set null,
 kind text not null default 'visit' check (kind in ('visit','vaccine','exam','prescription','therapy','other')),
 title text not null check (char_length(btrim(title)) between 2 and 120),
 on_date date not null,
 at_time time,
 place text not null default '' check (char_length(place) <= 120),
 notes text not null default '' check (char_length(notes) <= 1000),
 reminders text[] not null default array['day_before']::text[]
  check (reminders <@ array['day_before','same_morning','hour_before']::text[] and cardinality(reminders) <= 3),
 repeat_months smallint not null default 0 check (repeat_months between 0 and 120),
 done_on date,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists idx_health_appointments_person on public.health_appointments(person_id, on_date);
create index if not exists idx_health_appointments_created_by on public.health_appointments(created_by);
-- Il giro dei promemoria cerca le visite non fatte di oggi e di domani.
create index if not exists idx_health_appointments_open on public.health_appointments(on_date) where done_on is null;
comment on table public.health_appointments is 'Salute: visite, vaccinazioni, esami e ricette con data, ora e promemoria.';

create table if not exists public.health_reminders_sent (
 id uuid primary key default gen_random_uuid(),
 appointment_id uuid not null references public.health_appointments(id) on delete cascade,
 code text not null check (code in ('day_before','same_morning','hour_before')),
 due_at timestamptz not null,
 created_at timestamptz not null default now(),
 unique (appointment_id, code, due_at)
);
create index if not exists idx_health_reminders_sent_created on public.health_reminders_sent(created_at);
comment on table public.health_reminders_sent is 'Salute: promemoria delle visite già mandati (solo il server).';

-- Data di modifica.
create or replace function private.v60_touch() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;
revoke all on function private.v60_touch() from public, anon, authenticated;
drop trigger if exists v60_people_touch on public.health_people;
create trigger v60_people_touch before update on public.health_people for each row execute function private.v60_touch();
drop trigger if exists v60_therapies_touch on public.health_therapies;
create trigger v60_therapies_touch before update on public.health_therapies for each row execute function private.v60_touch();
drop trigger if exists v60_appointments_touch on public.health_appointments;
create trigger v60_appointments_touch before update on public.health_appointments for each row execute function private.v60_touch();

-- Limiti: 30 persone per spazio, 50 terapie e 500 appuntamenti per persona.
create or replace function private.v60_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare j jsonb := to_jsonb(new);
begin
 if tg_table_name = 'health_people' then
  perform pg_advisory_xact_lock(hashtextextended('v60_people:' || coalesce(new.home_id, new.user_id)::text, 0));
  if (select count(*) from public.health_people p
      where case when new.home_id is null then p.home_id is null and p.user_id = new.user_id else p.home_id = new.home_id end) >= 30 then
   raise exception 'Ci sono già 30 persone in questo spazio.' using errcode = 'P0001';
  end if;
 elsif tg_table_name = 'health_therapies' then
  perform pg_advisory_xact_lock(hashtextextended('v60_therapies:' || (j->>'person_id'), 0));
  if (select count(*) from public.health_therapies t where t.person_id = (j->>'person_id')::uuid) >= 50 then
   raise exception 'Questa persona ha già 50 terapie.' using errcode = 'P0001';
  end if;
 else
  perform pg_advisory_xact_lock(hashtextextended('v60_appointments:' || (j->>'person_id'), 0));
  if (select count(*) from public.health_appointments a where a.person_id = (j->>'person_id')::uuid) >= 500 then
   raise exception 'Questa persona ha già 500 appuntamenti.' using errcode = 'P0001';
  end if;
 end if;
 return new;
end $$;
revoke all on function private.v60_limit() from public, anon, authenticated;
drop trigger if exists v60_people_limit on public.health_people;
create trigger v60_people_limit before insert on public.health_people for each row execute function private.v60_limit();
drop trigger if exists v60_therapies_limit on public.health_therapies;
create trigger v60_therapies_limit before insert on public.health_therapies for each row execute function private.v60_limit();
drop trigger if exists v60_appointments_limit on public.health_appointments;
create trigger v60_appointments_limit before insert on public.health_appointments for each row execute function private.v60_limit();

-- La confezione delle Scorte collegata a una terapia è dello stesso spazio della persona.
create or replace function private.v60_stock_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
 if new.stock_item_id is not null and not exists(
   select 1 from public.health_people p join public.home_stock_items s on s.id = new.stock_item_id
   where p.id = new.person_id
     and case when p.home_id is null then s.home_id is null and s.user_id = p.user_id else s.home_id = p.home_id end) then
  raise exception 'La scorta è di un altro spazio' using errcode = '23514';
 end if;
 return new;
end $$;
revoke all on function private.v60_stock_guard() from public, anon, authenticated;
drop trigger if exists v60_therapies_stock_guard on public.health_therapies;
create trigger v60_therapies_stock_guard before insert or update of stock_item_id, person_id on public.health_therapies
 for each row execute function private.v60_stock_guard();

-- Chi può vedere (write=false) o modificare (write=true) una persona, e quindi terapie, dosi e visite.
create or replace function private.v60_person_access(target uuid, write boolean) returns boolean
language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.health_people p where p.id = target
  and case when write then private.v19_can_edit(p.user_id, p.home_id) else private.v19_can_read(p.user_id, p.home_id) end)
$$;
revoke all on function private.v60_person_access(uuid, boolean) from public, anon;
grant execute on function private.v60_person_access(uuid, boolean) to authenticated, service_role;

create or replace function private.v60_therapy_access(target uuid, write boolean) returns boolean
language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.health_therapies t where t.id = target and private.v60_person_access(t.person_id, write))
$$;
revoke all on function private.v60_therapy_access(uuid, boolean) from public, anon;
grant execute on function private.v60_therapy_access(uuid, boolean) to authenticated, service_role;

-- Regole di accesso.
alter table public.health_people enable row level security;
drop policy if exists v60_read on public.health_people;
drop policy if exists v60_insert on public.health_people;
drop policy if exists v60_update on public.health_people;
drop policy if exists v60_delete on public.health_people;
create policy v60_read on public.health_people for select to authenticated using (private.v19_can_read(user_id, home_id));
create policy v60_insert on public.health_people for insert to authenticated with check (user_id = (select auth.uid()) and private.v19_can_edit(user_id, home_id));
create policy v60_update on public.health_people for update to authenticated using (private.v19_can_edit(user_id, home_id)) with check (private.v19_can_edit(user_id, home_id));
create policy v60_delete on public.health_people for delete to authenticated using (private.v19_can_edit(user_id, home_id));
revoke all on public.health_people from anon, authenticated;
grant select, insert, delete on public.health_people to authenticated;
grant update (name, relation, birth_on, notes) on public.health_people to authenticated;

do $$
declare t text;
begin
 foreach t in array array['health_therapies','health_appointments'] loop
  execute format('alter table public.%I enable row level security', t);
  execute format('drop policy if exists v60_read on public.%I', t);
  execute format('drop policy if exists v60_insert on public.%I', t);
  execute format('drop policy if exists v60_update on public.%I', t);
  execute format('drop policy if exists v60_delete on public.%I', t);
  execute format('create policy v60_read on public.%I for select to authenticated using (private.v60_person_access(person_id, false))', t);
  execute format('create policy v60_insert on public.%I for insert to authenticated with check (created_by = (select auth.uid()) and private.v60_person_access(person_id, true))', t);
  execute format('create policy v60_update on public.%I for update to authenticated using (private.v60_person_access(person_id, true)) with check (private.v60_person_access(person_id, true))', t);
  execute format('create policy v60_delete on public.%I for delete to authenticated using (private.v60_person_access(person_id, true))', t);
  execute format('revoke all on public.%I from anon, authenticated', t);
  execute format('grant select, insert, delete on public.%I to authenticated', t);
 end loop;
end $$;
grant update (kind, name, dose, instructions, times, every_days, weekdays, start_on, end_on, remind, stock_item_id, stock_use, notes) on public.health_therapies to authenticated;
grant update (kind, title, on_date, at_time, place, notes, reminders, repeat_months, done_on) on public.health_appointments to authenticated;

alter table public.health_doses enable row level security;
drop policy if exists v60_read on public.health_doses;
drop policy if exists v60_insert on public.health_doses;
drop policy if exists v60_update on public.health_doses;
drop policy if exists v60_delete on public.health_doses;
create policy v60_read on public.health_doses for select to authenticated using (private.v60_therapy_access(therapy_id, false));
create policy v60_insert on public.health_doses for insert to authenticated with check (created_by = (select auth.uid()) and private.v60_therapy_access(therapy_id, true));
create policy v60_update on public.health_doses for update to authenticated using (private.v60_therapy_access(therapy_id, true)) with check (private.v60_therapy_access(therapy_id, true));
create policy v60_delete on public.health_doses for delete to authenticated using (private.v60_therapy_access(therapy_id, true));
revoke all on public.health_doses from anon, authenticated;
grant select, insert, delete on public.health_doses to authenticated;
grant update (status, done_at) on public.health_doses to authenticated;

-- Promemoria delle visite già mandati: solo il server (nessuna regola per gli utenti).
alter table public.health_reminders_sent enable row level security;
revoke all on public.health_reminders_sent from anon, authenticated;

-- Avvisi della salute e interruttori delle loro notifiche push.
alter table public.user_alerts drop constraint if exists user_alerts_kind_check;
alter table public.user_alerts add constraint user_alerts_kind_check
 check (kind in ('contract','maintenance','warranty','meter','missing_bill','mail_sync','move','savings','fraud','automation','garden','pet','weather','health'));
alter table public.user_alert_preferences add column if not exists push_health boolean not null default true;
alter table public.user_alert_preferences add column if not exists health_push_details boolean not null default false;

commit;
