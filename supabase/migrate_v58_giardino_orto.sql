-- Casa in Ordine: giardino e orto, seconda parte (scelte dell'utente del 25 novembre 2026:
-- «Clima della tua zona», «Calendario dell'anno», «Prodotti e sicurezza», «Orto: semine e raccolti»).
-- Da eseguire una volta nel SQL Editor di Supabase, DOPO migrate_v57_giardino.sql. Rieseguibile.
--
-- Il clima della zona è quello del Programma stagionale (home_seasonal_settings.climate): niente di nuovo.
-- home_garden_plants:
--  - planted_on: data di semina o trapianto; harvest_days: giorni dalla semina alla raccolta
--    (raccolta prevista = planted_on + harvest_days);
--  - bed: aiuola dell'orto; family: famiglia botanica, per la rotazione da un anno all'altro;
--  - ended_on: coltura finita (la pianta resta per la storia delle aiuole, senza promemoria).
-- home_garden_tasks:
--  - stock_item_id e stock_use: prodotto delle Scorte usato e quanto se ne usa ogni volta
--    (con «Fatto» si scala); la scorta deve essere dello stesso spazio della pianta;
--  - wait_days: giorni di attesa dopo il trattamento prima di raccogliere (dall'etichetta).
-- home_garden_log.wait_days: i giorni di attesa di quella volta (la data sicura resta anche se il
-- piano cambia).
begin;

alter table public.home_garden_plants add column if not exists planted_on date;
alter table public.home_garden_plants add column if not exists harvest_days smallint;
alter table public.home_garden_plants add column if not exists bed text not null default '';
alter table public.home_garden_plants add column if not exists family text;
alter table public.home_garden_plants add column if not exists ended_on date;
alter table public.home_garden_plants drop constraint if exists home_garden_plants_v58_check;
alter table public.home_garden_plants add constraint home_garden_plants_v58_check check (
 (harvest_days is null or harvest_days between 1 and 400)
 and char_length(bed) <= 60
 and (family is null or family in ('solanaceae','cucurbitaceae','brassicaceae','fabaceae','asteraceae','apiaceae','amaryllidaceae','amaranthaceae','lamiaceae','rosaceae','other'))
 and (ended_on is null or planted_on is null or ended_on >= planted_on));
create index if not exists idx_home_garden_plants_bed on public.home_garden_plants(home_id, bed) where bed <> '';
grant update (planted_on, harvest_days, bed, family, ended_on) on public.home_garden_plants to authenticated;

alter table public.home_garden_tasks add column if not exists stock_item_id uuid references public.home_stock_items(id) on delete set null;
alter table public.home_garden_tasks add column if not exists stock_use numeric(12,2);
alter table public.home_garden_tasks add column if not exists wait_days smallint;
alter table public.home_garden_tasks drop constraint if exists home_garden_tasks_v58_check;
alter table public.home_garden_tasks add constraint home_garden_tasks_v58_check check (
 (stock_use is null or stock_use > 0 and stock_use <= 100000)
 and (wait_days is null or wait_days between 0 and 365));
create index if not exists idx_home_garden_tasks_stock on public.home_garden_tasks(stock_item_id) where stock_item_id is not null;
grant update (stock_item_id, stock_use, wait_days) on public.home_garden_tasks to authenticated;

alter table public.home_garden_log add column if not exists wait_days smallint;
alter table public.home_garden_log drop constraint if exists home_garden_log_v58_check;
alter table public.home_garden_log add constraint home_garden_log_v58_check check (wait_days is null or wait_days between 0 and 365);
grant update (wait_days) on public.home_garden_log to authenticated;

-- La scorta collegata a un intervento è dello stesso spazio della pianta (casa o spazio personale).
create or replace function private.v58_garden_stock_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
 if new.stock_item_id is not null and not exists(
   select 1 from public.home_garden_plants p join public.home_stock_items s on s.id = new.stock_item_id
   where p.id = new.plant_id
     and case when p.home_id is null then s.home_id is null and s.user_id = p.user_id else s.home_id = p.home_id end) then
  raise exception 'La scorta è di un altro spazio' using errcode = '23514';
 end if;
 return new;
end $$;
revoke all on function private.v58_garden_stock_guard() from public, anon, authenticated;
drop trigger if exists v58_garden_stock_guard on public.home_garden_tasks;
create trigger v58_garden_stock_guard before insert or update of stock_item_id, plant_id on public.home_garden_tasks
 for each row execute function private.v58_garden_stock_guard();

commit;
