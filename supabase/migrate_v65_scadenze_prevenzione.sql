-- Casa in Ordine: certificati, iscrizioni scolastiche, screening di prevenzione e riquadro delle
-- rate nella Home (scelte dell'utente del 26 novembre 2026, notte). Da eseguire una volta nel SQL
-- Editor di Supabase, DOPO migrate_v64_rate_scadenze.sql. Rieseguibile.
--
-- - family_documents: nuovo tipo «sport_certificate» (certificato medico sportivo, di solito valido
--   12 mesi);
-- - health_people: sesso (facoltativo, serve solo per proporre gli screening giusti) e screening_plan
--   per seguire gli screening oncologici dell'ASL e i controlli consigliati (lib/health.mjs,
--   SCREENINGS) con gli stessi avvisi dei vaccini;
-- - user_home_preferences: il riquadro «installments» (rate in scadenza), fino a 10 riquadri.
begin;

alter table public.family_documents drop constraint if exists family_documents_kind_check;
alter table public.family_documents add constraint family_documents_kind_check
 check (kind in ('identity_card','passport','driving_license','health_card','residence_permit','sport_certificate','other'));

alter table public.health_people add column if not exists sex text;
alter table public.health_people drop constraint if exists health_people_sex_check;
alter table public.health_people add constraint health_people_sex_check check (sex is null or sex in ('female','male'));
alter table public.health_people add column if not exists screening_plan boolean not null default false;
grant update (sex, screening_plan) on public.health_people to authenticated;
drop index if exists public.idx_health_people_plans;
create index if not exists idx_health_people_plans on public.health_people(id) where (vaccine_plan <> 'off' or checkup_plan or screening_plan) and birth_on is not null;

alter table public.user_home_preferences drop constraint if exists user_home_preferences_widgets_check;
alter table public.user_home_preferences add constraint user_home_preferences_widgets_check check (
 cardinality(widget_order) between 1 and 10
 and widget_order <@ array['bills','shopping','tasks','five_minutes','medicines','health','pets','garden','documents','installments']::text[]
 and array_position(widget_order, null) is null
 and cardinality(array_positions(widget_order,'bills')) <= 1 and cardinality(array_positions(widget_order,'shopping')) <= 1
 and cardinality(array_positions(widget_order,'tasks')) <= 1 and cardinality(array_positions(widget_order,'five_minutes')) <= 1
 and cardinality(array_positions(widget_order,'medicines')) <= 1 and cardinality(array_positions(widget_order,'health')) <= 1
 and cardinality(array_positions(widget_order,'pets')) <= 1 and cardinality(array_positions(widget_order,'garden')) <= 1
 and cardinality(array_positions(widget_order,'documents')) <= 1 and cardinality(array_positions(widget_order,'installments')) <= 1);

commit;
