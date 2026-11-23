-- Casa in Ordine: notifiche push rinviate dall'orario silenzioso (23 novembre 2026).
-- Da eseguire una volta nel SQL Editor di Supabase, DOPO migrate_v52_ripristino_scadenze.sql. Rieseguibile.
--
-- Prima: il lavoro giornaliero (/api/cron) parte alle 08:00–08:07 ora italiana in inverno e alle
-- 09:00–09:07 in estate. Chi aveva un orario silenzioso che copre quell'ora (per esempio
-- 22:00–08:30) non riceveva mai le notifiche sul telefono: la push si saltava e non si riprovava.
-- Ora la push si mette da parte in push_deferred e parte dopo la fine dell'orario silenzioso, con
-- il giro orario di /api/cron/push (migrate_v53_cron_push.sql, Supabase Cron). Una voce per
-- persona e cosa da avvisare; vale solo per il giorno in cui è nata. La usa solo il server.
begin;

create table if not exists public.push_deferred (
 user_id uuid not null references auth.users(id) on delete cascade,
 dedupe_key text not null check (length(dedupe_key) between 3 and 200),
 kind text not null check (length(kind) between 1 and 40),
 payload jsonb not null check (jsonb_typeof(payload) = 'object' and pg_column_size(payload) <= 4096),
 created_on date not null,
 created_at timestamptz not null default now(),
 primary key (user_id, dedupe_key)
);
create index if not exists idx_push_deferred_created_on on public.push_deferred(created_on);
comment on table public.push_deferred is
 'Notifiche push rinviate dall''orario silenzioso, mandate dal giro orario /api/cron/push. Solo per il server.';

alter table public.push_deferred enable row level security;
revoke all on public.push_deferred from public, anon, authenticated;
grant select, insert, update, delete on public.push_deferred to service_role;

commit;
