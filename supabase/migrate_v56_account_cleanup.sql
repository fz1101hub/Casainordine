-- Cancellazione account recuperabile: mai cancellare i documenti prima dell'utente.
-- La coda non ha FK a auth.users: deve sopravvivere alla sua eliminazione.
-- Il cron elimina i file solo dopo aver verificato con Auth che l'utente non esiste più.
-- Applicare PRIMA del deployment che usa questa coda.
begin;
create table if not exists public.account_cleanup_jobs (
  user_id uuid primary key,
  keep_paths text[] not null default '{}'::text[],
  lease_paths text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  attempts integer not null default 0 check (attempts >= 0),
  last_attempt_at timestamptz,
  last_error text
);
comment on table public.account_cleanup_jobs is
  'Solo service_role: file da pulire dopo la cancellazione definitiva di auth.users, in modo recuperabile.';
alter table public.account_cleanup_jobs enable row level security;
revoke all on public.account_cleanup_jobs from public, anon, authenticated;
grant select, insert, update, delete on public.account_cleanup_jobs to service_role;
create index if not exists idx_account_cleanup_pending on public.account_cleanup_jobs(created_at);
commit;
