-- Casa in Ordine v1.8 - run ONCE after backup of v1.7 database.
-- Personal entries stay private. Only records explicitly created in a home are shared.
create extension if not exists pgcrypto;

create table if not exists public.homes (
 id uuid primary key default gen_random_uuid(),
 name text not null check (char_length(btrim(name)) between 2 and 100),
 owner_id uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now()
);
create table if not exists public.home_members (
 home_id uuid not null references public.homes(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 email text not null,
 role text not null check (role in ('owner','editor','viewer')),
 joined_at timestamptz not null default now(),
 primary key(home_id,user_id)
);
create index if not exists idx_home_members_user on public.home_members(user_id);
create table if not exists public.home_invites (
 id uuid primary key default gen_random_uuid(),
 home_id uuid not null references public.homes(id) on delete cascade,
 email text not null,
 role text not null check(role in ('editor','viewer')),
 token_hash text not null unique,
 expires_at timestamptz not null,
 claimed_at timestamptz,
 created_at timestamptz not null default now(),
 created_by uuid not null references auth.users(id) on delete cascade
);
create index if not exists idx_home_invites_home on public.home_invites(home_id,expires_at);

create or replace function public.is_home_member(target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
 select exists (select 1 from public.home_members m where m.home_id=target and m.user_id=(select auth.uid()));
$$;
create or replace function public.can_edit_home(target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.home_members m where m.home_id=target and m.user_id=(select auth.uid()) and m.role in ('owner','editor'));
$$;
create or replace function public.is_home_owner(target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.home_members m where m.home_id=target and m.user_id=(select auth.uid()) and m.role='owner');
$$;
revoke all on function public.is_home_member(uuid),public.can_edit_home(uuid),public.is_home_owner(uuid) from public,anon;
grant execute on function public.is_home_member(uuid),public.can_edit_home(uuid),public.is_home_owner(uuid) to authenticated;

create or replace function public.create_home(home_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare h uuid; em text;
begin
 if (select auth.uid()) is null then raise exception 'Accesso richiesto'; end if;
 if char_length(btrim(coalesce(home_name,''))) not between 2 and 100 then raise exception 'Nome casa non valido'; end if;
 if (select count(*) from public.homes where owner_id=(select auth.uid())) >= 10 then raise exception 'Numero massimo di case raggiunto'; end if;
 select lower(coalesce(email,'')) into em from auth.users where id=(select auth.uid());
 insert into public.homes(name,owner_id) values (btrim(home_name),(select auth.uid())) returning id into h;
 insert into public.home_members(home_id,user_id,email,role) values (h,(select auth.uid()),em,'owner');
 return h;
end $$;

create or replace function public.invite_home_member(target_home uuid, invite_email text, invite_role text)
returns text language plpgsql security definer set search_path = '' as $$
declare secret text; normalized text;
begin
 if not public.is_home_owner(target_home) then raise exception 'Solo il proprietario può invitare'; end if;
 normalized:=lower(btrim(coalesce(invite_email,'')));
 if normalized !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or char_length(normalized)>254 then raise exception 'Email non valida'; end if;
 if invite_role not in ('editor','viewer') then raise exception 'Ruolo non valido'; end if;
 if exists(select 1 from public.home_members where home_id=target_home and email=normalized) then raise exception 'Utente già membro'; end if;
 if (select count(*) from public.home_invites where home_id=target_home and claimed_at is null and expires_at>now())>=15 then raise exception 'Troppi inviti aperti'; end if;
 secret:=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
 insert into public.home_invites(home_id,email,role,token_hash,expires_at,created_by)
 values(target_home,normalized,invite_role,encode(sha256(convert_to(secret,'UTF8')),'hex'),now()+interval '7 days',(select auth.uid()));
 return secret;
end $$;

create or replace function public.accept_home_invite(secret text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare inv public.home_invites%rowtype; email_verified text;
begin
 if (select auth.uid()) is null then raise exception 'Accesso richiesto'; end if;
 if secret is null or char_length(secret)<>64 or secret !~ '^[0-9a-f]+$' then raise exception 'Invito non valido'; end if;
 select * into inv from public.home_invites where token_hash=encode(sha256(convert_to(secret,'UTF8')),'hex') and claimed_at is null and expires_at>now() for update;
 if not found then raise exception 'Invito scaduto o già usato'; end if;
 select lower(email) into email_verified from auth.users where id=(select auth.uid()) and email_confirmed_at is not null;
 if email_verified is distinct from inv.email then raise exception 'Accedi con l’indirizzo email invitato e verificato'; end if;
 insert into public.home_members(home_id,user_id,email,role) values(inv.home_id,(select auth.uid()),email_verified,inv.role)
 on conflict(home_id,user_id) do nothing;
 update public.home_invites set claimed_at=now() where id=inv.id;
 return inv.home_id;
end $$;

create or replace function public.remove_home_member(target_home uuid,target_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
 if not public.is_home_owner(target_home) then raise exception 'Solo il proprietario può rimuovere membri'; end if;
 if target_user=(select auth.uid()) then raise exception 'Il proprietario non può essere rimosso'; end if;
 delete from public.home_members where home_id=target_home and user_id=target_user and role <> 'owner';
end $$;
create or replace function public.change_home_member_role(target_home uuid,target_user uuid,new_role text) returns void
language plpgsql security definer set search_path = '' as $$
begin
 if not public.is_home_owner(target_home) then raise exception 'Solo il proprietario può assegnare ruoli'; end if;
 if new_role not in ('editor','viewer') then raise exception 'Ruolo non valido'; end if;
 update public.home_members set role=new_role where home_id=target_home and user_id=target_user and role <> 'owner';
end $$;
create or replace function public.revoke_home_invite(invite_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
 delete from public.home_invites where id=invite_id and public.is_home_owner(home_id);
end $$;
revoke all on function public.create_home(text), public.invite_home_member(uuid,text,text),public.accept_home_invite(text),public.remove_home_member(uuid,uuid),public.change_home_member_role(uuid,uuid,text),public.revoke_home_invite(uuid) from public,anon;
grant execute on function public.create_home(text),public.invite_home_member(uuid,text,text),public.accept_home_invite(text),public.remove_home_member(uuid,uuid),public.change_home_member_role(uuid,uuid,text),public.revoke_home_invite(uuid) to authenticated;

alter table public.homes enable row level security;
alter table public.home_members enable row level security;
alter table public.home_invites enable row level security;
create policy homes_read on public.homes for select to authenticated using(public.is_home_member(id));
create policy members_read on public.home_members for select to authenticated using(public.is_home_member(home_id));
create policy invites_read_owner on public.home_invites for select to authenticated using(public.is_home_owner(home_id));
revoke all on public.homes,public.home_members,public.home_invites from anon,authenticated;
grant select on public.homes,public.home_members,public.home_invites to authenticated;

-- Support 24-month reminders for vehicle inspections and recurring household bills.
alter table public.utilities drop constraint if exists utilities_frequency_check;
alter table public.utilities add constraint utilities_frequency_check
 check(frequency in ('none','monthly','bimonthly','quarterly','yearly','biennial'));

-- Re-scope old entities. A null home_id means personal and stays private.
alter table public.bills add column if not exists home_id uuid references public.homes(id) on delete cascade;
alter table public.utilities add column if not exists home_id uuid references public.homes(id) on delete cascade;
alter table public.house_tasks add column if not exists home_id uuid references public.homes(id) on delete cascade;
alter table public.house_tasks add column if not exists assigned_to uuid references auth.users(id) on delete set null;
create index if not exists idx_bills_home on public.bills(home_id,due_date);
create index if not exists idx_utilities_home on public.utilities(home_id);
create index if not exists idx_tasks_home on public.house_tasks(home_id);

-- Prevent moving a shared record to another home / replacing its owner by ordinary updates.
create or replace function public.prevent_home_scope_change() returns trigger
language plpgsql set search_path = '' as $$
begin
 if old.user_id is distinct from new.user_id or old.home_id is distinct from new.home_id then
   raise exception 'Il proprietario e la casa non possono essere modificati';
 end if;
 return new;
end $$;
create trigger bills_scope_guard before update on public.bills for each row execute function public.prevent_home_scope_change();
create trigger utilities_scope_guard before update on public.utilities for each row execute function public.prevent_home_scope_change();
create trigger tasks_scope_guard before update on public.house_tasks for each row execute function public.prevent_home_scope_change();

-- An invoice linked to a utility must share the same home (or both must be personal).
create or replace function public.validate_bill_utility_home() returns trigger language plpgsql set search_path = '' as $$
declare parent_home uuid;
begin
 if new.utility_id is null then return new; end if;
 select home_id into parent_home from public.utilities where id=new.utility_id;
 if not found or parent_home is distinct from new.home_id then raise exception 'Utenza di una casa diversa'; end if;
 return new;
end $$;
create trigger bills_utility_guard before insert or update of utility_id,home_id on public.bills
 for each row execute function public.validate_bill_utility_home();

-- Replace user-only policies rather than OR-ing public household access over old ones.
drop policy if exists "bills_select_self" on public.bills;
drop policy if exists "bills_insert_self" on public.bills;
drop policy if exists "bills_update_self" on public.bills;
drop policy if exists "bills_delete_self" on public.bills;
create policy bills_read_scoped on public.bills for select to authenticated using (
 (home_id is null and user_id=(select auth.uid())) or (home_id is not null and public.is_home_member(home_id)));
create policy bills_insert_scoped on public.bills for insert to authenticated with check (
 user_id=(select auth.uid()) and (home_id is null or public.can_edit_home(home_id)));
create policy bills_update_scoped on public.bills for update to authenticated using (
 (home_id is null and user_id=(select auth.uid())) or (home_id is not null and public.can_edit_home(home_id))) with check (
 (home_id is null and user_id=(select auth.uid())) or (home_id is not null and public.can_edit_home(home_id)));
create policy bills_delete_scoped on public.bills for delete to authenticated using (
 (home_id is null and user_id=(select auth.uid())) or (home_id is not null and public.can_edit_home(home_id)));

drop policy if exists "utilities_select_self" on public.utilities;
drop policy if exists "utilities_insert_self" on public.utilities;
drop policy if exists "utilities_update_self" on public.utilities;
drop policy if exists "utilities_delete_self" on public.utilities;
create policy utilities_read_scoped on public.utilities for select to authenticated using (
 (home_id is null and user_id=(select auth.uid())) or (home_id is not null and public.is_home_member(home_id)));
create policy utilities_insert_scoped on public.utilities for insert to authenticated with check (
 user_id=(select auth.uid()) and (home_id is null or public.can_edit_home(home_id)));
create policy utilities_update_scoped on public.utilities for update to authenticated using (
 (home_id is null and user_id=(select auth.uid())) or (home_id is not null and public.can_edit_home(home_id))) with check (
 (home_id is null and user_id=(select auth.uid())) or (home_id is not null and public.can_edit_home(home_id)));
create policy utilities_delete_scoped on public.utilities for delete to authenticated using (
 (home_id is null and user_id=(select auth.uid())) or (home_id is not null and public.can_edit_home(home_id)));

drop policy if exists "tasks_select_self" on public.house_tasks;
drop policy if exists "tasks_insert_self" on public.house_tasks;
drop policy if exists "tasks_update_self" on public.house_tasks;
drop policy if exists "tasks_delete_self" on public.house_tasks;
create policy tasks_read_scoped on public.house_tasks for select to authenticated using (
 (home_id is null and user_id=(select auth.uid())) or (home_id is not null and public.is_home_member(home_id)));
create policy tasks_insert_scoped on public.house_tasks for insert to authenticated with check (
 user_id=(select auth.uid()) and (home_id is null or public.can_edit_home(home_id)) and (assigned_to is null or (home_id is not null and exists(select 1 from public.home_members m where m.home_id=house_tasks.home_id and m.user_id=assigned_to))));
create policy tasks_update_scoped on public.house_tasks for update to authenticated using (
 (home_id is null and user_id=(select auth.uid())) or (home_id is not null and public.can_edit_home(home_id))) with check (
 ((home_id is null and user_id=(select auth.uid())) or (home_id is not null and public.can_edit_home(home_id))) and
 (assigned_to is null or exists(select 1 from public.home_members m where m.home_id=house_tasks.home_id and m.user_id=assigned_to)));
create policy tasks_delete_scoped on public.house_tasks for delete to authenticated using (
 (home_id is null and user_id=(select auth.uid())) or (home_id is not null and public.can_edit_home(home_id)));

-- Household finance and collaboration. No app/mail credentials are shared.
create table if not exists public.home_budgets (
 id uuid primary key default gen_random_uuid(),home_id uuid not null references public.homes(id) on delete cascade,
 month text not null check(month ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'),
 category text not null check(char_length(btrim(category)) between 2 and 64),
 limit_amount numeric(12,2) not null check(limit_amount >= 0),
 unique(home_id,month,category)
);
create table if not exists public.home_expenses (
 id uuid primary key default gen_random_uuid(),home_id uuid not null references public.homes(id) on delete cascade,
 created_by uuid not null references auth.users(id),paid_by uuid not null references auth.users(id),
 title text not null check(char_length(btrim(title)) between 2 and 180),
 category text not null default 'Altro',amount numeric(12,2) not null check(amount > 0),
 incurred_on date not null,created_at timestamptz not null default now()
);
create table if not exists public.home_expense_shares (
 expense_id uuid not null references public.home_expenses(id) on delete cascade,
 user_id uuid not null references auth.users(id),amount numeric(12,2) not null check(amount>=0),
 primary key(expense_id,user_id)
);
create index if not exists idx_home_expenses_month on public.home_expenses(home_id,incurred_on);
create table if not exists public.home_shopping (
 id uuid primary key default gen_random_uuid(),home_id uuid not null references public.homes(id) on delete cascade,
 title text not null check(char_length(btrim(title)) between 1 and 180),
 quantity text not null default '1' check(char_length(quantity)<=40),
 checked boolean not null default false,created_by uuid not null default auth.uid() references auth.users(id),
 created_at timestamptz not null default now()
);
create index if not exists idx_home_shopping_home on public.home_shopping(home_id,checked);
create table if not exists public.home_vehicles (
 id uuid primary key default gen_random_uuid(),home_id uuid not null references public.homes(id) on delete cascade,
 name text not null check(char_length(btrim(name)) between 2 and 120),
 plate text check(char_length(plate)<=20),created_at timestamptz not null default now()
);
create table if not exists public.home_vehicle_deadlines (
 id uuid primary key default gen_random_uuid(),home_id uuid not null references public.homes(id) on delete cascade,
 vehicle_id uuid not null references public.home_vehicles(id) on delete cascade,
 bill_id uuid references public.bills(id) on delete set null,
 utility_id uuid references public.utilities(id) on delete set null,
 repeat_months smallint not null default 0 check(repeat_months in (0,12,24)),
 label text not null check(label in ('Bollo','Assicurazione','Revisione','Tagliando','Altro')),
 due_date date not null,created_at timestamptz not null default now()
);
create index if not exists idx_home_vehicle_deadlines on public.home_vehicle_deadlines(home_id,due_date);

create or replace function public.add_home_expense(target_home uuid, expense_title text, expense_category text, expense_cents integer, expense_date date, payer uuid, split_members uuid[])
returns uuid language plpgsql security definer set search_path = '' as $$
declare new_id uuid; m uuid; n integer; idx integer:=0; cents integer;
begin
 if not public.can_edit_home(target_home) then raise exception 'Non hai permessi di modifica'; end if;
 if char_length(btrim(coalesce(expense_title,''))) not between 2 and 180 or expense_cents not between 1 and 100000000 or expense_date is null then raise exception 'Spesa non valida'; end if;
 if expense_category is null or char_length(expense_category)>64 then raise exception 'Categoria non valida'; end if;
 if payer is null or not exists(select 1 from public.home_members where home_id=target_home and user_id=payer) then raise exception 'Chi paga deve appartenere alla casa'; end if;
 n:=coalesce(array_length(split_members,1),0);
 if n<1 or n>30 or (select count(distinct member) from unnest(split_members) as sub(member))<>n or (select count(*) from public.home_members where home_id=target_home and user_id=any(split_members))<>n then raise exception 'Partecipanti non validi'; end if;
 insert into public.home_expenses(home_id,created_by,paid_by,title,category,amount,incurred_on)
 values(target_home,(select auth.uid()),payer,btrim(expense_title),expense_category,expense_cents / 100.0,expense_date) returning id into new_id;
 foreach m in array split_members loop
  idx:=idx+1;
  cents:=expense_cents / n + case when idx<=expense_cents % n then 1 else 0 end;
  insert into public.home_expense_shares(expense_id,user_id,amount) values(new_id,m,cents/100.0);
 end loop;
 return new_id;
end $$;
revoke all on function public.add_home_expense(uuid,text,text,integer,date,uuid,uuid[]) from public,anon;
grant execute on function public.add_home_expense(uuid,text,text,integer,date,uuid,uuid[]) to authenticated;

-- Atomic create vehicle deadline and matching bill so standard T-3 reminders apply.
create or replace function public.add_home_vehicle_deadline(target_home uuid,target_vehicle uuid,deadline_label text,deadline_date date,estimated_cents integer,repeat_every_months integer)
returns uuid language plpgsql security definer set search_path = '' as $$
declare bill uuid; name text; recurring_utility uuid:=null;
begin
 if not public.can_edit_home(target_home) then raise exception 'Non hai permessi di modifica'; end if;
 if deadline_label not in ('Bollo','Assicurazione','Revisione','Tagliando','Altro') or deadline_date is null or estimated_cents not between 0 and 100000000 or repeat_every_months not in (0,12,24) then raise exception 'Scadenza non valida'; end if;
 select v.name into name from public.home_vehicles v where v.id=target_vehicle and v.home_id=target_home;
 if name is null then raise exception 'Veicolo non appartenente alla casa'; end if;
 if repeat_every_months > 0 then
  insert into public.utilities(user_id,home_id,supplier,category,estimated_amount,frequency,billing_day,next_due_date,active)
  values((select auth.uid()),target_home,name||' · '||deadline_label,'Auto',estimated_cents/100.0,
   case when repeat_every_months=12 then 'yearly' else 'biennial' end,extract(day from deadline_date)::integer,deadline_date,true)
  returning id into recurring_utility;
 end if;
 insert into public.bills(user_id,home_id,utility_id,title,supplier,category,amount,due_date,source,is_estimate)
 values((select auth.uid()),target_home,recurring_utility,deadline_label||' · '||name,name,'Auto',estimated_cents/100.0,deadline_date,'manual',estimated_cents=0)
 returning id into bill;
 insert into public.home_vehicle_deadlines(home_id,vehicle_id,bill_id,utility_id,label,due_date,repeat_months)
 values(target_home,target_vehicle,bill,recurring_utility,deadline_label,deadline_date,repeat_every_months);
 return bill;
end $$;
revoke all on function public.add_home_vehicle_deadline(uuid,uuid,text,date,integer,integer) from public,anon;
grant execute on function public.add_home_vehicle_deadline(uuid,uuid,text,date,integer,integer) to authenticated;

-- Removing a vehicle also cancels the recurring utilities it originated; paid bills stay in history.
create or replace function public.cancel_vehicle_recurring() returns trigger language plpgsql set search_path = '' as $$
begin
 delete from public.utilities where id in(select utility_id from public.home_vehicle_deadlines where vehicle_id=old.id and utility_id is not null);
 return old;
end $$;
create trigger vehicle_recurring_cleanup before delete on public.home_vehicles for each row execute function public.cancel_vehicle_recurring();

-- Read for members, edit only owner/editor. Editors cannot fabricate expense splits (RPC only).
alter table public.home_budgets enable row level security;
alter table public.home_expenses enable row level security;
alter table public.home_expense_shares enable row level security;
alter table public.home_shopping enable row level security;
alter table public.home_vehicles enable row level security;
alter table public.home_vehicle_deadlines enable row level security;
create policy budget_read on public.home_budgets for select to authenticated using (public.is_home_member(home_id));
create policy budget_insert on public.home_budgets for insert to authenticated with check (public.can_edit_home(home_id));
create policy budget_update on public.home_budgets for update to authenticated using(public.can_edit_home(home_id)) with check(public.can_edit_home(home_id));
create policy budget_delete on public.home_budgets for delete to authenticated using(public.can_edit_home(home_id));
create policy expense_read on public.home_expenses for select to authenticated using(public.is_home_member(home_id));
create policy expense_delete on public.home_expenses for delete to authenticated using(public.can_edit_home(home_id));
create policy shares_read on public.home_expense_shares for select to authenticated using (exists(select 1 from public.home_expenses e where e.id=expense_id and public.is_home_member(e.home_id)));
create policy shopping_read on public.home_shopping for select to authenticated using(public.is_home_member(home_id));
create policy shopping_insert on public.home_shopping for insert to authenticated with check(public.can_edit_home(home_id) and created_by=(select auth.uid()));
create policy shopping_update on public.home_shopping for update to authenticated using(public.can_edit_home(home_id)) with check(public.can_edit_home(home_id));
create policy shopping_delete on public.home_shopping for delete to authenticated using(public.can_edit_home(home_id));
create policy vehicles_read on public.home_vehicles for select to authenticated using(public.is_home_member(home_id));
create policy vehicles_insert on public.home_vehicles for insert to authenticated with check(public.can_edit_home(home_id));
create policy vehicles_update on public.home_vehicles for update to authenticated using(public.can_edit_home(home_id)) with check(public.can_edit_home(home_id));
create policy vehicles_delete on public.home_vehicles for delete to authenticated using(public.can_edit_home(home_id));
create policy vehicle_deadlines_read on public.home_vehicle_deadlines for select to authenticated using(public.is_home_member(home_id));
-- Vehicle deadlines are written exclusively by the atomic RPC.
revoke all on public.home_expenses, public.home_expense_shares, public.home_vehicle_deadlines from anon,authenticated;
grant select on public.home_expenses, public.home_expense_shares, public.home_vehicle_deadlines to authenticated;
grant delete on public.home_expenses to authenticated;

-- Browser subscriptions: only the authenticated owner can register a device.
create table if not exists public.push_subscriptions (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
 endpoint text not null unique check(char_length(endpoint)<=2048),p256dh text not null,auth_secret text not null,
 created_at timestamptz not null default now()
);
create index if not exists idx_push_subscriptions_user on public.push_subscriptions(user_id);
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon,authenticated;
-- All push subscription writes go through /api/push/subscribe after token authentication.

-- Logs per recipient: prevents repeat push notifications from cron retries.
create table if not exists public.push_delivery_log (
 bill_id uuid not null references public.bills(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 reminder_date date not null,
 sent_at timestamptz,
 error text,
 primary key(bill_id,user_id,reminder_date)
);
alter table public.push_delivery_log enable row level security;
revoke all on public.push_delivery_log from anon,authenticated;

-- Explicit table grants; RLS remains authoritative for per-home access.
grant select,insert,update,delete on public.home_budgets,public.home_shopping,public.home_vehicles to authenticated;

-- Avoid moving existing shared records from one household to another by UPDATE.
create or replace function public.prevent_house_id_change() returns trigger language plpgsql set search_path = '' as $$
begin
 if old.home_id is distinct from new.home_id then raise exception 'Impossibile cambiare la casa di un elemento'; end if;
 return new;
end $$;
create trigger budget_home_guard before update on public.home_budgets for each row execute function public.prevent_house_id_change();
create trigger shopping_home_guard before update on public.home_shopping for each row execute function public.prevent_house_id_change();
create trigger vehicles_home_guard before update on public.home_vehicles for each row execute function public.prevent_house_id_change();

-- Revocable, unguessable, read-only calendar feed. Never expose the token hash to clients.
create table if not exists public.calendar_feeds (
 user_id uuid primary key references auth.users(id) on delete cascade,
 token_hash text not null unique,
 created_at timestamptz not null default now()
);
alter table public.calendar_feeds enable row level security;
revoke all on public.calendar_feeds from anon,authenticated;

-- Member exit and owner-initiated permanent deletion. Separate from personal mailbox data.
create or replace function public.leave_home(target_home uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
 if public.is_home_owner(target_home) then raise exception 'Il proprietario deve eliminare la casa oppure trasferirne la proprietà'; end if;
 delete from public.home_members where home_id=target_home and user_id=(select auth.uid());
end $$;
create or replace function public.delete_home(target_home uuid,confirm_name text) returns void
language plpgsql security definer set search_path = '' as $$
begin
 if not public.is_home_owner(target_home) then raise exception 'Non hai il permesso di eliminare la casa'; end if;
 if not exists(select 1 from public.homes where id=target_home and name=confirm_name) then raise exception 'Conferma il nome esatto della casa'; end if;
 delete from public.homes where id=target_home;
end $$;
revoke all on function public.leave_home(uuid),public.delete_home(uuid,text) from public,anon;
grant execute on function public.leave_home(uuid),public.delete_home(uuid,text) to authenticated;

-- Track summary push separately from summary email.
alter table public.bill_summaries add column if not exists push_sent_at timestamptz;
