-- Casa in Ordine 2.0. Execute AFTER v1.9 migration, following a verified backup.
-- Review with two real Supabase users before production. Never run with client anon key.
create extension if not exists pgcrypto;

create table if not exists public.home_savings_goals (
 id uuid primary key default gen_random_uuid(),user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 home_id uuid references public.homes(id) on delete cascade,
 label text not null check(length(btrim(label)) between 2 and 150),
 target_amount numeric(12,2) not null check(target_amount>0),
 current_amount numeric(12,2) not null default 0 check(current_amount>=0),
 deadline date not null,created_at timestamptz not null default now()
);
create table if not exists public.home_move_plans (
 id uuid primary key default gen_random_uuid(),user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 home_id uuid references public.homes(id) on delete cascade,
 title text not null check(length(btrim(title)) between 2 and 140),
 move_on date not null,notes text not null default '' check(length(notes)<=1000),
 created_at timestamptz not null default now()
);
create table if not exists public.home_move_steps (
 id uuid primary key default gen_random_uuid(),user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 home_id uuid references public.homes(id) on delete cascade,
 plan_id uuid not null references public.home_move_plans(id) on delete cascade,
 title text not null check(length(btrim(title)) between 2 and 200),
 due_on date,done_at timestamptz,created_at timestamptz not null default now()
);
create table if not exists public.pagopa_notices (
 id uuid primary key default gen_random_uuid(),user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 home_id uuid references public.homes(id) on delete cascade,
 notice_code text not null check(notice_code ~ '^[0-9]{15}([0-9]{3})?$'),
 creditor_code text check(creditor_code is null or creditor_code ~ '^[0-9]{11}$'),
 creditor_name text not null default '' check(length(creditor_name)<=160),
 amount numeric(12,2) check(amount is null or amount>=0), due_on date,
 bill_id uuid references public.bills(id) on delete set null,
 created_at timestamptz not null default now(),unique(user_id,notice_code)
);
create table if not exists public.bill_security_reviews (
 id uuid primary key default gen_random_uuid(),user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 home_id uuid references public.homes(id) on delete cascade,
 bill_id uuid not null unique references public.bills(id) on delete cascade,
 sender text not null default '' check(length(sender)<=240),
 sender_auth text not null default 'unknown' check(sender_auth in('pass','fail','unknown')),
 iban_fingerprint text check(iban_fingerprint is null or iban_fingerprint ~ '^[a-f0-9]{64}$'),
 iban_suffix text check(iban_suffix is null or iban_suffix ~ '^[0-9A-Z]{4}$'),
 risk_flags jsonb not null default '[]'::jsonb check(jsonb_typeof(risk_flags)='array'),
 review_status text not null default 'pending' check(review_status in('pending','reviewed','suspicious')),
 reviewed_at timestamptz,created_at timestamptz not null default now()
);
create table if not exists public.home_audit_log (
 id bigint generated always as identity primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 home_id uuid references public.homes(id) on delete cascade,
 actor_id uuid references auth.users(id) on delete set null,
 source_table text not null, record_id uuid not null,
 action text not null check(action in('INSERT','UPDATE','DELETE','RESTORE')),
 summary text not null default '', created_at timestamptz not null default now()
);
create index if not exists idx_v20_audit on public.home_audit_log(home_id,created_at desc);
create index if not exists idx_v20_audit_self on public.home_audit_log(user_id,created_at desc);
create table if not exists public.home_recycle_bin (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 home_id uuid references public.homes(id) on delete cascade,
 source_table text not null check(source_table in('house_tasks','home_shopping')),
 record_id uuid not null, snapshot jsonb not null,
 deleted_by uuid references auth.users(id) on delete set null,
 deleted_at timestamptz not null default now(), restored_at timestamptz,
 unique(source_table,record_id)
);
create table if not exists public.offline_import_log (
 user_id uuid not null references auth.users(id) on delete cascade,
 client_id uuid not null,
 record_id uuid not null,
 created_at timestamptz not null default now(),
 primary key(user_id,client_id)
);

-- Row scope is immovable. Cross-entity references must refer to the same private/shared space.
create or replace function public.v20_reference_guard() returns trigger
language plpgsql security definer set search_path='' as $$
declare ref_user uuid;ref_home uuid;
begin
 if tg_op='UPDATE' and (new.user_id is distinct from old.user_id or new.home_id is distinct from old.home_id) then
   raise exception 'Impossibile cambiare proprietario o casa';
 end if;
 if tg_table_name='home_move_steps' then
   select user_id,home_id into ref_user,ref_home from public.home_move_plans where id=new.plan_id;
 elsif tg_table_name='pagopa_notices' and new.bill_id is not null then
   select user_id,home_id into ref_user,ref_home from public.bills where id=new.bill_id;
 elsif tg_table_name='bill_security_reviews' then
   select user_id,home_id into ref_user,ref_home from public.bills where id=new.bill_id;
 else return new;
 end if;
 if not found or ref_home is distinct from new.home_id or (ref_home is null and ref_user is distinct from new.user_id) then
   raise exception 'Riferimento esterno allo spazio autorizzato';
 end if;
 return new;
end $$;
create trigger v20_move_guard before insert or update on public.home_move_steps for each row execute function public.v20_reference_guard();
create trigger v20_pagopa_guard before insert or update on public.pagopa_notices for each row execute function public.v20_reference_guard();
create trigger v20_risk_guard before insert or update on public.bill_security_reviews for each row execute function public.v20_reference_guard();
create trigger v20_goals_guard before insert or update on public.home_savings_goals for each row execute function public.v20_reference_guard();
create trigger v20_plan_guard before insert or update on public.home_move_plans for each row execute function public.v20_reference_guard();

-- No direct client inserts to audit, bin or dedupe tables. Triggers/RPC own these writes.
do $$ declare t text;begin
 foreach t in array array['home_savings_goals','home_move_plans','home_move_steps','pagopa_notices','bill_security_reviews'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('create policy %I on public.%I for select to authenticated using(public.v19_can_read(user_id,home_id))','v20_read_'||t,t);
  execute format('create policy %I on public.%I for insert to authenticated with check(user_id=(select auth.uid()) and public.v19_can_edit(user_id,home_id))','v20_insert_'||t,t);
  execute format('create policy %I on public.%I for update to authenticated using(public.v19_can_edit(user_id,home_id)) with check(public.v19_can_edit(user_id,home_id))','v20_update_'||t,t);
  execute format('create policy %I on public.%I for delete to authenticated using(public.v19_can_edit(user_id,home_id))','v20_delete_'||t,t);
  execute format('revoke all on public.%I from anon,authenticated',t);
  execute format('grant select,insert,update,delete on public.%I to authenticated',t);
 end loop;
end $$;
-- Allow review changes only; do not let users rewrite the security evidence.
revoke update on public.bill_security_reviews from authenticated;
grant update(review_status,reviewed_at) on public.bill_security_reviews to authenticated;

alter table public.home_audit_log enable row level security;
create policy v20_audit_read on public.home_audit_log for select to authenticated using(public.v19_can_read(user_id,home_id));
revoke all on public.home_audit_log from anon,authenticated;
grant select on public.home_audit_log to authenticated;
alter table public.home_recycle_bin enable row level security;
create policy v20_bin_read on public.home_recycle_bin for select to authenticated using(public.v19_can_read(user_id,home_id));
revoke all on public.home_recycle_bin from anon,authenticated;
grant select on public.home_recycle_bin to authenticated;
alter table public.offline_import_log enable row level security;
revoke all on public.offline_import_log from anon,authenticated;

create or replace function public.v20_audit_changes() returns trigger
language plpgsql security definer set search_path='' as $$
declare r jsonb;uid uuid;house uuid;record_uuid uuid; description text;
begin
 r=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
 -- Home expenses/shopping use created_by and have no user_id; keep the initiator as owner metadata.
 uid=coalesce((r->>'user_id')::uuid,(r->>'created_by')::uuid,(select auth.uid()));
 house=(r->>'home_id')::uuid;
 record_uuid=(r->>'id')::uuid;
 description=left(coalesce(r->>'title',r->>'label',r->>'supplier',r->>'name','Elemento'),180);
 if uid is null then return null;end if;
 insert into public.home_audit_log(user_id,home_id,actor_id,source_table,record_id,action,summary)
 values(uid,house,(select auth.uid()),tg_table_name,record_uuid,tg_op,description);
 if tg_op='DELETE' and tg_table_name in ('house_tasks','home_shopping') then
  insert into public.home_recycle_bin(user_id,home_id,source_table,record_id,snapshot,deleted_by)
  values(uid,house,tg_table_name,record_uuid,r,(select auth.uid()))
  on conflict(source_table,record_id) do update set deleted_at=now(),restored_at=null,snapshot=excluded.snapshot,deleted_by=excluded.deleted_by;
 end if;
 return null;
end $$;
do $$ declare t text;begin
 foreach t in array array['bills','utilities','house_tasks','home_shopping','home_expenses','home_contracts','home_savings_goals','home_move_plans','pagopa_notices'] loop
  execute format('drop trigger if exists v20_audit on public.%I',t);
  execute format('create trigger v20_audit after insert or update or delete on public.%I for each row execute function public.v20_audit_changes()',t);
 end loop;
end $$;

-- Restore only tiny allowlisted records, no arbitrary dynamic table names.
create or replace function public.v20_restore_deleted(target_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare entry public.home_recycle_bin%rowtype;item jsonb;
begin
 select * into entry from public.home_recycle_bin where id=target_id and restored_at is null and deleted_at>now()-interval '30 days' for update;
 if not found then raise exception 'Elemento non più recuperabile';end if;
 if not public.v19_can_edit(entry.user_id,entry.home_id) then raise exception 'Accesso negato';end if;
 item=entry.snapshot;
 if entry.source_table='house_tasks' then
  insert into public.house_tasks(id,user_id,home_id,title,due_date,done_at,created_at)
   values(entry.record_id,entry.user_id,entry.home_id,item->>'title',(item->>'due_date')::date,(item->>'done_at')::timestamptz,coalesce((item->>'created_at')::timestamptz,now()));
 elsif entry.source_table='home_shopping' then
  insert into public.home_shopping(id,home_id,title,quantity,checked,created_by,created_at)
   values(entry.record_id,entry.home_id,item->>'title',coalesce(item->>'quantity','1'),coalesce((item->>'checked')::boolean,false),entry.user_id,coalesce((item->>'created_at')::timestamptz,now()));
 else raise exception 'Tipo di elemento non recuperabile';end if;
 update public.home_recycle_bin set restored_at=now() where id=target_id;
 insert into public.home_audit_log(user_id,home_id,actor_id,source_table,record_id,action,summary)
 values(entry.user_id,entry.home_id,(select auth.uid()),entry.source_table,entry.record_id,'RESTORE',left(coalesce(item->>'title','Elemento'),180));
 return entry.record_id;
end $$;
revoke all on function public.v20_restore_deleted(uuid) from public,anon;
grant execute on function public.v20_restore_deleted(uuid) to authenticated;

-- Idempotent replay of offline PERSONAL task drafts only: never adds to a shared home implicitly.
create or replace function public.v20_apply_offline_task(p_client_id uuid,title_text text,due_on date default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare uid uuid;existing uuid;new_id uuid;
begin
 uid=(select auth.uid());if uid is null then raise exception 'Autenticazione richiesta';end if;
 if title_text is null or length(btrim(title_text)) not between 2 and 180 then raise exception 'Titolo non valido';end if;
 perform pg_advisory_xact_lock(hashtextextended(uid::text||p_client_id::text,0));
 select record_id into existing from public.offline_import_log where user_id=uid and client_id=p_client_id;
 if existing is not null then return existing;end if;
 insert into public.house_tasks(user_id,title,due_date,home_id) values(uid,btrim(title_text),due_on,null) returning id into new_id;
 insert into public.offline_import_log(user_id,client_id,record_id) values(uid,p_client_id,new_id);
 return new_id;
end $$;
revoke all on function public.v20_apply_offline_task(uuid,text,date) from public,anon;
grant execute on function public.v20_apply_offline_task(uuid,text,date) to authenticated;

-- User-specific preferences for new monitoring alerts.
alter table public.user_alert_preferences add column if not exists push_monitor boolean not null default true;

-- Expand notification kinds without changing reminder behavior. User may only read/mark own alerts.
create index if not exists idx_v20_goals_scope on public.home_savings_goals(home_id,deadline);
create index if not exists idx_v20_move_scope on public.home_move_plans(home_id,move_on);
create index if not exists idx_v20_notice_scope on public.pagopa_notices(home_id,due_on);
create unique index if not exists idx_v20_notice_shared_unique on public.pagopa_notices(home_id,notice_code) where home_id is not null;

-- One atomic user-confirmed action: save pagoPA metadata and optionally create a payable bill.
create or replace function public.v20_register_pagopa(
 p_home_id uuid,p_notice_code text,p_creditor_code text,p_creditor_name text,
 p_amount numeric,p_due_on date,p_create_bill boolean default false
) returns uuid language plpgsql security definer set search_path='' as $$
declare uid uuid;bill_uuid uuid;notice_uuid uuid;
begin
 uid=(select auth.uid());
 if uid is null or (p_home_id is not null and not public.can_edit_home(p_home_id)) then raise exception 'Accesso negato';end if;
 if p_notice_code is null or p_notice_code !~ '^[0-9]{15}([0-9]{3})?$' then raise exception 'Codice avviso non valido';end if;
 if p_creditor_code is not null and p_creditor_code !~ '^[0-9]{11}$' then raise exception 'Codice ente non valido';end if;
 if p_amount is not null and (p_amount<0 or p_amount>100000000) then raise exception 'Importo non valido';end if;
 if p_create_bill then
  if p_amount is null or p_due_on is null then raise exception 'Per una scadenza servono importo e data';end if;
  insert into public.bills(user_id,home_id,title,supplier,category,amount,due_date,paid_at,is_estimate,source)
  values(uid,p_home_id,'Avviso pagoPA · '||left(coalesce(nullif(btrim(p_creditor_name),''),'Ente creditore'),100),
   left(coalesce(nullif(btrim(p_creditor_name),''),'Ente creditore'),150),'Tasse',p_amount,p_due_on,null,false,'manual')
  returning id into bill_uuid;
 end if;
 insert into public.pagopa_notices(user_id,home_id,notice_code,creditor_code,creditor_name,amount,due_on,bill_id)
 values(uid,p_home_id,p_notice_code,p_creditor_code,left(coalesce(p_creditor_name,''),160),p_amount,p_due_on,bill_uuid)
 returning id into notice_uuid;
 return notice_uuid;
end $$;
revoke all on function public.v20_register_pagopa(uuid,text,text,text,numeric,date,boolean) from public,anon;
grant execute on function public.v20_register_pagopa(uuid,text,text,text,numeric,date,boolean) to authenticated;

-- Offline shopping list replays are strictly idempotent, home-scoped and confirmed by user.
create or replace function public.v20_apply_offline_shopping(p_client_id uuid,p_title text,p_home_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare uid uuid;existing uuid;new_id uuid;
begin
 uid=(select auth.uid());
 if uid is null or p_home_id is null or not public.can_edit_home(p_home_id) then raise exception 'Questa lista non è modificabile';end if;
 if p_title is null or length(btrim(p_title)) not between 1 and 180 then raise exception 'Articolo non valido';end if;
 perform pg_advisory_xact_lock(hashtextextended(uid::text||p_client_id::text,0));
 select record_id into existing from public.offline_import_log where user_id=uid and client_id=p_client_id;
 if existing is not null then return existing;end if;
 insert into public.home_shopping(home_id,title,created_by) values(p_home_id,btrim(p_title),uid) returning id into new_id;
 insert into public.offline_import_log(user_id,client_id,record_id) values(uid,p_client_id,new_id);
 return new_id;
end $$;
revoke all on function public.v20_apply_offline_shopping(uuid,text,uuid) from public,anon;
grant execute on function public.v20_apply_offline_shopping(uuid,text,uuid) to authenticated;

alter table public.user_alerts drop constraint if exists user_alerts_kind_check;
alter table public.user_alerts add constraint user_alerts_kind_check check(kind in('contract','maintenance','warranty','meter','missing_bill','mail_sync','move','savings','fraud'));
