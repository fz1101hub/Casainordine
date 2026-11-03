-- Casa in Ordine 2.1. Apply after migrate_v20.sql on a STAGING copy first.
-- Personal records remain personal; shared records require explicit home membership.
create extension if not exists pgcrypto;

alter table public.maintenance_assets add column if not exists model text not null default '';
alter table public.maintenance_assets add column if not exists serial_number text not null default '';
alter table public.maintenance_assets add column if not exists room text not null default '';
alter table public.maintenance_assets add constraint v21_asset_model_len check(char_length(model)<=140);
alter table public.maintenance_assets add constraint v21_asset_serial_len check(char_length(serial_number)<=140);
alter table public.maintenance_assets add constraint v21_asset_room_len check(char_length(room)<=120);

create table public.home_emergency_cards (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 home_id uuid references public.homes(id) on delete cascade,
 title text not null check(char_length(btrim(title)) between 2 and 120),
 location_hint text not null default '' check(char_length(location_hint)<=500),
 instructions text not null default '' check(char_length(instructions)<=2500),
 contact_label text not null default '' check(char_length(contact_label)<=100),
 contact_phone text not null default '' check(char_length(contact_phone)<=80),
 created_at timestamptz not null default now()
);
create table public.home_inventory_items (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 home_id uuid references public.homes(id) on delete cascade,
 property_id uuid references public.home_properties(id) on delete set null,
 asset_id uuid references public.maintenance_assets(id) on delete set null,
 document_id uuid references public.home_documents(id) on delete set null,
 name text not null check(char_length(btrim(name)) between 2 and 140),
 room text not null default '' check(char_length(room)<=120),
 serial_number text not null default '' check(char_length(serial_number)<=150),
 purchased_on date,
 estimated_value numeric(12,2) not null default 0 check(estimated_value between 0 and 100000000),
 notes text not null default '' check(char_length(notes)<=1000),
 created_at timestamptz not null default now()
);
create table public.home_vacation_plans (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 home_id uuid references public.homes(id) on delete cascade,
 title text not null check(char_length(btrim(title)) between 2 and 140),
 starts_on date not null,
 ends_on date not null,
 notes text not null default '' check(char_length(notes)<=2000),
 checklist jsonb not null default '[]'::jsonb check(jsonb_typeof(checklist)='array' and pg_column_size(checklist)<=6000),
 created_at timestamptz not null default now(),
 constraint vacation_dates check(starts_on<=ends_on and ends_on<=starts_on+365)
);
-- Guest shares expose ONLY separately entered, explicitly shared instructions, never full vacation plans.
create table public.home_vacation_shares (
 id uuid primary key default gen_random_uuid(),
 plan_id uuid not null references public.home_vacation_plans(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 home_id uuid references public.homes(id) on delete cascade,
 token_hash text not null unique check(token_hash ~ '^[0-9a-f]{64}$'),
 shared_text text not null check(char_length(btrim(shared_text)) between 5 and 1000),
 expires_at timestamptz not null,
 revoked_at timestamptz,
 created_at timestamptz not null default now()
);
create table public.home_decisions (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 home_id uuid not null references public.homes(id) on delete cascade,
 title text not null check(char_length(btrim(title)) between 2 and 180),
 description text not null default '' check(char_length(description)<=1800),
 proposed_budget numeric(12,2) not null default 0 check(proposed_budget between 0 and 100000000),
 closes_on date,
 status text not null default 'open' check(status in ('open','closed')),
 created_at timestamptz not null default now()
);
create table public.home_decision_votes (
 decision_id uuid not null references public.home_decisions(id) on delete cascade,
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 choice text not null check(choice in('yes','no','abstain')),
 created_at timestamptz not null default now(),
 primary key(decision_id,user_id)
);
create table public.home_refund_expectations (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 home_id uuid references public.homes(id) on delete cascade,
 bill_id uuid references public.bills(id) on delete set null,
 label text not null check(char_length(btrim(label)) between 2 and 140),
 expected_amount numeric(12,2) not null check(expected_amount between 0 and 100000000),
 expected_on date not null,
 status text not null default 'expected' check(status in('expected','received','cancelled')),
 created_at timestamptz not null default now()
);

-- Immutable tenant scope + same-tenant foreign key references, including the owner's private space.
create or replace function public.v21_scope_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare owner uuid; house uuid; pairs jsonb; ref jsonb; entity text; target uuid;
begin
 if tg_op='UPDATE' and (new.user_id is distinct from old.user_id or new.home_id is distinct from old.home_id) then raise exception 'Non è consentito trasferire voci tra spazi';end if;
 if tg_table_name='home_inventory_items' then
  pairs=jsonb_build_array(jsonb_build_object('table','home_properties','id',new.property_id),jsonb_build_object('table','maintenance_assets','id',new.asset_id),jsonb_build_object('table','home_documents','id',new.document_id));
 elsif tg_table_name='home_refund_expectations' then
  pairs=jsonb_build_array(jsonb_build_object('table','bills','id',new.bill_id));
 elsif tg_table_name='home_vacation_shares' then
  pairs=jsonb_build_array(jsonb_build_object('table','home_vacation_plans','id',new.plan_id));
 else pairs='[]'::jsonb;end if;
 for ref in select value from jsonb_array_elements(pairs) loop
  if ref->>'id' is null then continue;end if;
  entity=ref->>'table';target=(ref->>'id')::uuid;
  if entity='home_properties' then select user_id,home_id into owner,house from public.home_properties where id=target;
  elsif entity='maintenance_assets' then select user_id,home_id into owner,house from public.maintenance_assets where id=target;
  elsif entity='home_documents' then select user_id,home_id into owner,house from public.home_documents where id=target;
  elsif entity='bills' then select user_id,home_id into owner,house from public.bills where id=target;
  elsif entity='home_vacation_plans' then select user_id,home_id into owner,house from public.home_vacation_plans where id=target;
  else raise exception 'Riferimento sconosciuto';end if;
  if not found or house is distinct from new.home_id or (house is null and owner is distinct from new.user_id) then raise exception 'Riferimento non appartiene allo stesso spazio';end if;
 end loop;
 return new;
end $$;
create trigger v21_inventory_scope before insert or update on public.home_inventory_items for each row execute function public.v21_scope_guard();
create trigger v21_refund_scope before insert or update on public.home_refund_expectations for each row execute function public.v21_scope_guard();
create trigger v21_share_scope before insert or update on public.home_vacation_shares for each row execute function public.v21_scope_guard();
-- Immovable scope also for tables with no references.
create trigger v21_sos_scope before update on public.home_emergency_cards for each row execute function public.v21_scope_guard();
create trigger v21_vacation_scope before update on public.home_vacation_plans for each row execute function public.v21_scope_guard();
create trigger v21_decision_scope before update on public.home_decisions for each row execute function public.v21_scope_guard();

-- RLS: use existing v19 helper; users may only create rows with their authenticated user id.
do $$ declare t text;begin
 foreach t in array array['home_emergency_cards','home_inventory_items','home_vacation_plans','home_decisions','home_refund_expectations'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('create policy %I on public.%I for select to authenticated using(public.v19_can_read(user_id,home_id))','v21_read_'||t,t);
  execute format('create policy %I on public.%I for insert to authenticated with check(user_id=(select auth.uid()) and public.v19_can_edit(user_id,home_id))','v21_write_'||t,t);
  execute format('create policy %I on public.%I for update to authenticated using(public.v19_can_edit(user_id,home_id)) with check(public.v19_can_edit(user_id,home_id))','v21_edit_'||t,t);
  execute format('create policy %I on public.%I for delete to authenticated using(public.v19_can_edit(user_id,home_id))','v21_delete_'||t,t);
  execute format('revoke all on public.%I from anon,authenticated',t);
  execute format('grant select,insert,update,delete on public.%I to authenticated',t);
 end loop;
end $$;
-- Fix decisions to shared homes only (home_id NOT NULL already enforced), and prevent viewer edits.

-- Votes: members, including viewers, vote once per decision; no votes after closing.
create or replace function public.v21_decision_open(target uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.home_decisions d where d.id=target and d.status='open' and (d.closes_on is null or d.closes_on>=current_date) and public.is_home_member(d.home_id));
$$;
revoke all on function public.v21_decision_open(uuid) from public,anon;
grant execute on function public.v21_decision_open(uuid) to authenticated;
alter table public.home_decision_votes enable row level security;
create policy v21_votes_read on public.home_decision_votes for select to authenticated
 using(exists(select 1 from public.home_decisions d where d.id=decision_id and public.is_home_member(d.home_id)));
create policy v21_votes_add on public.home_decision_votes for insert to authenticated
 with check(user_id=(select auth.uid()) and public.v21_decision_open(decision_id));
create policy v21_votes_change on public.home_decision_votes for update to authenticated
 using(user_id=(select auth.uid()) and public.v21_decision_open(decision_id))
 with check(user_id=(select auth.uid()) and public.v21_decision_open(decision_id));
revoke all on public.home_decision_votes from anon,authenticated;
grant select,insert,update(choice) on public.home_decision_votes to authenticated;

-- Guest links: only the owner/editor of the plan can create/revoke; token is never stored in plain text.
alter table public.home_vacation_shares enable row level security;
create policy v21_share_metadata on public.home_vacation_shares for select to authenticated using(public.v19_can_edit(user_id,home_id));
revoke all on public.home_vacation_shares from anon,authenticated;
grant select(id,plan_id,expires_at,revoked_at,created_at),update(revoked_at) on public.home_vacation_shares to authenticated;
create or replace function public.v21_create_vacation_share(plan uuid, text_to_share text, hours_valid int default 72)
 returns text language plpgsql security definer set search_path='' as $$
declare p public.home_vacation_plans%rowtype; token text;
begin
 select * into p from public.home_vacation_plans where id=plan;
 if not found or not public.v19_can_edit(p.user_id,p.home_id) then raise exception 'Accesso negato';end if;
 if length(btrim(coalesce(text_to_share,''))) not between 5 and 1000 or hours_valid not between 1 and 168 then raise exception 'Testo o durata non valida';end if;
 token=encode(gen_random_bytes(32),'hex');
 insert into public.home_vacation_shares(plan_id,user_id,home_id,token_hash,shared_text,expires_at)
 values(plan,p.user_id,p.home_id,encode(digest(token,'sha256'),'hex'),btrim(text_to_share),now()+make_interval(hours=>hours_valid));
 return token;
end $$;
create or replace function public.v21_revoke_vacation_share(target uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 update public.home_vacation_shares set revoked_at=now() where id=target and revoked_at is null and public.v19_can_edit(user_id,home_id);
 if not found then raise exception 'Condivisione non trovata o accesso negato';end if;
end $$;
revoke all on function public.v21_create_vacation_share(uuid,text,int),public.v21_revoke_vacation_share(uuid) from public,anon;
grant execute on function public.v21_create_vacation_share(uuid,text,int),public.v21_revoke_vacation_share(uuid) to authenticated;
create index if not exists idx_v21_vacation_tokens on public.home_vacation_shares(token_hash) where revoked_at is null;
create index if not exists idx_v21_inventory on public.home_inventory_items(home_id,property_id);
create index if not exists idx_v21_votes on public.home_decision_votes(decision_id);

-- Audit entries reuse the v20 audit trigger. Sensitive emergency text is NOT inserted in the audit summary.
do $$ declare t text;begin
 foreach t in array array['home_emergency_cards','home_inventory_items','home_vacation_plans','home_decisions','home_refund_expectations'] loop
  execute format('drop trigger if exists v21_audit on public.%I',t);
  execute format('create trigger v21_audit after insert or update or delete on public.%I for each row execute function public.v20_audit_changes()',t);
 end loop;
end $$;
