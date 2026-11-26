-- Casa in Ordine: scheda d'emergenza, spese sanitarie per il 730 e bilanci di salute del pediatra
-- (scelte dell'utente del 26 novembre 2026, notte). Da eseguire una volta nel SQL Editor di Supabase,
-- DOPO migrate_v61_vaccini_bambini.sql. Rieseguibile.
--
-- - health_people: gruppo sanguigno, allergie, patologie e cose da sapere, medico o pediatra e
--   persona da chiamare (con telefono) per la scheda d'emergenza da stampare; checkup_plan accende
--   le tappe dei bilanci di salute (lib/health.mjs, CHECKUP_SCHEDULE) con gli stessi avvisi dei vaccini;
-- - health_expenses: spese sanitarie di una persona (farmaci, dispositivi medici, visite ed esami,
--   ticket del Servizio sanitario), con pagamento e, se si vuole, la visita da cui vengono; si portano
--   tra le Spese detraibili come voci «health_expense»;
-- - home_tax_items.cash_ok: per farmaci, dispositivi medici e prestazioni del Servizio sanitario
--   (pubbliche o accreditate) il pagamento in contanti non fa perdere la detrazione (legge 160/2019,
--   art. 1 commi 679-680): niente avviso «pagamento tracciabile» su queste voci.
-- Limite: 2000 spese per persona.
begin;

-- ===== Scheda d'emergenza e bilanci di salute =====
alter table public.health_people add column if not exists blood_type text;
alter table public.health_people add column if not exists allergies text not null default '';
alter table public.health_people add column if not exists conditions text not null default '';
alter table public.health_people add column if not exists doctor_name text not null default '';
alter table public.health_people add column if not exists doctor_phone text not null default '';
alter table public.health_people add column if not exists emergency_name text not null default '';
alter table public.health_people add column if not exists emergency_phone text not null default '';
alter table public.health_people add column if not exists checkup_plan boolean not null default false;
alter table public.health_people drop constraint if exists health_people_blood_type_check;
alter table public.health_people add constraint health_people_blood_type_check check (blood_type is null or blood_type in ('0+','0-','A+','A-','B+','B-','AB+','AB-'));
alter table public.health_people drop constraint if exists health_people_card_text_check;
alter table public.health_people add constraint health_people_card_text_check check (
 char_length(allergies) <= 500 and char_length(conditions) <= 500 and char_length(doctor_name) <= 120 and char_length(emergency_name) <= 120);
alter table public.health_people drop constraint if exists health_people_phones_check;
alter table public.health_people add constraint health_people_phones_check check (
 doctor_phone ~ '^[0-9 +()./-]{0,40}$' and emergency_phone ~ '^[0-9 +()./-]{0,40}$');
grant update (blood_type, allergies, conditions, doctor_name, doctor_phone, emergency_name, emergency_phone, checkup_plan) on public.health_people to authenticated;
-- Il lavoro giornaliero cerca chi ha il calendario dei vaccini o dei bilanci acceso.
drop index if exists public.idx_health_people_vaccine_plan;
create index if not exists idx_health_people_plans on public.health_people(id) where (vaccine_plan <> 'off' or checkup_plan) and birth_on is not null;

-- ===== Spese sanitarie =====
create table if not exists public.health_expenses (
 id uuid primary key default gen_random_uuid(),
 person_id uuid not null references public.health_people(id) on delete cascade,
 created_by uuid default auth.uid() references auth.users(id) on delete set null,
 spent_on date not null,
 kind text not null default 'pharmacy' check (kind in ('pharmacy','device','visit','exam','ssn','other')),
 description text not null check (char_length(btrim(description)) between 2 and 200),
 amount_cents integer not null check (amount_cents between 1 and 100000000),
 payment_method text check (payment_method in ('traceable','cash','other')),
 appointment_id uuid references public.health_appointments(id) on delete set null,
 notes text not null default '' check (char_length(notes) <= 1000),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists idx_health_expenses_person on public.health_expenses(person_id, spent_on desc);
create index if not exists idx_health_expenses_created_by on public.health_expenses(created_by);
create index if not exists idx_health_expenses_appointment on public.health_expenses(appointment_id) where appointment_id is not null;
comment on table public.health_expenses is 'Salute: spese sanitarie (farmaci, dispositivi, visite, esami, ticket) da portare nel 730.';

drop trigger if exists v62_expenses_touch on public.health_expenses;
create trigger v62_expenses_touch before update on public.health_expenses for each row execute function private.v60_touch();

-- Limite per persona e visita della stessa persona.
create or replace function private.v62_expense_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
 if tg_op = 'INSERT' then
  perform pg_advisory_xact_lock(hashtextextended('v62_expenses:' || new.person_id::text, 0));
  if (select count(*) from public.health_expenses e where e.person_id = new.person_id) >= 2000 then
   raise exception 'Questa persona ha già 2000 spese.' using errcode = 'P0001';
  end if;
 end if;
 if new.appointment_id is not null and not exists(
   select 1 from public.health_appointments a where a.id = new.appointment_id and a.person_id = new.person_id) then
  raise exception 'Visita di un''altra persona' using errcode = '23514';
 end if;
 return new;
end $$;
revoke all on function private.v62_expense_guard() from public, anon, authenticated;
drop trigger if exists v62_expenses_guard on public.health_expenses;
create trigger v62_expenses_guard before insert or update of person_id, appointment_id on public.health_expenses
 for each row execute function private.v62_expense_guard();

alter table public.health_expenses enable row level security;
drop policy if exists v62_read on public.health_expenses;
drop policy if exists v62_insert on public.health_expenses;
drop policy if exists v62_update on public.health_expenses;
drop policy if exists v62_delete on public.health_expenses;
create policy v62_read on public.health_expenses for select to authenticated using (private.v60_person_access(person_id, false));
create policy v62_insert on public.health_expenses for insert to authenticated with check (created_by = (select auth.uid()) and private.v60_person_access(person_id, true));
create policy v62_update on public.health_expenses for update to authenticated using (private.v60_person_access(person_id, true)) with check (private.v60_person_access(person_id, true));
create policy v62_delete on public.health_expenses for delete to authenticated using (private.v60_person_access(person_id, true));
revoke all on public.health_expenses from anon, authenticated;
grant select, insert, delete on public.health_expenses to authenticated;
grant update (spent_on, kind, description, amount_cents, payment_method, appointment_id, notes) on public.health_expenses to authenticated;

-- ===== Spese detraibili collegate =====
alter table public.home_tax_items add column if not exists cash_ok boolean not null default false;
grant update (cash_ok) on public.home_tax_items to authenticated;
alter table public.home_tax_items drop constraint if exists home_tax_items_source_check;
alter table public.home_tax_items add constraint home_tax_items_source_check
 check (source in ('manual','bill','home_expense','project_expense','pet_log','health_expense'));

-- Una voce «health_expense» cita una spesa della stessa casa o dello stesso spazio personale.
create or replace function private.v62_tax_source_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
 if new.source = 'health_expense' and not exists(
   select 1 from public.health_expenses e join public.health_people p on p.id = e.person_id
   where e.id = new.source_id and private.v59_same_space(p.user_id, p.home_id, new.user_id, new.home_id)) then
  raise exception 'La spesa sanitaria è di un altro spazio' using errcode = '23514';
 end if;
 return new;
end $$;
revoke all on function private.v62_tax_source_guard() from public, anon, authenticated;
drop trigger if exists v62_tax_items_source_guard on public.home_tax_items;
create trigger v62_tax_items_source_guard before insert or update of source, source_id, user_id, home_id on public.home_tax_items
 for each row execute function private.v62_tax_source_guard();

-- Spesa sanitaria cancellata (anche con la persona): via anche la voce detraibile che la citava.
create or replace function private.v62_expense_cleanup() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
 delete from public.home_tax_items where source = 'health_expense' and source_id = old.id;
 return old;
end $$;
revoke all on function private.v62_expense_cleanup() from public, anon, authenticated;
drop trigger if exists v62_expenses_cleanup on public.health_expenses;
create trigger v62_expenses_cleanup after delete on public.health_expenses for each row execute function private.v62_expense_cleanup();

commit;
