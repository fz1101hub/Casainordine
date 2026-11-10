-- Casa in Ordine: rifiniture dagli avvisi di sicurezza e prestazioni di Supabase.
-- Da eseguire una volta nel SQL Editor di Supabase, DOPO migrate_v33_audit.sql. Rieseguibile.
begin;

-- ---------------------------------------------------------------------------------------
-- 1. v33_shared_document_home fuori dall'API
-- Serve solo alle regole del bucket house-documents. Nello schema public era chiamabile da
-- qualsiasi utente registrato con /rest/v1/rpc/v33_shared_document_home: dato il percorso
-- di un file, restituiva l'id della casa a cui appartiene. Lo schema "private" non è
-- esposto dall'API; le regole continuano a usare la funzione come prima.
-- ---------------------------------------------------------------------------------------
create schema if not exists private;
-- Nessun permesso sullo schema: le regole chiamano la funzione direttamente, quindi agli
-- utenti basta il permesso di esecuzione e non possono nominare lo schema nelle query.
revoke all on schema private from public, anon, authenticated;

drop policy if exists v19_download_allowed on storage.objects;
drop policy if exists v19_delete_allowed on storage.objects;
drop function if exists public.v33_shared_document_home(text);

create or replace function private.v33_shared_document_home(path text) returns uuid
language sql stable security definer set search_path='' as $$
 select d.home_id from public.home_documents d where d.storage_path=path and d.home_id is not null limit 1
$$;
revoke all on function private.v33_shared_document_home(text) from public, anon;
grant execute on function private.v33_shared_document_home(text) to authenticated;

create policy v19_download_allowed on storage.objects for select to authenticated
using(bucket_id='house-documents' and (
  case when private.v33_shared_document_home(objects.name) is not null
       then public.is_home_member(private.v33_shared_document_home(objects.name))
       else (storage.foldername(objects.name))[1]=(select auth.uid())::text
  end
));
create policy v19_delete_allowed on storage.objects for delete to authenticated
using(bucket_id='house-documents' and (
  case when private.v33_shared_document_home(objects.name) is not null
       then public.can_edit_home(private.v33_shared_document_home(objects.name))
       else (storage.foldername(objects.name))[1]=(select auth.uid())::text
  end
));

-- ---------------------------------------------------------------------------------------
-- 2. Indici per le chiavi esterne composte (avviso 0001 di Supabase)
-- Senza indice, cancellare un'utenza, una bolletta o una casella email costringe il
-- database a leggere tutte le righe collegate per aggiornarle.
-- ---------------------------------------------------------------------------------------
create index if not exists idx_v38_bills_utility_user on public.bills(utility_id, user_id);
create index if not exists idx_v38_mail_documents_connection_user on public.mail_documents(connection_id, user_id);
create index if not exists idx_v38_mail_payment_evidence_bill_user on public.mail_payment_evidence(bill_id, user_id);
create index if not exists idx_v38_mail_payment_evidence_connection_user on public.mail_payment_evidence(connection_id, user_id);
create index if not exists idx_v38_reminders_bill_user on public.reminders(bill_id, user_id);

commit;
