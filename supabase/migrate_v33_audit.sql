-- Casa in Ordine v3.3: correzioni dell'audit di novembre 2026.
--
-- Da eseguire UNA volta nel SQL Editor di Supabase, dopo tutte le migrazioni precedenti
-- (schema.sql, v1.9, v2.0, v2.1, v3.0, v3.2 e harden_trigger_permissions.sql).
-- Lo script è rieseguibile: usa "create or replace", "drop ... if exists" e "if not exists".
-- Tutto avviene in una sola transazione: se un passo fallisce non cambia nulla.
--
-- Cosa corregge:
--  1. Nessuna bolletta, utenza, documento, lettura ecc. si poteva salvare: i trigger v19/v20
--     leggevano colonne inesistenti (record "new" has no field "bill_id").
--  2. Il cron e l'ingest (chiave di servizio) venivano bloccati con "Autore non autorizzato":
--     il trigger leggeva una variabile di PostgREST che non esiste più.
--  3. GRAVE: chiunque poteva leggere e cancellare i file di tutti gli utenti nel bucket
--     house-documents (la policy confrontava d.storage_path con d.name invece che con il file).
--     Ora un file di una casa condivisa è accessibile solo ai membri attuali di quella casa.
--  4. Il percorso del file di un documento non è più modificabile dopo il caricamento.
--  5. Non si potevano cancellare account e case (il registro attività scriveva durante la
--     cancellazione a cascata). Ora il registro salta le righe di account/case in cancellazione.
--  6. Il link vacanza non si creava (funzioni pgcrypto non trovate).
--  7. Un editor poteva inserire una ricevuta già "confermata" a nome di un altro membro.
--  8. Un editor poteva cancellare un avviso di frode (bill_security_reviews).
--  9. Letture contatore private duplicate (vincolo unique con home_id NULL).
-- 10. Indici mancanti sulle chiavi esterne usate dalle regole di accesso.
-- 11. Nuova colonna mail_connections.last_attempt_at per la rotazione equa del cron email.

begin;

-- ---------------------------------------------------------------------------------------
-- 1, 2, 4, 7. Trigger di controllo dei riferimenti (v1.9)
-- In PL/pgSQL "if tabella='x' and new.colonna ..." valuta new.colonna anche su tabelle che
-- non hanno quella colonna, quindi si leggono i campi da to_jsonb(new).
-- ---------------------------------------------------------------------------------------
create or replace function public.v19_reference_guard() returns trigger
language plpgsql security definer set search_path='' as $$
declare
 ref_user uuid; ref_home uuid;
 internal boolean := coalesce(current_setting('app.confirming_receipt',true),'')='yes';
 service boolean := coalesce((select auth.role()),'')='service_role';
 j jsonb := to_jsonb(new);
 o jsonb := case when tg_op='UPDATE' then to_jsonb(old) end;
begin
 -- Cancellazione di un account: la chiave esterna confirmed_by viene azzerata in automatico.
 if tg_table_name='payment_receipts' and tg_op='UPDATE'
    and o->>'confirmed_by' is not null and j->>'confirmed_by' is null
    and (j - 'confirmed_by') = (o - 'confirmed_by')
    and not exists(select 1 from auth.users u where u.id=(o->>'confirmed_by')::uuid) then
  return new;
 end if;
 if tg_op='UPDATE' and (new.home_id is distinct from old.home_id or new.user_id is distinct from old.user_id) then raise exception 'Impossibile spostare record tra spazi'; end if;
 if tg_op='INSERT' and new.user_id is distinct from (select auth.uid()) and not service then raise exception 'Autore non autorizzato'; end if;
 if tg_table_name='home_documents' and tg_op='UPDATE' and j->>'storage_path' is distinct from o->>'storage_path' then raise exception 'Il file di un documento non si può sostituire'; end if;
 if tg_table_name in ('home_documents','meter_readings','maintenance_assets','home_contracts','bills','utilities','meter_reminders') and j->>'property_id' is not null then
  select user_id,home_id into ref_user,ref_home from public.home_properties where id=(j->>'property_id')::uuid;
  if not found or ref_home is distinct from new.home_id or (ref_home is null and ref_user is distinct from new.user_id) then raise exception 'Immobile non appartenente allo spazio'; end if;
 end if;
 if tg_table_name='home_documents' and j->>'bill_id' is not null then
  select user_id,home_id into ref_user,ref_home from public.bills where id=(j->>'bill_id')::uuid;
  if not found or ref_home is distinct from new.home_id or (ref_home is null and ref_user is distinct from new.user_id) then raise exception 'Bolletta non appartenente allo spazio'; end if;
 end if;
 if tg_table_name in ('payment_receipts','maintenance_events','home_contracts') and j->>'document_id' is not null then
  select user_id,home_id into ref_user,ref_home from public.home_documents where id=(j->>'document_id')::uuid;
  if not found or ref_home is distinct from new.home_id or (ref_home is null and ref_user is distinct from new.user_id) then raise exception 'Documento non appartenente allo spazio'; end if;
 end if;
 if tg_table_name='payment_receipts' then
  select user_id,home_id into ref_user,ref_home from public.bills where id=(j->>'bill_id')::uuid;
  if not found or ref_home is distinct from new.home_id or (ref_home is null and ref_user is distinct from new.user_id) then raise exception 'Bolletta non appartenente allo spazio'; end if;
  if j->>'status'='confirmed' and (tg_op='INSERT' or o->>'status' is distinct from j->>'status') and not internal then raise exception 'Usa conferma protetta'; end if;
  if tg_op='INSERT' and (j->>'confirmed_at' is not null or j->>'confirmed_by' is not null) and not internal then raise exception 'Usa conferma protetta'; end if;
  if tg_op='UPDATE' and (j->>'confirmed_at' is distinct from o->>'confirmed_at' or j->>'confirmed_by' is distinct from o->>'confirmed_by') and not internal then raise exception 'Conferma non modificabile'; end if;
  if tg_op='UPDATE' and o->>'status'='confirmed' then raise exception 'Ricevuta già confermata, non modificabile'; end if;
 end if;
 if tg_table_name='maintenance_events' then
  select user_id,home_id into ref_user,ref_home from public.maintenance_assets where id=(j->>'asset_id')::uuid;
  if not found or ref_home is distinct from new.home_id or (ref_home is null and ref_user is distinct from new.user_id) then raise exception 'Manutenzione non appartenente allo spazio'; end if;
 end if;
 return new;
end $$;
revoke all on function public.v19_reference_guard() from public, anon, authenticated;

-- Stesso difetto nel trigger v2.0 (obiettivi di risparmio e piani di trasloco non salvabili).
create or replace function public.v20_reference_guard() returns trigger
language plpgsql security definer set search_path='' as $$
declare ref_user uuid; ref_home uuid; j jsonb := to_jsonb(new);
begin
 if tg_op='UPDATE' and (new.user_id is distinct from old.user_id or new.home_id is distinct from old.home_id) then
   raise exception 'Impossibile cambiare proprietario o casa';
 end if;
 if tg_table_name='home_move_steps' then
   select user_id,home_id into ref_user,ref_home from public.home_move_plans where id=(j->>'plan_id')::uuid;
 elsif tg_table_name='pagopa_notices' and j->>'bill_id' is not null then
   select user_id,home_id into ref_user,ref_home from public.bills where id=(j->>'bill_id')::uuid;
 elsif tg_table_name='bill_security_reviews' then
   select user_id,home_id into ref_user,ref_home from public.bills where id=(j->>'bill_id')::uuid;
 else return new;
 end if;
 if not found or ref_home is distinct from new.home_id or (ref_home is null and ref_user is distinct from new.user_id) then
   raise exception 'Riferimento esterno allo spazio autorizzato';
 end if;
 return new;
end $$;
revoke all on function public.v20_reference_guard() from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------
-- 5. Registro attività: niente righe nuove per account o case che si stanno cancellando.
-- ---------------------------------------------------------------------------------------
create or replace function public.v20_audit_changes() returns trigger
language plpgsql security definer set search_path='' as $$
declare r jsonb;uid uuid;house uuid;record_uuid uuid; description text;
begin
 r=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
 -- Home expenses/shopping use created_by and have no user_id; keep the initiator as owner metadata.
 uid=coalesce((r->>'user_id')::uuid,(r->>'created_by')::uuid,(select auth.uid()));
 house=(r->>'home_id')::uuid;
 record_uuid=(r->>'id')::uuid;
 description=left(coalesce(r->>'title',r->>'label',r->>'supplier',r->>'name','Elemento'),180);
 if uid is null then return null;end if;
 -- Cancellazione a cascata di un account o di una casa: il registro verrebbe a sua volta
 -- cancellato, e scriverlo farebbe fallire l'intera cancellazione.
 if not exists(select 1 from auth.users u where u.id=uid) then return null;end if;
 if house is not null and not exists(select 1 from public.homes h where h.id=house) then return null;end if;
 insert into public.home_audit_log(user_id,home_id,actor_id,source_table,record_id,action,summary)
 values(uid,house,(select auth.uid()),tg_table_name,record_uuid,tg_op,description);
 if tg_op='DELETE' and tg_table_name in ('house_tasks','home_shopping') then
  insert into public.home_recycle_bin(user_id,home_id,source_table,record_id,snapshot,deleted_by)
  values(uid,house,tg_table_name,record_uuid,r,(select auth.uid()))
  on conflict(source_table,record_id) do update set deleted_at=now(),restored_at=null,snapshot=excluded.snapshot,deleted_by=excluded.deleted_by;
 end if;
 return null;
end $$;
revoke all on function public.v20_audit_changes() from public, anon, authenticated;

-- Chi ha confermato una ricevuta può cancellare il proprio account: il campo si azzera.
do $$ declare c text; begin
 select con.conname into c from pg_constraint con
  join pg_attribute a on a.attrelid=con.conrelid and a.attnum=con.conkey[1]
  where con.conrelid='public.payment_receipts'::regclass and con.contype='f' and a.attname='confirmed_by';
 if c is not null then execute format('alter table public.payment_receipts drop constraint %I',c); end if;
 alter table public.payment_receipts add constraint payment_receipts_confirmed_by_fkey
  foreign key(confirmed_by) references auth.users(id) on delete set null;
end $$;

-- ---------------------------------------------------------------------------------------
-- 3. Accesso ai file del bucket house-documents
-- La ricerca del documento ignora le regole di riga (security definer): così un membro
-- rimosso non può più usare il ramo "cartella mia" per i file che ha caricato in una casa.
-- ---------------------------------------------------------------------------------------
-- La funzione sta nello schema "private", che l'API non espone (come in migrate_v38_rifiniture.sql):
-- così rieseguire questo script non la rende di nuovo chiamabile con /rest/v1/rpc.
create schema if not exists private;
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
-- 6. Link vacanza: su Supabase pgcrypto sta nello schema "extensions".
-- ---------------------------------------------------------------------------------------
create or replace function public.v21_create_vacation_share(plan uuid, text_to_share text, hours_valid int default 72)
 returns text language plpgsql security definer set search_path='' as $$
declare p public.home_vacation_plans%rowtype; token text;
begin
 select * into p from public.home_vacation_plans where id=plan;
 if not found or not public.v19_can_edit(p.user_id,p.home_id) then raise exception 'Accesso negato';end if;
 if length(btrim(coalesce(text_to_share,''))) not between 5 and 1000 or hours_valid not between 1 and 168 then raise exception 'Testo o durata non valida';end if;
 token=encode(extensions.gen_random_bytes(32),'hex');
 insert into public.home_vacation_shares(plan_id,user_id,home_id,token_hash,shared_text,expires_at)
 values(plan,p.user_id,p.home_id,encode(extensions.digest(token,'sha256'),'hex'),btrim(text_to_share),now()+make_interval(hours=>hours_valid));
 return token;
end $$;
revoke all on function public.v21_create_vacation_share(uuid,text,int) from public, anon;
grant execute on function public.v21_create_vacation_share(uuid,text,int) to authenticated;

-- ---------------------------------------------------------------------------------------
-- 8. Un avviso di frode non si cancella dal client (l'app non lo fa mai).
-- ---------------------------------------------------------------------------------------
revoke delete on public.bill_security_reviews from authenticated;

-- ---------------------------------------------------------------------------------------
-- 9. Letture contatore: una sola lettura per contatore e giorno anche nello spazio privato.
-- ---------------------------------------------------------------------------------------
do $$ declare c text; begin
 select con.conname into c from pg_constraint con
  where con.conrelid='public.meter_readings'::regclass and con.contype='u'
    and pg_get_constraintdef(con.oid) ilike '%meter_name%read_on%';
 if c is not null then execute format('alter table public.meter_readings drop constraint %I',c); end if;
 alter table public.meter_readings add constraint meter_readings_unique_per_day
  unique nulls not distinct (user_id,meter_name,read_on,home_id);
end $$;

-- ---------------------------------------------------------------------------------------
-- 11. Cron email: si ruota sull'ultimo tentativo, non sull'ultima sincronizzazione riuscita,
-- così una casella che fallisce sempre non blocca le altre.
-- ---------------------------------------------------------------------------------------
alter table public.mail_connections add column if not exists last_attempt_at timestamptz;
create index if not exists idx_v33_mail_connections_attempt on public.mail_connections(last_attempt_at nulls first);

-- ---------------------------------------------------------------------------------------
-- 10. Indici sulle chiavi esterne (velocizzano regole di accesso e cancellazioni).
-- ---------------------------------------------------------------------------------------
create index if not exists idx_v33_bill_security_reviews_home_id on public.bill_security_reviews(home_id);
create index if not exists idx_v33_bill_security_reviews_user_id on public.bill_security_reviews(user_id);
create index if not exists idx_v33_bills_property_id on public.bills(property_id);
create index if not exists idx_v33_home_audit_log_actor_id on public.home_audit_log(actor_id);
create index if not exists idx_v33_home_contracts_document_id on public.home_contracts(document_id);
create index if not exists idx_v33_home_contracts_home_id on public.home_contracts(home_id);
create index if not exists idx_v33_home_contracts_property_id on public.home_contracts(property_id);
create index if not exists idx_v33_home_contracts_user_id on public.home_contracts(user_id);
create index if not exists idx_v33_home_decision_votes_user_id on public.home_decision_votes(user_id);
create index if not exists idx_v33_home_decisions_home_id on public.home_decisions(home_id);
create index if not exists idx_v33_home_decisions_user_id on public.home_decisions(user_id);
create index if not exists idx_v33_home_documents_bill_id on public.home_documents(bill_id);
create index if not exists idx_v33_home_documents_property_id on public.home_documents(property_id);
create index if not exists idx_v33_home_documents_user_id on public.home_documents(user_id);
create index if not exists idx_v33_home_emergency_cards_home_id on public.home_emergency_cards(home_id);
create index if not exists idx_v33_home_emergency_cards_user_id on public.home_emergency_cards(user_id);
create index if not exists idx_v33_home_expense_shares_user_id on public.home_expense_shares(user_id);
create index if not exists idx_v33_home_expenses_created_by on public.home_expenses(created_by);
create index if not exists idx_v33_home_expenses_paid_by on public.home_expenses(paid_by);
create index if not exists idx_v33_home_inventory_items_asset_id on public.home_inventory_items(asset_id);
create index if not exists idx_v33_home_inventory_items_document_id on public.home_inventory_items(document_id);
create index if not exists idx_v33_home_inventory_items_property_id on public.home_inventory_items(property_id);
create index if not exists idx_v33_home_inventory_items_user_id on public.home_inventory_items(user_id);
create index if not exists idx_v33_home_invites_created_by on public.home_invites(created_by);
create index if not exists idx_v33_home_move_plans_user_id on public.home_move_plans(user_id);
create index if not exists idx_v33_home_move_steps_home_id on public.home_move_steps(home_id);
create index if not exists idx_v33_home_move_steps_plan_id on public.home_move_steps(plan_id);
create index if not exists idx_v33_home_move_steps_user_id on public.home_move_steps(user_id);
create index if not exists idx_v33_home_properties_home_id on public.home_properties(home_id);
create index if not exists idx_v33_home_properties_user_id on public.home_properties(user_id);
create index if not exists idx_v33_home_recycle_bin_deleted_by on public.home_recycle_bin(deleted_by);
create index if not exists idx_v33_home_recycle_bin_home_id on public.home_recycle_bin(home_id);
create index if not exists idx_v33_home_recycle_bin_user_id on public.home_recycle_bin(user_id);
create index if not exists idx_v33_home_refund_expectations_bill_id on public.home_refund_expectations(bill_id);
create index if not exists idx_v33_home_refund_expectations_home_id on public.home_refund_expectations(home_id);
create index if not exists idx_v33_home_refund_expectations_user_id on public.home_refund_expectations(user_id);
create index if not exists idx_v33_home_savings_goals_user_id on public.home_savings_goals(user_id);
create index if not exists idx_v33_home_shopping_created_by on public.home_shopping(created_by);
create index if not exists idx_v33_home_vacation_plans_home_id on public.home_vacation_plans(home_id);
create index if not exists idx_v33_home_vacation_plans_user_id on public.home_vacation_plans(user_id);
create index if not exists idx_v33_home_vacation_shares_home_id on public.home_vacation_shares(home_id);
create index if not exists idx_v33_home_vacation_shares_plan_id on public.home_vacation_shares(plan_id);
create index if not exists idx_v33_home_vacation_shares_user_id on public.home_vacation_shares(user_id);
create index if not exists idx_v33_home_vehicle_deadlines_bill_id on public.home_vehicle_deadlines(bill_id);
create index if not exists idx_v33_home_vehicle_deadlines_utility_id on public.home_vehicle_deadlines(utility_id);
create index if not exists idx_v33_home_vehicle_deadlines_vehicle_id on public.home_vehicle_deadlines(vehicle_id);
create index if not exists idx_v33_home_vehicles_home_id on public.home_vehicles(home_id);
create index if not exists idx_v33_homes_owner_id on public.homes(owner_id);
create index if not exists idx_v33_house_tasks_assigned_to on public.house_tasks(assigned_to);
create index if not exists idx_v33_mail_oauth_states_user_id on public.mail_oauth_states(user_id);
create index if not exists idx_v33_maintenance_assets_home_id on public.maintenance_assets(home_id);
create index if not exists idx_v33_maintenance_assets_property_id on public.maintenance_assets(property_id);
create index if not exists idx_v33_maintenance_assets_user_id on public.maintenance_assets(user_id);
create index if not exists idx_v33_maintenance_events_asset_id on public.maintenance_events(asset_id);
create index if not exists idx_v33_maintenance_events_document_id on public.maintenance_events(document_id);
create index if not exists idx_v33_maintenance_events_home_id on public.maintenance_events(home_id);
create index if not exists idx_v33_maintenance_events_user_id on public.maintenance_events(user_id);
create index if not exists idx_v33_meter_readings_property_id on public.meter_readings(property_id);
create index if not exists idx_v33_meter_reminders_home_id on public.meter_reminders(home_id);
create index if not exists idx_v33_meter_reminders_property_id on public.meter_reminders(property_id);
create index if not exists idx_v33_meter_reminders_user_id on public.meter_reminders(user_id);
create index if not exists idx_v33_pagopa_notices_bill_id on public.pagopa_notices(bill_id);
create index if not exists idx_v33_payment_receipts_confirmed_by on public.payment_receipts(confirmed_by);
create index if not exists idx_v33_payment_receipts_document_id on public.payment_receipts(document_id);
create index if not exists idx_v33_payment_receipts_home_id on public.payment_receipts(home_id);
create index if not exists idx_v33_payment_receipts_user_id on public.payment_receipts(user_id);
create index if not exists idx_v33_push_delivery_log_user_id on public.push_delivery_log(user_id);
create index if not exists idx_v33_utilities_property_id on public.utilities(property_id);

commit;
