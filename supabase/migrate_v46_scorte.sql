-- Casa in Ordine: scorte domestiche (Fase 2 della roadmap, 3.3).
-- Da eseguire una volta nel SQL Editor di Supabase, DOPO migrate_v45_stagionale.sql. Rieseguibile.
--
-- home_stock_items: cosa c'è in casa (detersivi, carta, caffè…), quanto ne resta, sotto quale
-- soglia ricomprarlo e quanto se ne compra di solito. Quando una scorta scende alla soglia l'app
-- propone di metterla nella lista della spesa; la aggiunge solo chi lo chiede.
-- v46_adjust_stock: «−1» e «+1» atomici, così due persone della casa che toccano la stessa
-- scorta insieme non si cancellano a vicenda; gira con i permessi di chi la chiama (regole di
-- accesso comprese). Accesso come le altre voci della casa: i membri leggono, proprietario ed
-- editor scrivono; nello spazio personale solo l'autore. Al massimo 300 scorte per spazio.
begin;

create table if not exists public.home_stock_items (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 home_id uuid references public.homes(id) on delete cascade,
 name text not null check (char_length(btrim(name)) between 2 and 120),
 unit text not null default 'pcs' check (unit in ('pcs','pack','roll','kg','g','l','ml')),
 quantity numeric(12,2) not null default 0 check (quantity between 0 and 100000),
 threshold numeric(12,2) not null default 0 check (threshold between 0 and 100000),
 usual_buy numeric(12,2) not null default 1 check (usual_buy > 0 and usual_buy <= 100000),
 location text not null default '' check (char_length(location) <= 60),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists idx_home_stock_items_home on public.home_stock_items(home_id) where home_id is not null;
create index if not exists idx_home_stock_items_user on public.home_stock_items(user_id) where home_id is null;
comment on table public.home_stock_items is
 'Scorte domestiche: quantità, soglia di riordino e quantità che si compra di solito (Fase 2).';

create or replace function public.v46_stock_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('v46_stock:' || coalesce(new.home_id, new.user_id)::text, 0));
 if (select count(*) from public.home_stock_items s
     where case when new.home_id is null then s.home_id is null and s.user_id = new.user_id else s.home_id = new.home_id end) >= 300 then
  raise exception 'Ci sono già 300 scorte in questo spazio.' using errcode = 'P0001';
 end if;
 return new;
end $$;
revoke all on function public.v46_stock_limit() from public, anon, authenticated;
drop trigger if exists v46_stock_limit on public.home_stock_items;
create trigger v46_stock_limit before insert on public.home_stock_items
 for each row execute function public.v46_stock_limit();

create or replace function public.v46_stock_touch() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;
revoke all on function public.v46_stock_touch() from public, anon, authenticated;
drop trigger if exists v46_stock_touch on public.home_stock_items;
create trigger v46_stock_touch before update on public.home_stock_items
 for each row execute function public.v46_stock_touch();

alter table public.home_stock_items enable row level security;
drop policy if exists v46_stock_read on public.home_stock_items;
drop policy if exists v46_stock_insert on public.home_stock_items;
drop policy if exists v46_stock_update on public.home_stock_items;
drop policy if exists v46_stock_delete on public.home_stock_items;
create policy v46_stock_read on public.home_stock_items for select to authenticated
 using (public.v19_can_read(user_id, home_id));
create policy v46_stock_insert on public.home_stock_items for insert to authenticated
 with check (user_id = (select auth.uid()) and public.v19_can_edit(user_id, home_id));
create policy v46_stock_update on public.home_stock_items for update to authenticated
 using (public.v19_can_edit(user_id, home_id)) with check (public.v19_can_edit(user_id, home_id));
create policy v46_stock_delete on public.home_stock_items for delete to authenticated
 using (public.v19_can_edit(user_id, home_id));
revoke all on public.home_stock_items from anon, authenticated;
grant select, insert, delete on public.home_stock_items to authenticated;
grant update (name, unit, quantity, threshold, usual_buy, location) on public.home_stock_items to authenticated;

-- «−» e «+» in un solo passaggio: la quantità resta tra 0 e 100.000.
create or replace function public.v46_adjust_stock(p_item uuid, p_delta numeric) returns numeric
language plpgsql security invoker set search_path = '' as $$
declare result numeric;
begin
 if p_delta is null or abs(p_delta) > 100000 then raise exception 'Variazione non valida' using errcode = '22023'; end if;
 update public.home_stock_items set quantity = least(100000, greatest(0, quantity + p_delta))
  where id = p_item returning quantity into result;
 if not found then raise exception 'Scorta non trovata' using errcode = 'P0002'; end if;
 return result;
end $$;
revoke all on function public.v46_adjust_stock(uuid, numeric) from public, anon;
grant execute on function public.v46_adjust_stock(uuid, numeric) to authenticated;

commit;
