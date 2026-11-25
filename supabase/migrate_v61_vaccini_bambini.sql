-- Casa in Ordine: calendario delle vaccinazioni dei bambini (richiesta dell'utente del 25 novembre
-- 2026, sera: «una sezione che ricordi ai neo genitori le tappe delle vaccinazioni obbligatorie»).
-- Da eseguire una volta nel SQL Editor di Supabase, DOPO migrate_v60_salute.sql. Rieseguibile.
--
-- - health_people.vaccine_plan: 'off' (di partenza), 'mandatory' (solo le obbligatorie) o 'all'
--   (anche le raccomandate più comuni): con la data di nascita l'app calcola le tappe del calendario
--   nazionale (lib/health.mjs, VACCINE_SCHEDULE) e il lavoro giornaliero avvisa due settimane prima;
-- - health_appointments.schedule_key: la tappa del calendario a cui corrisponde un appuntamento
--   (prenotato o già fatto), una volta per persona.
begin;

alter table public.health_people add column if not exists vaccine_plan text not null default 'off';
alter table public.health_people drop constraint if exists health_people_vaccine_plan_check;
alter table public.health_people add constraint health_people_vaccine_plan_check check (vaccine_plan in ('off','mandatory','all'));
grant update (vaccine_plan) on public.health_people to authenticated;
create index if not exists idx_health_people_vaccine_plan on public.health_people(id) where vaccine_plan <> 'off' and birth_on is not null;

alter table public.health_appointments add column if not exists schedule_key text;
alter table public.health_appointments drop constraint if exists health_appointments_schedule_key_check;
alter table public.health_appointments add constraint health_appointments_schedule_key_check check (schedule_key is null or schedule_key ~ '^[a-z0-9_]{2,40}$');
create unique index if not exists uq_health_appointments_schedule on public.health_appointments(person_id, schedule_key) where schedule_key is not null;
grant update (schedule_key) on public.health_appointments to authenticated;

commit;
