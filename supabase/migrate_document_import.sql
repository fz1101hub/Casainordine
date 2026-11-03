-- Eseguire sul database Supabase esistente (solo se creato prima della versione 1.1).
-- Consente l'importazione da PDF, JPG, PNG e WEBP senza memorizzare i documenti.
alter table public.bills drop constraint if exists bills_source_check;
alter table public.bills add constraint bills_source_check
  check (source in ('manual','csv','recurring','webhook','document'));
