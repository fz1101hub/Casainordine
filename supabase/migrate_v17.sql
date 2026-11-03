-- Casa in Ordine v1.7. Back up the database before applying once to v1.6.
-- Supplier hints belong to each personal account; they do not authorize payments.
create table if not exists public.user_suppliers (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 name text not null check (length(trim(name)) between 3 and 120),
 category text not null default 'Altro',
 sender_email text,
 created_at timestamptz not null default now(),
 unique(user_id,name,category)
);
create index if not exists idx_user_suppliers_owner on public.user_suppliers(user_id);
alter table public.user_suppliers enable row level security;
create policy "user_suppliers_read" on public.user_suppliers for select to authenticated using ((select auth.uid())=user_id);
create policy "user_suppliers_write" on public.user_suppliers for insert to authenticated with check ((select auth.uid())=user_id);
create policy "user_suppliers_delete" on public.user_suppliers for delete to authenticated using ((select auth.uid())=user_id);

alter table public.profiles add column if not exists summary_frequency text not null default 'off' check (summary_frequency in ('off','daily','weekly','biweekly','monthly'));
alter table public.profiles add column if not exists summary_weekday smallint not null default 1 check (summary_weekday between 0 and 6);
alter table public.profiles add column if not exists summary_month_day smallint not null default 1 check (summary_month_day between 1 and 28);
grant update (summary_frequency,summary_weekday,summary_month_day) on public.profiles to authenticated;

create table if not exists public.bill_summaries (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 summary_date date not null,
 bill_count integer not null default 0,
 total_amount numeric(12,2) not null default 0,
 email_sent_at timestamptz,
 email_error text,
 created_at timestamptz not null default now(),
 unique (user_id,summary_date)
);
create index if not exists idx_bill_summaries_owner on public.bill_summaries(user_id,summary_date desc);
alter table public.bill_summaries enable row level security;
create policy "bill_summaries_read_self" on public.bill_summaries for select to authenticated using ((select auth.uid())=user_id);
revoke all on public.bill_summaries from anon,authenticated;
grant select on public.bill_summaries to authenticated;
