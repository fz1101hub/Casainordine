-- Casa in Ordine: rate e scadenze (richiesta dell'utente del 26 novembre 2026, notte: «pagamenti
-- rateali come tasse universitarie, rata scuola privata, sport, altre attività, pagamenti
-- collaboratori domestici, scadenze INPS per collaboratori domestici o scadenze INPS e tasse per
-- liberi professionisti»). Da eseguire una volta nel SQL Editor di Supabase, DOPO
-- migrate_v63_documenti_home.sql. Rieseguibile.
--
-- - payment_plans: un impegno che si paga a rate (università, scuola, nido, sport, attività,
--   collaboratore domestico, libero professionista, altro), con chi riceve, per chi, la categoria
--   del 730 se è detraibile e quanti giorni prima avvisare;
-- - payment_installments: le rate o scadenze, con data, importo (anche da definire, come i
--   contributi), e quando e quanto si è pagato;
-- - avvisi «installment» dal lavoro giornaliero (push_installments per spegnerli);
-- - home_tax_items: fonte «installment» per le rate pagate che vanno nel 730.
-- Limiti: 200 impegni per spazio, 600 rate per impegno.
begin;

create table if not exists public.payment_plans (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 home_id uuid references public.homes(id) on delete cascade,
 title text not null check (char_length(btrim(title)) between 2 and 120),
 kind text not null default 'other' check (kind in ('university','school','nursery','sport','activity','domestic_worker','freelance','other')),
 payee text not null default '' check (char_length(payee) <= 120),
 person text not null default '' check (char_length(person) <= 80),
 tax_category text check (tax_category is null or tax_category in ('education','nursery','sport','domestic_worker')),
 remind_days smallint not null default 3 check (remind_days between 0 and 60),
 notes text not null default '' check (char_length(notes) <= 1000),
 ended_on date,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists idx_payment_plans_home on public.payment_plans(home_id) where home_id is not null;
create index if not exists idx_payment_plans_user on public.payment_plans(user_id) where home_id is null;
comment on table public.payment_plans is 'Rate e scadenze: impegni pagati a rate (scuola, sport, collaboratori domestici, INPS e tasse).';

create table if not exists public.payment_installments (
 id uuid primary key default gen_random_uuid(),
 plan_id uuid not null references public.payment_plans(id) on delete cascade,
 created_by uuid default auth.uid() references auth.users(id) on delete set null,
 label text not null check (char_length(btrim(label)) between 1 and 120),
 due_on date not null,
 amount_cents integer check (amount_cents is null or amount_cents between 1 and 100000000),
 paid_on date,
 paid_cents integer check (paid_cents is null or paid_cents between 0 and 100000000),
 notes text not null default '' check (char_length(notes) <= 500),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists idx_payment_installments_plan on public.payment_installments(plan_id, due_on);
create index if not exists idx_payment_installments_created_by on public.payment_installments(created_by);
-- Il lavoro giornaliero cerca le rate non pagate.
create index if not exists idx_payment_installments_open on public.payment_installments(due_on) where paid_on is null;
comment on table public.payment_installments is 'Rate e scadenze: singole rate con data, importo e pagamento.';

drop trigger if exists v64_plans_touch on public.payment_plans;
create trigger v64_plans_touch before update on public.payment_plans for each row execute function private.v60_touch();
drop trigger if exists v64_installments_touch on public.payment_installments;
create trigger v64_installments_touch before update on public.payment_installments for each row execute function private.v60_touch();

create or replace function private.v64_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare j jsonb := to_jsonb(new);
begin
 if tg_table_name = 'payment_plans' then
  perform pg_advisory_xact_lock(hashtextextended('v64_plans:' || coalesce(new.home_id, new.user_id)::text, 0));
  if (select count(*) from public.payment_plans p
      where case when new.home_id is null then p.home_id is null and p.user_id = new.user_id else p.home_id = new.home_id end) >= 200 then
   raise exception 'Ci sono già 200 impegni a rate in questo spazio.' using errcode = 'P0001';
  end if;
 else
  perform pg_advisory_xact_lock(hashtextextended('v64_installments:' || (j->>'plan_id'), 0));
  if (select count(*) from public.payment_installments i where i.plan_id = (j->>'plan_id')::uuid) >= 600 then
   raise exception 'Questo impegno ha già 600 rate.' using errcode = 'P0001';
  end if;
 end if;
 return new;
end $$;
revoke all on function private.v64_limit() from public, anon, authenticated;
drop trigger if exists v64_plans_limit on public.payment_plans;
create trigger v64_plans_limit before insert on public.payment_plans for each row execute function private.v64_limit();
drop trigger if exists v64_installments_limit on public.payment_installments;
create trigger v64_installments_limit before insert on public.payment_installments for each row execute function private.v64_limit();

-- Chi può vedere (write=false) o modificare (write=true) un impegno, e quindi le sue rate.
create or replace function private.v64_plan_access(target uuid, write boolean) returns boolean
language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.payment_plans p where p.id = target
  and case when write then private.v19_can_edit(p.user_id, p.home_id) else private.v19_can_read(p.user_id, p.home_id) end)
$$;
revoke all on function private.v64_plan_access(uuid, boolean) from public, anon;
grant execute on function private.v64_plan_access(uuid, boolean) to authenticated, service_role;

alter table public.payment_plans enable row level security;
drop policy if exists v64_read on public.payment_plans;
drop policy if exists v64_insert on public.payment_plans;
drop policy if exists v64_update on public.payment_plans;
drop policy if exists v64_delete on public.payment_plans;
create policy v64_read on public.payment_plans for select to authenticated using (private.v19_can_read(user_id, home_id));
create policy v64_insert on public.payment_plans for insert to authenticated with check (user_id = (select auth.uid()) and private.v19_can_edit(user_id, home_id));
create policy v64_update on public.payment_plans for update to authenticated using (private.v19_can_edit(user_id, home_id)) with check (private.v19_can_edit(user_id, home_id));
create policy v64_delete on public.payment_plans for delete to authenticated using (private.v19_can_edit(user_id, home_id));
revoke all on public.payment_plans from anon, authenticated;
grant select, insert, delete on public.payment_plans to authenticated;
grant update (title, kind, payee, person, tax_category, remind_days, notes, ended_on) on public.payment_plans to authenticated;

alter table public.payment_installments enable row level security;
drop policy if exists v64_read on public.payment_installments;
drop policy if exists v64_insert on public.payment_installments;
drop policy if exists v64_update on public.payment_installments;
drop policy if exists v64_delete on public.payment_installments;
create policy v64_read on public.payment_installments for select to authenticated using (private.v64_plan_access(plan_id, false));
create policy v64_insert on public.payment_installments for insert to authenticated with check (created_by = (select auth.uid()) and private.v64_plan_access(plan_id, true));
create policy v64_update on public.payment_installments for update to authenticated using (private.v64_plan_access(plan_id, true)) with check (private.v64_plan_access(plan_id, true));
create policy v64_delete on public.payment_installments for delete to authenticated using (private.v64_plan_access(plan_id, true));
revoke all on public.payment_installments from anon, authenticated;
grant select, insert, delete on public.payment_installments to authenticated;
grant update (label, due_on, amount_cents, paid_on, paid_cents, notes) on public.payment_installments to authenticated;

-- Avvisi e interruttore delle notifiche push.
alter table public.user_alerts drop constraint if exists user_alerts_kind_check;
alter table public.user_alerts add constraint user_alerts_kind_check
 check (kind in ('contract','maintenance','warranty','meter','missing_bill','mail_sync','move','savings','fraud','automation','garden','pet','weather','health','document','installment'));
alter table public.user_alert_preferences add column if not exists push_installments boolean not null default true;

-- Rate pagate nel 730: fonte «installment», della stessa casa o dello stesso spazio personale.
alter table public.home_tax_items drop constraint if exists home_tax_items_source_check;
alter table public.home_tax_items add constraint home_tax_items_source_check
 check (source in ('manual','bill','home_expense','project_expense','pet_log','health_expense','installment'));
create or replace function private.v64_tax_source_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
 if new.source = 'installment' and not exists(
   select 1 from public.payment_installments i join public.payment_plans p on p.id = i.plan_id
   where i.id = new.source_id and private.v59_same_space(p.user_id, p.home_id, new.user_id, new.home_id)) then
  raise exception 'La rata è di un altro spazio' using errcode = '23514';
 end if;
 return new;
end $$;
revoke all on function private.v64_tax_source_guard() from public, anon, authenticated;
drop trigger if exists v64_tax_items_source_guard on public.home_tax_items;
create trigger v64_tax_items_source_guard before insert or update of source, source_id, user_id, home_id on public.home_tax_items
 for each row execute function private.v64_tax_source_guard();

commit;
