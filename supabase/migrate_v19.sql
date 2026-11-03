-- Casa in Ordine 1.9. Execute only after v1.8 migration, with a database backup.
-- A real staging test of RLS and storage policies is required before production.
create extension if not exists pgcrypto;

create or replace function public.v19_can_read(owner_user uuid,house uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select case when house is null then owner_user=(select auth.uid()) else public.is_home_member(house) end;
$$;
create or replace function public.v19_can_edit(owner_user uuid,house uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select case when house is null then owner_user=(select auth.uid()) else public.can_edit_home(house) end;
$$;
revoke all on function public.v19_can_read(uuid,uuid),public.v19_can_edit(uuid,uuid) from public,anon;
grant execute on function public.v19_can_read(uuid,uuid),public.v19_can_edit(uuid,uuid) to authenticated;

create table if not exists public.home_properties (
 id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 home_id uuid references public.homes(id) on delete cascade,
 label text not null check(char_length(btrim(label)) between 2 and 120),
 kind text not null default 'principale' check(kind in('principale','seconda casa','affitto','altro')),
 address text not null default '' check(char_length(address)<=350),
 created_at timestamptz not null default now()
);
create table if not exists public.home_documents (
 id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 home_id uuid references public.homes(id) on delete cascade,
 property_id uuid references public.home_properties(id) on delete set null,
 bill_id uuid references public.bills(id) on delete set null,
 name text not null check(char_length(name) between 1 and 200),
 doc_type text not null default 'altro' check(doc_type in('bolletta','contratto','ricevuta','garanzia','manuale','condominio','altro')),
 mime_type text not null check(mime_type in('application/pdf','image/jpeg','image/png','image/webp','text/plain')),
 storage_path text not null unique,
 sha256 text check(sha256 is null or sha256 ~ '^[a-f0-9]{64}$'),
 file_size integer not null check(file_size between 1 and 10485760),
 notes text not null default '' check(char_length(notes)<=1000),
 created_at timestamptz not null default now(),
 constraint storage_owner_path check(split_part(storage_path,'/',1)=user_id::text)
);
create index if not exists idx_home_docs_scope on public.home_documents(home_id,property_id,doc_type);
create table if not exists public.meter_readings (
 id uuid primary key default gen_random_uuid(),user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 home_id uuid references public.homes(id) on delete cascade,
 property_id uuid references public.home_properties(id) on delete set null,
 meter_name text not null check(char_length(btrim(meter_name)) between 2 and 120),
 utility_type text not null check(utility_type in('Luce','Gas','Acqua')),
 read_value numeric(14,3) not null check(read_value between 0 and 999999999),
 unit text not null check(unit in('kWh','Smc','m³')),
 read_on date not null,
 source text not null default 'manual' check(source in('manual','ocr')),
 created_at timestamptz not null default now(),
 unique(user_id,meter_name,read_on,home_id)
);
create index if not exists idx_meter_scope on public.meter_readings(home_id,meter_name,read_on);
create table if not exists public.maintenance_assets (
 id uuid primary key default gen_random_uuid(),user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 home_id uuid references public.homes(id) on delete cascade,
 property_id uuid references public.home_properties(id) on delete set null,
 name text not null check(char_length(btrim(name)) between 2 and 140),
 category text not null default 'Impianto',
 purchased_on date,warranty_until date,next_service_on date,
 service_repeat_months smallint not null default 0 check(service_repeat_months between 0 and 120),
 notes text not null default '' check(char_length(notes)<=1500),
 created_at timestamptz not null default now()
);
create table if not exists public.maintenance_events (
 id uuid primary key default gen_random_uuid(),user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 home_id uuid references public.homes(id) on delete cascade,
 asset_id uuid not null references public.maintenance_assets(id) on delete cascade,
 done_on date not null,cost numeric(12,2) not null default 0 check(cost between 0 and 100000000),
 description text not null check(char_length(btrim(description)) between 2 and 350),
 document_id uuid references public.home_documents(id) on delete set null,
 created_at timestamptz not null default now()
);
create table if not exists public.payment_receipts (
 id uuid primary key default gen_random_uuid(),user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 home_id uuid references public.homes(id) on delete cascade,
 bill_id uuid not null references public.bills(id) on delete cascade,
 document_id uuid references public.home_documents(id) on delete set null,
 paid_on date not null,amount numeric(12,2) not null check(amount between 0 and 100000000),
 method text not null default 'Altro' check(method in('Bonifico','Carta','Contanti','pagoPA','Addebito','Altro')),
 reference text not null default '' check(char_length(reference)<=180),
 status text not null default 'pending' check(status in('pending','confirmed')),
 confirmed_by uuid references auth.users(id), confirmed_at timestamptz,
 created_at timestamptz not null default now()
);
create index if not exists idx_receipt_bill on public.payment_receipts(bill_id,status);
create table if not exists public.home_contracts (
 id uuid primary key default gen_random_uuid(),user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 home_id uuid references public.homes(id) on delete cascade,
 property_id uuid references public.home_properties(id) on delete set null,
 document_id uuid references public.home_documents(id) on delete set null,
 supplier text not null check(char_length(btrim(supplier)) between 2 and 150),
 service text not null check(char_length(btrim(service)) between 2 and 140),
 offer_price numeric(12,2) check(offer_price is null or offer_price >= 0),
 renewal_on date not null,
 alert_days integer not null default 30 check(alert_days between 1 and 365),
 notes text not null default '' check(char_length(notes)<=1500),
 created_at timestamptz not null default now()
);
create table if not exists public.meter_reminders (
 id uuid primary key default gen_random_uuid(),user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 home_id uuid references public.homes(id) on delete cascade,
 property_id uuid references public.home_properties(id) on delete set null,
 meter_name text not null check(char_length(btrim(meter_name)) between 2 and 120),
 next_due_on date not null,repeat_months smallint not null default 1 check(repeat_months between 0 and 24),
 created_at timestamptz not null default now()
);
create table if not exists public.user_alert_preferences (
 user_id uuid primary key references auth.users(id) on delete cascade,
 push_bills boolean not null default true,
 push_contracts boolean not null default true,
 push_maintenance boolean not null default true,
 push_digest boolean not null default true,
 quiet_from time, quiet_until time,
 updated_at timestamptz not null default now(),
 constraint quiet_both check((quiet_from is null)=(quiet_until is null))
);
create table if not exists public.user_alerts (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
 kind text not null check(kind in('contract','maintenance','warranty','meter')),
 reference_id uuid not null,
 event_date date not null,
 title text not null,body text not null,
 read_at timestamptz,created_at timestamptz not null default now(),
 unique(user_id,kind,reference_id,event_date)
);
create index if not exists idx_alerts_user on public.user_alerts(user_id,read_at,created_at desc);

alter table public.bills add column if not exists property_id uuid references public.home_properties(id) on delete set null;
alter table public.utilities add column if not exists property_id uuid references public.home_properties(id) on delete set null;
alter table public.bills add column if not exists consumption_value numeric(14,3) check(consumption_value is null or consumption_value>=0);
alter table public.bills add column if not exists consumption_unit text check(consumption_unit is null or consumption_unit in('kWh','Smc','m³'));
alter table public.bills add column if not exists period_start date;
alter table public.bills add column if not exists period_end date;
alter table public.bills add constraint bills_consumption_pair_v19 check((consumption_value is null)=(consumption_unit is null));
alter table public.bills add constraint bills_period_order_v19 check(period_start is null or period_end is null or period_start<=period_end);

-- Prevent linking private records to an unrelated tenant, even if the UUID is known.
-- The trigger must allow only internal RPC confirmation, not direct client changes.
create or replace function public.v19_reference_guard() returns trigger
language plpgsql security definer set search_path='' as $$
declare ref_user uuid; ref_home uuid;internal boolean;
begin
 internal=current_setting('app.confirming_receipt',true)='yes';
 if tg_op='UPDATE' and (new.home_id is distinct from old.home_id or new.user_id is distinct from old.user_id) then raise exception 'Impossibile spostare record tra spazi'; end if;
 if tg_op='INSERT' and new.user_id is distinct from (select auth.uid()) and current_setting('request.jwt.claim.role',true) is distinct from 'service_role' then raise exception 'Autore non autorizzato'; end if;
 if tg_table_name in ('home_documents','meter_readings','maintenance_assets','home_contracts','bills','utilities','meter_reminders') and new.property_id is not null then
  select user_id,home_id into ref_user,ref_home from public.home_properties where id=new.property_id;
  if not found or ref_home is distinct from new.home_id or (ref_home is null and ref_user is distinct from new.user_id) then raise exception 'Immobile non appartenente allo spazio'; end if;
 end if;
 if tg_table_name='home_documents' and new.bill_id is not null then
  select user_id,home_id into ref_user,ref_home from public.bills where id=new.bill_id;
  if not found or ref_home is distinct from new.home_id or (ref_home is null and ref_user is distinct from new.user_id) then raise exception 'Bolletta non appartenente allo spazio'; end if;
 end if;
 if tg_table_name in ('payment_receipts','maintenance_events','home_contracts') and new.document_id is not null then
  select user_id,home_id into ref_user,ref_home from public.home_documents where id=new.document_id;
  if not found or ref_home is distinct from new.home_id or (ref_home is null and ref_user is distinct from new.user_id) then raise exception 'Documento non appartenente allo spazio'; end if;
 end if;
 if tg_table_name='payment_receipts' then
  select user_id,home_id into ref_user,ref_home from public.bills where id=new.bill_id;
  if not found or ref_home is distinct from new.home_id or (ref_home is null and ref_user is distinct from new.user_id) then raise exception 'Bolletta non appartenente allo spazio'; end if;
  if new.status='confirmed' and (tg_op='INSERT' or old.status is distinct from new.status) and not internal then raise exception 'Usa conferma protetta'; end if;
  if tg_op='UPDATE' and (new.confirmed_at is distinct from old.confirmed_at or new.confirmed_by is distinct from old.confirmed_by) and not internal then raise exception 'Conferma non modificabile'; end if;
 end if;
 if tg_table_name='payment_receipts' and tg_op='UPDATE' and old.status='confirmed' then raise exception 'Ricevuta già confermata, non modificabile'; end if;
 if tg_table_name='maintenance_events' then
  select user_id,home_id into ref_user,ref_home from public.maintenance_assets where id=new.asset_id;
  if not found or ref_home is distinct from new.home_id or (ref_home is null and ref_user is distinct from new.user_id) then raise exception 'Manutenzione non appartenente allo spazio'; end if;
 end if;
 return new;
end $$;
-- Non-privileged triggers run with the security-definer validation function.
create trigger v19_guard_docs before insert or update on public.home_documents for each row execute function public.v19_reference_guard();
create trigger v19_guard_meter_reminders before insert or update on public.meter_reminders for each row execute function public.v19_reference_guard();
create trigger v19_guard_readings before insert or update on public.meter_readings for each row execute function public.v19_reference_guard();
create trigger v19_guard_assets before insert or update on public.maintenance_assets for each row execute function public.v19_reference_guard();
create trigger v19_guard_events before insert or update on public.maintenance_events for each row execute function public.v19_reference_guard();
create trigger v19_guard_receipts before insert or update on public.payment_receipts for each row execute function public.v19_reference_guard();
create trigger v19_guard_contracts before insert or update on public.home_contracts for each row execute function public.v19_reference_guard();
create trigger v19_guard_properties before insert or update on public.home_properties for each row execute function public.v19_reference_guard();
create trigger v19_guard_bills before insert or update on public.bills for each row execute function public.v19_reference_guard();
create trigger v19_guard_utilities before insert or update on public.utilities for each row execute function public.v19_reference_guard();

-- Local transaction flag is set inside privileged RPC. Clients cannot run arbitrary SET LOCAL through PostgREST.
create or replace function public.confirm_payment_receipt(target_receipt uuid) returns void
language plpgsql security definer set search_path='' as $$
declare r public.payment_receipts%rowtype;b public.bills%rowtype;
begin
 select * into r from public.payment_receipts where id=target_receipt for update;
 if not found or not public.v19_can_edit(r.user_id,r.home_id) then raise exception 'Ricevuta non accessibile'; end if;
 if r.status <> 'pending' then raise exception 'Già confermata'; end if;
 select * into b from public.bills where id=r.bill_id for update;
 if not found or b.home_id is distinct from r.home_id or not public.v19_can_edit(b.user_id,b.home_id) then raise exception 'Bolletta non accessibile'; end if;
 if b.paid_at is not null then raise exception 'Bolletta già pagata'; end if;
 if round(b.amount*100)::bigint <> round(r.amount*100)::bigint then raise exception 'Importo diverso dalla bolletta'; end if;
 perform set_config('app.confirming_receipt','yes',true);
 update public.bills set paid_at=now() where id=b.id;
 update public.payment_receipts set status='confirmed',confirmed_by=(select auth.uid()),confirmed_at=now() where id=r.id;
 perform set_config('app.confirming_receipt','',true);
end $$;
revoke all on function public.confirm_payment_receipt(uuid) from public,anon;
grant execute on function public.confirm_payment_receipt(uuid) to authenticated;

-- Secure row-level rules: shared records are visible to members, editable only by owners/editors.
do $$ declare table_name text; begin
 foreach table_name in array array['home_properties','home_documents','meter_readings','maintenance_assets','maintenance_events','payment_receipts','home_contracts','meter_reminders'] loop
  execute format('alter table public.%I enable row level security',table_name);
  execute format('create policy %I on public.%I for select to authenticated using(public.v19_can_read(user_id,home_id))','v19_read_'||table_name,table_name);
  execute format('create policy %I on public.%I for insert to authenticated with check(user_id=(select auth.uid()) and public.v19_can_edit(user_id,home_id))','v19_insert_'||table_name,table_name);
  execute format('create policy %I on public.%I for update to authenticated using(public.v19_can_edit(user_id,home_id)) with check(public.v19_can_edit(user_id,home_id))','v19_update_'||table_name,table_name);
  execute format('create policy %I on public.%I for delete to authenticated using(public.v19_can_edit(user_id,home_id))','v19_delete_'||table_name,table_name);
  execute format('revoke all on public.%I from anon,authenticated',table_name);
  execute format('grant select,insert,update,delete on public.%I to authenticated',table_name);
 end loop;
end $$;
alter table public.user_alert_preferences enable row level security;
create policy v19_alert_prefs_self on public.user_alert_preferences for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
revoke all on public.user_alert_preferences from anon,authenticated;
grant select,insert,update,delete on public.user_alert_preferences to authenticated;
alter table public.user_alerts enable row level security;
create policy v19_alert_read on public.user_alerts for select to authenticated using(user_id=(select auth.uid()));
create policy v19_alert_update on public.user_alerts for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
revoke all on public.user_alerts from anon,authenticated;
grant select,update(read_at) on public.user_alerts to authenticated;
-- Receipts are immutable after creation. Only the protected RPC can confirm them.
revoke update on public.payment_receipts from authenticated;

-- Storage is private. Client uploads only into its own user-id prefix;
-- shared documents become readable only after their metadata record exists.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('house-documents','house-documents',false,10485760,ARRAY['application/pdf','image/jpeg','image/png','image/webp','text/plain'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create policy v19_upload_own on storage.objects for insert to authenticated
with check(bucket_id='house-documents' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy v19_download_allowed on storage.objects for select to authenticated
using(bucket_id='house-documents' and (
  (storage.foldername(name))[1]=(select auth.uid())::text
  or exists(select 1 from public.home_documents d where d.storage_path=name and d.home_id is not null and public.is_home_member(d.home_id))
));
create policy v19_delete_allowed on storage.objects for delete to authenticated
using(bucket_id='house-documents' and (
  (storage.foldername(name))[1]=(select auth.uid())::text
  or exists(select 1 from public.home_documents d where d.storage_path=name and d.home_id is not null and public.can_edit_home(d.home_id))
));
