-- Casa in Ordine: schede SOS cifrate con una frase della casa.
-- Da eseguire una volta nel SQL Editor di Supabase, DOPO migrate_v39_lista_spesa.sql. Rieseguibile.
--
-- Le schede SOS (dove sono rubinetti e interruttori, istruzioni, contatti) erano salvate in chiaro:
-- le leggevano i membri della casa e, tecnicamente, chi gestisce il server. Ora chi gestisce la
-- casa (proprietario o editor) può scegliere una frase: le schede vengono cifrate nel browser
-- (AES-GCM, chiave PBKDF2 dalla frase) e nel database resta solo testo illeggibile. Il server non
-- vede mai la frase. Ogni membro la inserisce per aprire le schede; se si perde, le schede
-- protette si possono solo cancellare.
--
-- home_sos_keys conserva per ogni casa (o per lo spazio personale) il sale della chiave e un
-- "controllo": una frase fissa cifrata, che serve al browser per riconoscere la frase giusta.
begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------
-- 1. Frase della casa: sale e controllo (mai la frase)
-- ---------------------------------------------------------------------------------------
create table if not exists public.home_sos_keys (
 id uuid primary key default gen_random_uuid(),
 home_id uuid references public.homes(id) on delete cascade,
 user_id uuid references auth.users(id) on delete cascade,
 salt text not null check (salt ~ '^[A-Za-z0-9+/]{22}==$'),
 verifier jsonb not null check (
  jsonb_typeof(verifier)='object' and verifier->>'v'='1'
  and coalesce(verifier->>'iv','') ~ '^[A-Za-z0-9+/]{16}$'
  and coalesce(verifier->>'data','') ~ '^[A-Za-z0-9+/=]+$' and length(verifier->>'data') between 20 and 200),
 updated_by uuid references auth.users(id) on delete set null,
 updated_at timestamptz not null default now(),
 -- Una casa condivisa (home_id) oppure lo spazio personale di un utente (user_id), mai entrambi.
 constraint home_sos_keys_scope check ((home_id is null) <> (user_id is null))
);
create unique index if not exists home_sos_keys_home on public.home_sos_keys(home_id) where home_id is not null;
create unique index if not exists home_sos_keys_user on public.home_sos_keys(user_id) where user_id is not null;
create index if not exists idx_v40_home_sos_keys_updated_by on public.home_sos_keys(updated_by);

alter table public.home_sos_keys enable row level security;
drop policy if exists v40_sos_keys_read on public.home_sos_keys;
create policy v40_sos_keys_read on public.home_sos_keys for select to authenticated
 using ((home_id is not null and public.is_home_member(home_id)) or (home_id is null and user_id=(select auth.uid())));
drop policy if exists v40_sos_keys_insert on public.home_sos_keys;
create policy v40_sos_keys_insert on public.home_sos_keys for insert to authenticated
 with check ((home_id is not null and public.can_edit_home(home_id)) or (home_id is null and user_id=(select auth.uid())));
drop policy if exists v40_sos_keys_update on public.home_sos_keys;
create policy v40_sos_keys_update on public.home_sos_keys for update to authenticated
 using ((home_id is not null and public.can_edit_home(home_id)) or (home_id is null and user_id=(select auth.uid())))
 with check ((home_id is not null and public.can_edit_home(home_id)) or (home_id is null and user_id=(select auth.uid())));
drop policy if exists v40_sos_keys_delete on public.home_sos_keys;
create policy v40_sos_keys_delete on public.home_sos_keys for delete to authenticated
 using ((home_id is not null and public.can_edit_home(home_id)) or (home_id is null and user_id=(select auth.uid())));
revoke all on public.home_sos_keys from anon, authenticated;
grant select on public.home_sos_keys to authenticated;
grant insert (home_id, user_id, salt, verifier) on public.home_sos_keys to authenticated;
grant update (salt, verifier) on public.home_sos_keys to authenticated;
grant delete on public.home_sos_keys to authenticated;

-- Chi ha cambiato la frase e quando: li scrive il database, non il browser.
create or replace function private.v40_sos_key_stamp() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 new.updated_by:=auth.uid(); new.updated_at:=now();
 if tg_op='UPDATE' and (new.home_id is distinct from old.home_id or new.user_id is distinct from old.user_id) then
  raise exception 'La frase SOS non si sposta in un''altra casa' using errcode='check_violation';
 end if;
 return new;
end $$;
revoke all on function private.v40_sos_key_stamp() from public, anon, authenticated;
drop trigger if exists v40_sos_key_stamp on public.home_sos_keys;
create trigger v40_sos_key_stamp before insert or update on public.home_sos_keys
 for each row execute function private.v40_sos_key_stamp();

-- ---------------------------------------------------------------------------------------
-- 2. Schede cifrate
-- ---------------------------------------------------------------------------------------
alter table public.home_emergency_cards add column if not exists sealed jsonb;
-- Una scheda cifrata non ha campi in chiaro: il titolo vuoto è ammesso solo se è cifrata.
alter table public.home_emergency_cards drop constraint if exists home_emergency_cards_title_check;
alter table public.home_emergency_cards drop constraint if exists v40_sos_title;
alter table public.home_emergency_cards add constraint v40_sos_title
 check (sealed is not null or char_length(btrim(title)) between 2 and 120);
alter table public.home_emergency_cards drop constraint if exists v40_sos_sealed;
alter table public.home_emergency_cards add constraint v40_sos_sealed check (
 sealed is null or (
  jsonb_typeof(sealed)='object' and sealed->>'v'='1'
  and coalesce(sealed->>'iv','') ~ '^[A-Za-z0-9+/]{16}$'
  -- Le espressioni regolari di PostgreSQL non contano oltre 255: la lunghezza si controlla a parte.
  and coalesce(sealed->>'data','') ~ '^[A-Za-z0-9+/=]+$' and length(sealed->>'data') between 20 and 12000
  and title='' and location_hint='' and instructions='' and contact_label='' and contact_phone=''));

-- Ambito di una scheda: la casa condivisa oppure lo spazio personale del suo autore. Le scritture
-- sullo stesso ambito si mettono in fila (pg_advisory_xact_lock) per non perdere schede mentre
-- qualcuno cambia la frase. La chiave del blocco è la stessa nel controllo e nelle due funzioni.
drop function if exists private.v40_sos_scope_lock(uuid,uuid);

-- In una casa protetta si salvano solo schede cifrate; senza frase, solo schede in chiaro.
create or replace function private.v40_sos_sealed_guard() returns trigger
language plpgsql security definer set search_path='' as $$
declare protected boolean;
begin
 perform pg_advisory_xact_lock(hashtextextended('casa-sos:'||coalesce(new.home_id::text,'personale:'||new.user_id::text),0));
 select exists(select 1 from public.home_sos_keys k
  where (new.home_id is not null and k.home_id=new.home_id)
     or (new.home_id is null and k.home_id is null and k.user_id=new.user_id)) into protected;
 if protected and new.sealed is null then
  raise exception 'Le schede SOS di questa casa sono protette da una frase: aggiorna l''app' using errcode='check_violation';
 end if;
 if not protected and new.sealed is not null then
  raise exception 'Per questa casa non è stata scelta una frase SOS' using errcode='check_violation';
 end if;
 return new;
end $$;
revoke all on function private.v40_sos_sealed_guard() from public, anon, authenticated;
drop trigger if exists v40_sos_sealed_guard on public.home_emergency_cards;
create trigger v40_sos_sealed_guard before insert or update on public.home_emergency_cards
 for each row execute function private.v40_sos_sealed_guard();

-- ---------------------------------------------------------------------------------------
-- 3. Scegliere o cambiare la frase, in un solo passaggio
-- Il browser manda il nuovo sale, il nuovo controllo e TUTTE le schede dell'ambito già cifrate
-- con la nuova chiave. Se nel frattempo qualcuno ha aggiunto o tolto una scheda, non cambia
-- niente: altrimenti resterebbero schede cifrate con la frase vecchia, illeggibili.
-- Security invoker: valgono le regole di accesso di chi la chiama.
-- ---------------------------------------------------------------------------------------
create or replace function public.v40_set_sos_key(scope_home uuid, new_salt text, new_verifier jsonb, cards jsonb)
returns integer language plpgsql security invoker set search_path='' as $$
declare uid uuid:=auth.uid(); in_scope integer; card jsonb; changed integer:=0;
begin
 if uid is null then raise exception 'Accesso richiesto' using errcode='42501'; end if;
 if scope_home is not null and not public.can_edit_home(scope_home) then
  raise exception 'Solo chi gestisce la casa può scegliere la frase SOS' using errcode='42501';
 end if;
 if cards is null or jsonb_typeof(cards)<>'array' or jsonb_array_length(cards)>500 then
  raise exception 'Elenco delle schede non valido' using errcode='22023';
 end if;
 perform pg_advisory_xact_lock(hashtextextended('casa-sos:'||coalesce(scope_home::text,'personale:'||uid::text),0));
 if scope_home is null then
  update public.home_sos_keys set salt=new_salt, verifier=new_verifier where home_id is null and user_id=uid;
  if not found then insert into public.home_sos_keys(user_id, salt, verifier) values (uid, new_salt, new_verifier); end if;
 else
  update public.home_sos_keys set salt=new_salt, verifier=new_verifier where home_id=scope_home;
  if not found then insert into public.home_sos_keys(home_id, salt, verifier) values (scope_home, new_salt, new_verifier); end if;
 end if;
 select count(*) into in_scope from public.home_emergency_cards e
  where (scope_home is null and e.home_id is null and e.user_id=uid) or (scope_home is not null and e.home_id=scope_home);
 if in_scope<>jsonb_array_length(cards) then
  raise exception 'sos_cards_changed' using errcode='40001', hint='Le schede sono cambiate nel frattempo: riprova.';
 end if;
 for card in select value from jsonb_array_elements(cards) loop
  update public.home_emergency_cards e
     set sealed=card->'sealed', title='', location_hint='', instructions='', contact_label='', contact_phone=''
   where e.id=(card->>'id')::uuid
     and ((scope_home is null and e.home_id is null and e.user_id=uid) or (scope_home is not null and e.home_id=scope_home));
  if not found then raise exception 'sos_cards_changed' using errcode='40001'; end if;
  changed:=changed+1;
 end loop;
 return changed;
end $$;
revoke all on function public.v40_set_sos_key(uuid,text,jsonb,jsonb) from public, anon;
grant execute on function public.v40_set_sos_key(uuid,text,jsonb,jsonb) to authenticated;

-- Frase dimenticata: si cancellano le schede protette e la frase, poi si può ricominciare.
create or replace function public.v40_reset_sos(scope_home uuid)
returns integer language plpgsql security invoker set search_path='' as $$
declare uid uuid:=auth.uid(); removed integer;
begin
 if uid is null then raise exception 'Accesso richiesto' using errcode='42501'; end if;
 if scope_home is not null and not public.can_edit_home(scope_home) then
  raise exception 'Solo chi gestisce la casa può cancellare le schede protette' using errcode='42501';
 end if;
 perform pg_advisory_xact_lock(hashtextextended('casa-sos:'||coalesce(scope_home::text,'personale:'||uid::text),0));
 delete from public.home_emergency_cards e where e.sealed is not null
  and ((scope_home is null and e.home_id is null and e.user_id=uid) or (scope_home is not null and e.home_id=scope_home));
 get diagnostics removed = row_count;
 delete from public.home_sos_keys k
  where (scope_home is null and k.home_id is null and k.user_id=uid) or (scope_home is not null and k.home_id=scope_home);
 return removed;
end $$;
revoke all on function public.v40_reset_sos(uuid) from public, anon;
grant execute on function public.v40_reset_sos(uuid) to authenticated;

commit;
