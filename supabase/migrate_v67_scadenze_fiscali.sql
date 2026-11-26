-- Casa in Ordine: scadenze fiscali di famiglia (scelta dell'utente del 26 novembre 2026, mattina).
-- Da eseguire una volta nel SQL Editor di Supabase, DOPO migrate_v66_uscite_home.sql. Rieseguibile.
--
-- - tax_calendar_settings: per ogni spazio (personale o casa) quali scadenze seguire (730, modello
--   Redditi, IMU, ISEE per l'Assegno unico), quanti giorni prima avvisare e cosa è già fatto
--   (scadenze dell'anno e documenti pronti per il 730: chiavi come «730_2027», «doc_cu_2026»).
--   Le date sono calcolate dall'app (lib/tax-calendar.mjs).
-- - avvisi «tax» dal lavoro giornaliero (push_taxes per spegnerli).
begin;

create table if not exists public.tax_calendar_settings (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 home_id uuid references public.homes(id) on delete cascade,
 groups text[] not null default '{}' check (groups <@ array['730','redditi','imu','isee']::text[] and cardinality(groups) <= 4 and array_position(groups, null) is null),
 remind_days smallint not null default 14 check (remind_days between 1 and 60),
 done text[] not null default '{}' check (cardinality(done) <= 400 and array_to_string(done, ',') ~ '^([a-z0-9_]{1,40}_[0-9]{4}(,|$))*$'),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create unique index if not exists idx_tax_calendar_personal on public.tax_calendar_settings(user_id) where home_id is null;
create unique index if not exists idx_tax_calendar_home on public.tax_calendar_settings(home_id) where home_id is not null;
comment on table public.tax_calendar_settings is 'Scadenze fiscali di famiglia: quali seguire, preavviso e cosa è già fatto, per spazio.';

drop trigger if exists v67_tax_calendar_touch on public.tax_calendar_settings;
create trigger v67_tax_calendar_touch before update on public.tax_calendar_settings for each row execute function private.v60_touch();

alter table public.tax_calendar_settings enable row level security;
drop policy if exists v67_read on public.tax_calendar_settings;
drop policy if exists v67_insert on public.tax_calendar_settings;
drop policy if exists v67_update on public.tax_calendar_settings;
drop policy if exists v67_delete on public.tax_calendar_settings;
create policy v67_read on public.tax_calendar_settings for select to authenticated using (private.v19_can_read(user_id, home_id));
create policy v67_insert on public.tax_calendar_settings for insert to authenticated with check (user_id = (select auth.uid()) and private.v19_can_edit(user_id, home_id));
create policy v67_update on public.tax_calendar_settings for update to authenticated using (private.v19_can_edit(user_id, home_id)) with check (private.v19_can_edit(user_id, home_id));
create policy v67_delete on public.tax_calendar_settings for delete to authenticated using (private.v19_can_edit(user_id, home_id));
revoke all on public.tax_calendar_settings from anon, authenticated;
grant select, insert, delete on public.tax_calendar_settings to authenticated;
grant update (groups, remind_days, done) on public.tax_calendar_settings to authenticated;

-- Avvisi e interruttore delle notifiche push.
alter table public.user_alerts drop constraint if exists user_alerts_kind_check;
alter table public.user_alerts add constraint user_alerts_kind_check
 check (kind in ('contract','maintenance','warranty','meter','missing_bill','mail_sync','move','savings','fraud','automation','garden','pet','weather','health','document','installment','tax'));
alter table public.user_alert_preferences add column if not exists push_taxes boolean not null default true;

commit;
