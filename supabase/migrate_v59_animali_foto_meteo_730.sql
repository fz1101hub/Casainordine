-- Casa in Ordine: animali di casa, foto e diario delle piante, meteo per il giardino, spese detraibili
-- (scelte dell'utente del 25 novembre 2026, sera). Da eseguire una volta nel SQL Editor di Supabase,
-- DOPO migrate_v58_giardino_orto.sql. Rieseguibile.
--
-- Animali di casa:
-- - home_pets: gli animali (cane, gatto…) con razza, nascita, microchip, peso, veterinario e il cibo
--   delle Scorte con quanto ne mangia al giorno; ended_on = non c'è più (resta per la storia, senza promemoria);
-- - home_pet_tasks: il piano di ognuno: vaccini, antiparassitari, vermifughi, visite, toelettatura,
--   medicine, pesate… ogni quanti giorni (0 = una volta), prossima data, promemoria, prodotto delle Scorte;
-- - home_pet_log: il registro (vaccino fatto, visita, peso, spesa del veterinario con il documento).
--   I promemoria li manda il lavoro giornaliero come avvisi «pet» (push con user_alert_preferences.push_pets).
-- Foto e diario delle piante:
-- - home_garden_photos: foto di una pianta (documento dell'archivio dello stesso spazio), anche legata
--   a una riga del registro; home_garden_log accetta il tipo 'note' (nota di diario).
-- Meteo per il giardino:
-- - home_seasonal_settings: posizione approssimativa (2 decimali, circa 1 km) e nome del luogo, per le
--   previsioni di Open-Meteo; frost_alerts = avviso di gelata (avvisi «weather», push_weather).
-- Spese detraibili per il 730:
-- - home_tax_items: le voci di spesa da portare in dichiarazione, per anno e categoria, con modo di
--   pagamento, fornitore e codice fiscale o partita IVA, documento e, se nasce da una bolletta, una
--   spesa, un lavoro o il veterinario, il collegamento alla voce di origine (una volta sola).
-- Accesso come le altre voci della casa: i membri leggono, proprietario ed editor scrivono; nello spazio
-- personale solo l'autore. Piano, registro e foto seguono il loro animale o la loro pianta.
-- Limiti: 50 animali per spazio, 40 interventi e 3000 righe di registro per animale, 300 foto per pianta,
-- 5000 voci detraibili per spazio.
begin;

-- ===== Animali di casa =====
create table if not exists public.home_pets (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 home_id uuid references public.homes(id) on delete cascade,
 name text not null check (char_length(btrim(name)) between 1 and 80),
 species text not null default 'other' check (species in ('dog','cat','rabbit','ferret','bird','fish','reptile','rodent','horse','other')),
 preset text check (preset ~ '^[a-z][a-z_]{1,39}$'),
 breed text not null default '' check (char_length(breed) <= 80),
 sex text check (sex in ('female','male')),
 birth_on date,
 neutered boolean not null default false,
 microchip text not null default '' check (char_length(microchip) <= 30),
 weight_kg numeric(6,2) check (weight_kg is null or weight_kg > 0 and weight_kg <= 1500),
 food_stock_item_id uuid references public.home_stock_items(id) on delete set null,
 food_daily numeric(10,2) check (food_daily is null or food_daily > 0 and food_daily <= 100000),
 vet_name text not null default '' check (char_length(vet_name) <= 120),
 vet_phone text not null default '' check (char_length(vet_phone) <= 40),
 notes text not null default '' check (char_length(notes) <= 1000),
 ended_on date,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check (ended_on is null or birth_on is null or ended_on >= birth_on)
);
create index if not exists idx_home_pets_home on public.home_pets(home_id) where home_id is not null;
create index if not exists idx_home_pets_user on public.home_pets(user_id) where home_id is null;
create index if not exists idx_home_pets_food on public.home_pets(food_stock_item_id) where food_stock_item_id is not null;
comment on table public.home_pets is 'Animali di casa: scheda, veterinario e cibo dalle Scorte.';

create table if not exists public.home_pet_tasks (
 id uuid primary key default gen_random_uuid(),
 pet_id uuid not null references public.home_pets(id) on delete cascade,
 created_by uuid default auth.uid() references auth.users(id) on delete set null,
 kind text not null default 'other' check (kind in ('vaccine','antiparasitic','deworming','vet_visit','grooming','medicine','weight','other')),
 title text not null check (char_length(btrim(title)) between 2 and 120),
 product text not null default '' check (char_length(product) <= 120),
 dose text not null default '' check (char_length(dose) <= 120),
 notes text not null default '' check (char_length(notes) <= 1000),
 every_days smallint not null default 0 check (every_days between 0 and 1095),
 next_on date,
 last_done_on date,
 remind boolean not null default true,
 stock_item_id uuid references public.home_stock_items(id) on delete set null,
 stock_use numeric(12,2) check (stock_use is null or stock_use > 0 and stock_use <= 100000),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists idx_home_pet_tasks_pet on public.home_pet_tasks(pet_id);
create index if not exists idx_home_pet_tasks_created_by on public.home_pet_tasks(created_by);
create index if not exists idx_home_pet_tasks_stock on public.home_pet_tasks(stock_item_id) where stock_item_id is not null;
create index if not exists idx_home_pet_tasks_next on public.home_pet_tasks(next_on) where remind and next_on is not null;
comment on table public.home_pet_tasks is 'Animali di casa: piano di vaccini, antiparassitari, visite e cure.';

create table if not exists public.home_pet_log (
 id uuid primary key default gen_random_uuid(),
 pet_id uuid not null references public.home_pets(id) on delete cascade,
 task_id uuid references public.home_pet_tasks(id) on delete set null,
 created_by uuid default auth.uid() references auth.users(id) on delete set null,
 done_on date not null,
 kind text not null default 'other' check (kind in ('vaccine','antiparasitic','deworming','vet_visit','grooming','medicine','weight','note','other')),
 title text not null check (char_length(btrim(title)) between 2 and 120),
 product text not null default '' check (char_length(product) <= 120),
 dose text not null default '' check (char_length(dose) <= 120),
 notes text not null default '' check (char_length(notes) <= 1000),
 weight_kg numeric(6,2) check (weight_kg is null or weight_kg > 0 and weight_kg <= 1500),
 cost_cents integer check (cost_cents is null or cost_cents between 0 and 10000000),
 document_id uuid references public.home_documents(id) on delete set null,
 created_at timestamptz not null default now()
);
create index if not exists idx_home_pet_log_pet on public.home_pet_log(pet_id, done_on desc);
create index if not exists idx_home_pet_log_task on public.home_pet_log(task_id) where task_id is not null;
create index if not exists idx_home_pet_log_created_by on public.home_pet_log(created_by);
create index if not exists idx_home_pet_log_document on public.home_pet_log(document_id) where document_id is not null;
comment on table public.home_pet_log is 'Animali di casa: registro di vaccini, visite, pesate e spese.';

-- ===== Foto e diario delle piante =====
create table if not exists public.home_garden_photos (
 id uuid primary key default gen_random_uuid(),
 plant_id uuid not null references public.home_garden_plants(id) on delete cascade,
 log_id uuid references public.home_garden_log(id) on delete set null,
 created_by uuid default auth.uid() references auth.users(id) on delete set null,
 document_id uuid not null references public.home_documents(id) on delete cascade,
 caption text not null default '' check (char_length(caption) <= 200),
 taken_on date not null default current_date,
 created_at timestamptz not null default now(),
 unique (plant_id, document_id)
);
create index if not exists idx_home_garden_photos_plant on public.home_garden_photos(plant_id, taken_on desc);
create index if not exists idx_home_garden_photos_log on public.home_garden_photos(log_id) where log_id is not null;
create index if not exists idx_home_garden_photos_document on public.home_garden_photos(document_id);
create index if not exists idx_home_garden_photos_created_by on public.home_garden_photos(created_by);
comment on table public.home_garden_photos is 'Giardino e orto: foto delle piante nel tempo (documenti dell''archivio).';

alter table public.home_garden_log drop constraint if exists home_garden_log_kind_check;
alter table public.home_garden_log add constraint home_garden_log_kind_check
 check (kind in ('fertilize','treatment','pruning','repotting','sowing','harvest','watering','note','other'));

-- ===== Meteo per il giardino =====
alter table public.home_seasonal_settings add column if not exists weather_lat numeric(5,2);
alter table public.home_seasonal_settings add column if not exists weather_lon numeric(6,2);
alter table public.home_seasonal_settings add column if not exists weather_place text not null default '';
alter table public.home_seasonal_settings add column if not exists frost_alerts boolean not null default true;
alter table public.home_seasonal_settings drop constraint if exists home_seasonal_settings_v59_check;
alter table public.home_seasonal_settings add constraint home_seasonal_settings_v59_check check (
 (weather_lat is null) = (weather_lon is null)
 and (weather_lat is null or weather_lat between -90 and 90)
 and (weather_lon is null or weather_lon between -180 and 180)
 and char_length(weather_place) <= 80);
grant update (weather_lat, weather_lon, weather_place, frost_alerts) on public.home_seasonal_settings to authenticated;

-- ===== Spese detraibili =====
create table if not exists public.home_tax_items (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 home_id uuid references public.homes(id) on delete cascade,
 tax_year smallint not null check (tax_year between 2000 and 2100),
 category text not null check (category ~ '^[a-z][a-z_]{1,29}$'),
 description text not null check (char_length(btrim(description)) between 2 and 200),
 amount_cents integer not null check (amount_cents between 1 and 100000000),
 paid_on date,
 payment_method text check (payment_method in ('tax_transfer','traceable','cash','other')),
 supplier text not null default '' check (char_length(supplier) <= 120),
 supplier_tax_code text not null default '' check (char_length(supplier_tax_code) <= 20),
 document_id uuid references public.home_documents(id) on delete set null,
 source text not null default 'manual' check (source in ('manual','bill','home_expense','project_expense','pet_log')),
 source_id uuid,
 notes text not null default '' check (char_length(notes) <= 1000),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check ((source = 'manual') = (source_id is null))
);
create index if not exists idx_home_tax_items_home on public.home_tax_items(home_id, tax_year) where home_id is not null;
create index if not exists idx_home_tax_items_user on public.home_tax_items(user_id, tax_year) where home_id is null;
create index if not exists idx_home_tax_items_document on public.home_tax_items(document_id) where document_id is not null;
-- La stessa bolletta, spesa, voce di lavoro o visita si segna una volta sola.
create unique index if not exists uq_home_tax_items_source on public.home_tax_items(source, source_id) where source_id is not null;
comment on table public.home_tax_items is 'Spese detraibili: voci per la dichiarazione dei redditi, per anno e categoria.';

-- ===== Data di modifica =====
create or replace function private.v59_touch() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;
revoke all on function private.v59_touch() from public, anon, authenticated;
drop trigger if exists v59_pets_touch on public.home_pets;
create trigger v59_pets_touch before update on public.home_pets for each row execute function private.v59_touch();
drop trigger if exists v59_pet_tasks_touch on public.home_pet_tasks;
create trigger v59_pet_tasks_touch before update on public.home_pet_tasks for each row execute function private.v59_touch();
drop trigger if exists v59_tax_items_touch on public.home_tax_items;
create trigger v59_tax_items_touch before update on public.home_tax_items for each row execute function private.v59_touch();

-- ===== Limiti =====
create or replace function private.v59_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare j jsonb := to_jsonb(new);
begin
 if tg_table_name = 'home_pets' then
  perform pg_advisory_xact_lock(hashtextextended('v59_pets:' || coalesce(new.home_id, new.user_id)::text, 0));
  if (select count(*) from public.home_pets p
      where case when new.home_id is null then p.home_id is null and p.user_id = new.user_id else p.home_id = new.home_id end) >= 50 then
   raise exception 'Ci sono già 50 animali in questo spazio.' using errcode = 'P0001';
  end if;
 elsif tg_table_name = 'home_pet_tasks' then
  perform pg_advisory_xact_lock(hashtextextended('v59_pet_tasks:' || (j->>'pet_id'), 0));
  if (select count(*) from public.home_pet_tasks t where t.pet_id = (j->>'pet_id')::uuid) >= 40 then
   raise exception 'Questo animale ha già 40 voci nel piano.' using errcode = 'P0001';
  end if;
 elsif tg_table_name = 'home_pet_log' then
  perform pg_advisory_xact_lock(hashtextextended('v59_pet_log:' || (j->>'pet_id'), 0));
  if (select count(*) from public.home_pet_log l where l.pet_id = (j->>'pet_id')::uuid) >= 3000 then
   raise exception 'Il registro di questo animale è pieno (3000 righe).' using errcode = 'P0001';
  end if;
 elsif tg_table_name = 'home_garden_photos' then
  perform pg_advisory_xact_lock(hashtextextended('v59_photos:' || (j->>'plant_id'), 0));
  if (select count(*) from public.home_garden_photos f where f.plant_id = (j->>'plant_id')::uuid) >= 300 then
   raise exception 'Questa pianta ha già 300 foto.' using errcode = 'P0001';
  end if;
 else
  perform pg_advisory_xact_lock(hashtextextended('v59_tax:' || coalesce(j->>'home_id', j->>'user_id'), 0));
  if (select count(*) from public.home_tax_items x
      where case when j->>'home_id' is null then x.home_id is null and x.user_id = (j->>'user_id')::uuid else x.home_id = (j->>'home_id')::uuid end) >= 5000 then
   raise exception 'Ci sono già 5000 voci detraibili in questo spazio.' using errcode = 'P0001';
  end if;
 end if;
 return new;
end $$;
revoke all on function private.v59_limit() from public, anon, authenticated;
drop trigger if exists v59_pets_limit on public.home_pets;
create trigger v59_pets_limit before insert on public.home_pets for each row execute function private.v59_limit();
drop trigger if exists v59_pet_tasks_limit on public.home_pet_tasks;
create trigger v59_pet_tasks_limit before insert on public.home_pet_tasks for each row execute function private.v59_limit();
drop trigger if exists v59_pet_log_limit on public.home_pet_log;
create trigger v59_pet_log_limit before insert on public.home_pet_log for each row execute function private.v59_limit();
drop trigger if exists v59_garden_photos_limit on public.home_garden_photos;
create trigger v59_garden_photos_limit before insert on public.home_garden_photos for each row execute function private.v59_limit();
drop trigger if exists v59_tax_items_limit on public.home_tax_items;
create trigger v59_tax_items_limit before insert on public.home_tax_items for each row execute function private.v59_limit();

-- ===== Collegamenti dello stesso spazio =====
-- Scorte, documenti, interventi e righe del registro collegati appartengono allo stesso spazio (o allo
-- stesso animale o pianta) della voce che li cita.
create or replace function private.v59_same_space(ref_user uuid, ref_home uuid, own_user uuid, own_home uuid) returns boolean
language sql immutable set search_path = '' as $$
 select coalesce(case when own_home is null then ref_home is null and ref_user = own_user else ref_home is not distinct from own_home end, false)
$$;
revoke all on function private.v59_same_space(uuid, uuid, uuid, uuid) from public, anon, authenticated;

create or replace function private.v59_reference_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare j jsonb := to_jsonb(new); o_user uuid; o_home uuid; r_user uuid; r_home uuid;
begin
 if tg_table_name in ('home_pets','home_tax_items') then
  o_user := (j->>'user_id')::uuid; o_home := (j->>'home_id')::uuid;
 elsif tg_table_name = 'home_garden_photos' then
  select p.user_id, p.home_id into o_user, o_home from public.home_garden_plants p where p.id = (j->>'plant_id')::uuid;
  if not found then raise exception 'Pianta non trovata' using errcode = '23503'; end if;
 else
  select p.user_id, p.home_id into o_user, o_home from public.home_pets p where p.id = (j->>'pet_id')::uuid;
  if not found then raise exception 'Animale non trovato' using errcode = '23503'; end if;
 end if;
 if j->>'food_stock_item_id' is not null or j->>'stock_item_id' is not null then
  select s.user_id, s.home_id into r_user, r_home from public.home_stock_items s
   where s.id = coalesce(j->>'food_stock_item_id', j->>'stock_item_id')::uuid;
  if not found or not private.v59_same_space(r_user, r_home, o_user, o_home) then
   raise exception 'La scorta è di un altro spazio' using errcode = '23514';
  end if;
 end if;
 if j->>'document_id' is not null then
  select d.user_id, d.home_id into r_user, r_home from public.home_documents d where d.id = (j->>'document_id')::uuid;
  if not found or not private.v59_same_space(r_user, r_home, o_user, o_home) then
   raise exception 'Il documento è di un altro spazio' using errcode = '23514';
  end if;
 end if;
 if tg_table_name = 'home_pet_log' and j->>'task_id' is not null
    and not exists(select 1 from public.home_pet_tasks t where t.id = (j->>'task_id')::uuid and t.pet_id = (j->>'pet_id')::uuid) then
  raise exception 'Voce del piano di un altro animale' using errcode = '23514';
 end if;
 if tg_table_name = 'home_garden_photos' and j->>'log_id' is not null
    and not exists(select 1 from public.home_garden_log l where l.id = (j->>'log_id')::uuid and l.plant_id = (j->>'plant_id')::uuid) then
  raise exception 'Riga del registro di un''altra pianta' using errcode = '23514';
 end if;
 return new;
end $$;
revoke all on function private.v59_reference_guard() from public, anon, authenticated;
drop trigger if exists v59_pets_guard on public.home_pets;
create trigger v59_pets_guard before insert or update of food_stock_item_id, user_id, home_id on public.home_pets
 for each row execute function private.v59_reference_guard();
drop trigger if exists v59_pet_tasks_guard on public.home_pet_tasks;
create trigger v59_pet_tasks_guard before insert or update of stock_item_id, pet_id on public.home_pet_tasks
 for each row execute function private.v59_reference_guard();
drop trigger if exists v59_pet_log_guard on public.home_pet_log;
create trigger v59_pet_log_guard before insert or update of task_id, document_id, pet_id on public.home_pet_log
 for each row execute function private.v59_reference_guard();
drop trigger if exists v59_garden_photos_guard on public.home_garden_photos;
create trigger v59_garden_photos_guard before insert or update of document_id, log_id, plant_id on public.home_garden_photos
 for each row execute function private.v59_reference_guard();
drop trigger if exists v59_tax_items_guard on public.home_tax_items;
create trigger v59_tax_items_guard before insert or update of document_id, user_id, home_id on public.home_tax_items
 for each row execute function private.v59_reference_guard();

-- Chi può vedere (write=false) o modificare (write=true) un animale, e quindi il suo piano e il registro.
create or replace function private.v59_pet_access(target uuid, write boolean) returns boolean
language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.home_pets p where p.id = target
  and case when write then private.v19_can_edit(p.user_id, p.home_id) else private.v19_can_read(p.user_id, p.home_id) end)
$$;
revoke all on function private.v59_pet_access(uuid, boolean) from public, anon;
grant execute on function private.v59_pet_access(uuid, boolean) to authenticated, service_role;

-- ===== Regole di accesso =====
-- Voci di uno spazio: animali e spese detraibili.
do $$
declare t text;
begin
 foreach t in array array['home_pets','home_tax_items'] loop
  execute format('alter table public.%I enable row level security', t);
  execute format('drop policy if exists v59_read on public.%I', t);
  execute format('drop policy if exists v59_insert on public.%I', t);
  execute format('drop policy if exists v59_update on public.%I', t);
  execute format('drop policy if exists v59_delete on public.%I', t);
  execute format('create policy v59_read on public.%I for select to authenticated using (private.v19_can_read(user_id, home_id))', t);
  execute format('create policy v59_insert on public.%I for insert to authenticated with check (user_id = (select auth.uid()) and private.v19_can_edit(user_id, home_id))', t);
  execute format('create policy v59_update on public.%I for update to authenticated using (private.v19_can_edit(user_id, home_id)) with check (private.v19_can_edit(user_id, home_id))', t);
  execute format('create policy v59_delete on public.%I for delete to authenticated using (private.v19_can_edit(user_id, home_id))', t);
  execute format('revoke all on public.%I from anon, authenticated', t);
  execute format('grant select, insert, delete on public.%I to authenticated', t);
 end loop;
 -- Voci di un animale.
 foreach t in array array['home_pet_tasks','home_pet_log'] loop
  execute format('alter table public.%I enable row level security', t);
  execute format('drop policy if exists v59_read on public.%I', t);
  execute format('drop policy if exists v59_insert on public.%I', t);
  execute format('drop policy if exists v59_update on public.%I', t);
  execute format('drop policy if exists v59_delete on public.%I', t);
  execute format('create policy v59_read on public.%I for select to authenticated using (private.v59_pet_access(pet_id, false))', t);
  execute format('create policy v59_insert on public.%I for insert to authenticated with check (created_by = (select auth.uid()) and private.v59_pet_access(pet_id, true))', t);
  execute format('create policy v59_update on public.%I for update to authenticated using (private.v59_pet_access(pet_id, true)) with check (private.v59_pet_access(pet_id, true))', t);
  execute format('create policy v59_delete on public.%I for delete to authenticated using (private.v59_pet_access(pet_id, true))', t);
  execute format('revoke all on public.%I from anon, authenticated', t);
  execute format('grant select, insert, delete on public.%I to authenticated', t);
 end loop;
end $$;
-- Foto delle piante: come piano e registro della pianta.
alter table public.home_garden_photos enable row level security;
drop policy if exists v59_read on public.home_garden_photos;
drop policy if exists v59_insert on public.home_garden_photos;
drop policy if exists v59_update on public.home_garden_photos;
drop policy if exists v59_delete on public.home_garden_photos;
create policy v59_read on public.home_garden_photos for select to authenticated using (private.v57_plant_access(plant_id, false));
create policy v59_insert on public.home_garden_photos for insert to authenticated
 with check (created_by = (select auth.uid()) and private.v57_plant_access(plant_id, true));
create policy v59_update on public.home_garden_photos for update to authenticated
 using (private.v57_plant_access(plant_id, true)) with check (private.v57_plant_access(plant_id, true));
create policy v59_delete on public.home_garden_photos for delete to authenticated using (private.v57_plant_access(plant_id, true));
revoke all on public.home_garden_photos from anon, authenticated;
grant select, insert, delete on public.home_garden_photos to authenticated;

-- Si cambiano i dati, non lo spazio, l'animale o la pianta a cui appartengono né chi li ha scritti.
grant update (name, species, preset, breed, sex, birth_on, neutered, microchip, weight_kg, food_stock_item_id, food_daily, vet_name, vet_phone, notes, ended_on) on public.home_pets to authenticated;
grant update (kind, title, product, dose, notes, every_days, next_on, last_done_on, remind, stock_item_id, stock_use) on public.home_pet_tasks to authenticated;
grant update (done_on, kind, title, product, dose, notes, weight_kg, cost_cents, document_id) on public.home_pet_log to authenticated;
grant update (log_id, caption, taken_on) on public.home_garden_photos to authenticated;
grant update (tax_year, category, description, amount_cents, paid_on, payment_method, supplier, supplier_tax_code, document_id, notes) on public.home_tax_items to authenticated;

-- ===== Avvisi e notifiche push =====
alter table public.user_alerts drop constraint if exists user_alerts_kind_check;
alter table public.user_alerts add constraint user_alerts_kind_check
 check (kind in ('contract','maintenance','warranty','meter','missing_bill','mail_sync','move','savings','fraud','automation','garden','pet','weather'));
alter table public.user_alert_preferences add column if not exists push_pets boolean not null default true;
alter table public.user_alert_preferences add column if not exists push_weather boolean not null default true;

commit;
