-- Casa in Ordine: fondo sostituzioni (Fase 2 della roadmap, 3.3).
-- Da eseguire una volta nel SQL Editor di Supabase, DOPO migrate_v47_progetti.sql. Rieseguibile.
--
-- home_replacement_plans: per un oggetto delle Manutenzioni (maintenance_assets) il tipo, una vita
-- utile diversa da quella indicativa, il costo stimato di sostituzione, quanto è già da parte e
-- la data d'installazione se manca quella d'acquisto. Il calcolo (scadenza indicativa e quota
-- mensile) lo fa l'app (lib/replacement.mjs) e dice sempre che sono stime.
-- Accesso: quello dell'oggetto (chi lo vede vede il piano, chi lo modifica modifica il piano).
-- Eliminato l'oggetto, il piano se ne va con lui.
begin;

create table if not exists public.home_replacement_plans (
 asset_id uuid primary key references public.maintenance_assets(id) on delete cascade,
 created_by uuid default auth.uid() references auth.users(id) on delete set null,
 item_type text not null default 'other' check (item_type in ('boiler','heat_pump','water_heater','air_conditioner','washing_machine','dryer','dishwasher','fridge','oven','hob','tv','computer','mattress','smoke_alarm','paint','other')),
 life_years smallint check (life_years is null or life_years between 1 and 60),
 cost numeric(12,2) check (cost is null or cost between 0 and 100000000),
 saved numeric(12,2) not null default 0 check (saved between 0 and 100000000),
 installed_on date,
 updated_at timestamptz not null default now()
);
create index if not exists idx_home_replacement_plans_created_by on public.home_replacement_plans(created_by);
comment on table public.home_replacement_plans is
 'Fondo sostituzioni: vita utile, costo stimato e somma già da parte per un oggetto di casa (Fase 2).';

create or replace function public.v48_touch() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;
revoke all on function public.v48_touch() from public, anon, authenticated;
drop trigger if exists v48_replacement_touch on public.home_replacement_plans;
create trigger v48_replacement_touch before update on public.home_replacement_plans
 for each row execute function public.v48_touch();

-- Chi può vedere (write=false) o modificare (write=true) l'oggetto, e quindi il suo piano.
create or replace function public.v48_asset_access(target uuid, write boolean) returns boolean
language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.maintenance_assets a where a.id = target
  and case when write then public.v19_can_edit(a.user_id, a.home_id) else public.v19_can_read(a.user_id, a.home_id) end)
$$;
revoke all on function public.v48_asset_access(uuid, boolean) from public, anon;
grant execute on function public.v48_asset_access(uuid, boolean) to authenticated;

alter table public.home_replacement_plans enable row level security;
drop policy if exists v48_read on public.home_replacement_plans;
drop policy if exists v48_insert on public.home_replacement_plans;
drop policy if exists v48_update on public.home_replacement_plans;
drop policy if exists v48_delete on public.home_replacement_plans;
create policy v48_read on public.home_replacement_plans for select to authenticated using (public.v48_asset_access(asset_id, false));
create policy v48_insert on public.home_replacement_plans for insert to authenticated
 with check (created_by = (select auth.uid()) and public.v48_asset_access(asset_id, true));
create policy v48_update on public.home_replacement_plans for update to authenticated
 using (public.v48_asset_access(asset_id, true)) with check (public.v48_asset_access(asset_id, true));
create policy v48_delete on public.home_replacement_plans for delete to authenticated using (public.v48_asset_access(asset_id, true));
revoke all on public.home_replacement_plans from anon, authenticated;
grant select, insert, delete on public.home_replacement_plans to authenticated;
-- asset_id serve al salvataggio con upsert (PostgREST riscrive le colonne inviate); la regola
-- di accesso controlla comunque l'oggetto di destinazione.
grant update (asset_id, item_type, life_years, cost, saved, installed_on) on public.home_replacement_plans to authenticated;

commit;
