-- Casa in Ordine: gli inviti all'indirizzo di chi cancella l'account si cancellano con l'account
-- (23 novembre 2026). Da eseguire una volta nel SQL Editor di Supabase, DOPO
-- migrate_v53_push_rinviate.sql. Rieseguibile.
--
-- Prima: dopo la cancellazione dell'account, l'indirizzo email restava nella tabella degli
-- inviti delle case di altri (l'invito con cui la persona era entrata, ormai usato, e quelli
-- ancora aperti al suo indirizzo). L'app non li mostra, ma era un dato personale conservato
-- senza motivo (GDPR art. 17). Trovato dalla prova supabase/tests/eliminazione_account_test.sql.
-- Ora un trigger su auth.users li cancella insieme all'account, a prescindere da maiuscole e
-- minuscole; gli inviti per altre persone restano. Il lavoro giornaliero (lib/daily-jobs.mjs)
-- cancella poi gli inviti già usati o scaduti, che l'app non mostra più.
begin;

create schema if not exists private;

create or replace function private.v54_forget_invites() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
 if coalesce(old.email, '') <> '' then
  delete from public.home_invites where lower(email) = lower(old.email);
 end if;
 return old;
end $$;
revoke all on function private.v54_forget_invites() from public, anon, authenticated;

drop trigger if exists v54_forget_invites on auth.users;
create trigger v54_forget_invites before delete on auth.users
 for each row execute function private.v54_forget_invites();

commit;
