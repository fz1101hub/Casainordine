-- Casa in Ordine: programma stagionale (Fase 2 della roadmap, 3.3).
-- Da eseguire una volta nel SQL Editor di Supabase, DOPO migrate_v44_professionisti.sql. Rieseguibile.
--
-- Le voci del programma (controllo caldaia, grondaie, condizionatore…) sono nell'app
-- (lib/seasonal.mjs): il database tiene solo
-- - home_seasonal_settings: clima, tipo di casa e dotazioni dello spazio (una riga per casa o
--   per spazio personale), da cui dipendono le voci e i loro mesi;
-- - home_seasonal_done: le voci fatte, una per voce e per anno della stagione, con chi l'ha fatta.
-- Accesso come le altre voci della casa: i membri leggono, proprietario ed editor scrivono;
-- nello spazio personale solo l'autore. Finché la migrazione non è eseguita la sezione mostra il
-- programma con il profilo predefinito e dice che, per salvare, va attivata.
begin;

create table if not exists public.home_seasonal_settings (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 home_id uuid references public.homes(id) on delete cascade,
 climate text not null default 'mild' check (climate in ('cold','mild','warm')),
 home_type text not null default 'apartment' check (home_type in ('apartment','house')),
 features text[] not null default array['boiler']::text[]
  check (features <@ array['boiler','air_conditioning','fireplace','garden']::text[] and cardinality(features) <= 4),
 updated_at timestamptz not null default now()
);
create unique index if not exists uq_home_seasonal_settings_home on public.home_seasonal_settings(home_id) where home_id is not null;
create unique index if not exists uq_home_seasonal_settings_personal on public.home_seasonal_settings(user_id) where home_id is null;
comment on table public.home_seasonal_settings is
 'Programma stagionale: clima, tipo di casa e dotazioni dello spazio (Fase 2).';

create table if not exists public.home_seasonal_done (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 home_id uuid references public.homes(id) on delete cascade,
 item_id text not null check (item_id ~ '^[a-z][a-z_]{1,39}$'),
 period text not null check (period ~ '^[0-9]{4}$'),
 done_on date not null default current_date,
 created_at timestamptz not null default now()
);
create unique index if not exists uq_home_seasonal_done_home on public.home_seasonal_done(home_id, item_id, period) where home_id is not null;
create unique index if not exists uq_home_seasonal_done_personal on public.home_seasonal_done(user_id, item_id, period) where home_id is null;
create index if not exists idx_home_seasonal_done_user on public.home_seasonal_done(user_id);
comment on table public.home_seasonal_done is
 'Programma stagionale: voci fatte, una per voce e anno della stagione (Fase 2).';

create or replace function public.v45_touch() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;
revoke all on function public.v45_touch() from public, anon, authenticated;
drop trigger if exists v45_seasonal_settings_touch on public.home_seasonal_settings;
create trigger v45_seasonal_settings_touch before update on public.home_seasonal_settings
 for each row execute function public.v45_touch();

alter table public.home_seasonal_settings enable row level security;
alter table public.home_seasonal_done enable row level security;
drop policy if exists v45_settings_read on public.home_seasonal_settings;
drop policy if exists v45_settings_insert on public.home_seasonal_settings;
drop policy if exists v45_settings_update on public.home_seasonal_settings;
drop policy if exists v45_settings_delete on public.home_seasonal_settings;
create policy v45_settings_read on public.home_seasonal_settings for select to authenticated
 using (public.v19_can_read(user_id, home_id));
create policy v45_settings_insert on public.home_seasonal_settings for insert to authenticated
 with check (user_id = (select auth.uid()) and public.v19_can_edit(user_id, home_id));
create policy v45_settings_update on public.home_seasonal_settings for update to authenticated
 using (public.v19_can_edit(user_id, home_id)) with check (public.v19_can_edit(user_id, home_id));
create policy v45_settings_delete on public.home_seasonal_settings for delete to authenticated
 using (public.v19_can_edit(user_id, home_id));
drop policy if exists v45_done_read on public.home_seasonal_done;
drop policy if exists v45_done_insert on public.home_seasonal_done;
drop policy if exists v45_done_delete on public.home_seasonal_done;
create policy v45_done_read on public.home_seasonal_done for select to authenticated
 using (public.v19_can_read(user_id, home_id));
create policy v45_done_insert on public.home_seasonal_done for insert to authenticated
 with check (user_id = (select auth.uid()) and public.v19_can_edit(user_id, home_id));
create policy v45_done_delete on public.home_seasonal_done for delete to authenticated
 using (public.v19_can_edit(user_id, home_id));

-- Profilo: si cambiano solo clima, tipo e dotazioni. Voci fatte: si segnano o si tolgono, non si modificano.
revoke all on public.home_seasonal_settings from anon, authenticated;
grant select, insert, delete on public.home_seasonal_settings to authenticated;
grant update (climate, home_type, features) on public.home_seasonal_settings to authenticated;
revoke all on public.home_seasonal_done from anon, authenticated;
grant select, insert, delete on public.home_seasonal_done to authenticated;

commit;
