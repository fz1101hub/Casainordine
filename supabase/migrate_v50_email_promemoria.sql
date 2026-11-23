-- Casa in Ordine: email dei promemoria a tutti quelli che possono modificare la casa, con una
-- scelta personale (scelta dell'utente, 23 novembre 2026).
-- Da eseguire una volta nel SQL Editor di Supabase, DOPO migrate_v49_affitti.sql. Rieseguibile.
--
-- Prima l'email del promemoria (3 giorni prima della scadenza) arrivava solo a chi aveva inserito
-- la bolletta; le notifiche push arrivavano già a tutti i membri. Ora:
-- - profiles.reminder_emails: ognuno sceglie se ricevere anche le email (di base sì). Il
--   promemoria resta spento per chi ha spento reminders_enabled, come prima.
-- - reminder_email_log: una riga per bolletta e persona, scritta prima dell'invio, così ognuno
--   riceve una sola email per bolletta anche se il cron parte due volte (Vercel e Supabase Cron)
--   o se la bolletta resta più giorni nella finestra. La usa solo il server (service_role).
begin;

alter table public.profiles add column if not exists reminder_emails boolean not null default true;
comment on column public.profiles.reminder_emails is
 'Promemoria delle bollette anche via email (oltre che nell''app e con le notifiche push).';
-- Come reminders_enabled: ognuno cambia solo la propria riga (regola profiles_update_self).
grant update (reminder_emails) on public.profiles to authenticated;

create table if not exists public.reminder_email_log (
 bill_id uuid not null references public.bills(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 reminder_date date not null,
 sent_at timestamptz,
 error text,
 primary key (bill_id, user_id)
);
create index if not exists idx_reminder_email_log_user_id on public.reminder_email_log(user_id);
comment on table public.reminder_email_log is
 'Email dei promemoria già inviate: una per bolletta e persona. Solo per il server.';

alter table public.reminder_email_log enable row level security;
revoke all on public.reminder_email_log from public, anon, authenticated;
grant select, insert, update, delete on public.reminder_email_log to service_role;

commit;
