-- Casa in Ordine: le autoletture ricorrenti tengono il giorno scelto (23 novembre 2026).
-- Da eseguire una volta nel SQL Editor di Supabase, DOPO migrate_v54_inviti_account.sql. Rieseguibile.
--
-- Prima: il lavoro giornaliero spostava la prossima autolettura prendendo il giorno dalla data
-- precedente. Un promemoria per il 31 di ogni mese diventava 28 febbraio, poi 28 marzo, 28 aprile…
-- e il 31 non tornava più. Trovato dalla prova tests/date-ora-legale.test.mjs.
-- Ora meter_reminders.due_day ricorda il giorno scelto (lo scrive da solo un trigger quando si crea
-- il promemoria); lib/extra-alerts.mjs lo usa, con l'ultimo giorno del mese quando il mese è più corto.
-- Le voci già presenti prendono il giorno della loro prossima data.
begin;

alter table public.meter_reminders add column if not exists due_day smallint check (due_day between 1 and 31);
comment on column public.meter_reminders.due_day is
 'Giorno del mese scelto per l''autolettura; nei mesi più corti vale l''ultimo giorno.';
update public.meter_reminders set due_day = extract(day from next_due_on)::smallint where due_day is null;

create schema if not exists private;
create or replace function private.v55_meter_due_day() returns trigger
language plpgsql set search_path = '' as $$
begin
 if new.due_day is null then new.due_day := extract(day from new.next_due_on)::smallint; end if;
 return new;
end $$;
revoke all on function private.v55_meter_due_day() from public, anon, authenticated;

drop trigger if exists v55_meter_due_day on public.meter_reminders;
create trigger v55_meter_due_day before insert on public.meter_reminders
 for each row execute function private.v55_meter_due_day();

commit;
