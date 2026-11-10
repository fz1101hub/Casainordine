-- Casa in Ordine: spazio per i documenti di ogni utente (200 MB nel bucket house-documents).
-- Da eseguire una volta nel SQL Editor di Supabase, dopo migrate_v33_audit.sql. Rieseguibile.
--
-- Il piano gratuito di Supabase ha 1 GB di file in tutto: senza un limite un solo account potrebbe
-- occuparlo. Ogni file resta limitato a 10 MB dal bucket; il controllo conta i file già caricati,
-- quindi si può superare il limite al massimo di un file.
-- Per cambiare il limite: modificare il numero in v36_storage_quota_bytes() e rieseguire.
begin;

create or replace function public.v36_storage_quota_bytes() returns bigint
language sql immutable set search_path = '' as $$ select 200::bigint * 1024 * 1024 $$;

-- Spazio già usato dall'utente collegato (solo il proprio).
create or replace function public.v36_my_storage_used() returns bigint
language sql stable security definer set search_path = '' as $$
  select coalesce(sum((o.metadata->>'size')::bigint), 0)
  from storage.objects o
  where o.bucket_id = 'house-documents'
    and (storage.foldername(o.name))[1] = (select auth.uid())::text
$$;
revoke all on function public.v36_my_storage_used() from public, anon;
grant execute on function public.v36_my_storage_used() to authenticated;
grant execute on function public.v36_storage_quota_bytes() to authenticated;

drop policy if exists v19_upload_own on storage.objects;
create policy v19_upload_own on storage.objects for insert to authenticated
with check (
  bucket_id = 'house-documents'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and public.v36_my_storage_used() < public.v36_storage_quota_bytes()
);

commit;
