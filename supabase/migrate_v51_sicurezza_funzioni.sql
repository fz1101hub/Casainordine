-- Casa in Ordine v51: funzioni di controllo fuori dall'API e email verificata per gli affitti.
-- Da eseguire una volta nel SQL Editor di Supabase, DOPO migrate_v50_email_promemoria.sql.
-- Rieseguibile: la seconda volta non cambia niente.
--
-- 1. Le 11 funzioni che servono solo alle regole di accesso (chi è membro, chi può modificare,
--    chi vede un progetto, un oggetto, un contratto…) passano dallo schema public allo schema
--    private, che l'API non espone. Prima chiunque avesse fatto l'accesso poteva chiamarle con
--    /rest/v1/rpc/<nome>: rispondevano solo sui propri permessi, ma non c'era motivo di
--    lasciarle aperte (avviso 0029 di Supabase). Le regole continuano a usarle senza
--    cambiare, perché puntano alla funzione e non al suo nome. Le funzioni che le chiamano per
--    nome vengono riscritte con il nome nuovo.
--    Restano chiamabili le 20 azioni che l'app usa davvero (creare una casa, invitare,
--    confermare un pagamento, firmare un verbale…): ognuna controlla da sé chi la chiama.
-- 2. Agli utenti serve il permesso di usare lo schema private, perché alcune funzioni
--    ordinarie (saldi della casa, frase SOS) chiamano le funzioni di controllo per nome. Le
--    funzioni dei trigger nello schema restano non eseguibili; lo schema resta fuori dall'API.
-- 3. Affitti: l'invito si vede e si accetta solo con l'indirizzo email verificato, come gli
--    inviti alle case. Prima bastava l'indirizzo nella sessione, che con la conferma email
--    disattivata in Supabase poteva essere quello di un account mai verificato.
--
-- Dopo questa migrazione le migrazioni precedenti non vanno più rieseguite: cercherebbero le
-- funzioni nello schema public e si fermerebbero senza cambiare niente.
begin;

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

-- 1. Spostamento (solo se la funzione è ancora in public).
do $$
declare f text;
begin
 foreach f in array array[
  'can_edit_home(uuid)', 'is_home_member(uuid)', 'is_home_owner(uuid)',
  'v19_can_edit(uuid,uuid)', 'v19_can_read(uuid,uuid)', 'v21_decision_open(uuid)',
  'v44_can_see_professional(uuid)', 'v47_project_access(uuid,boolean)', 'v48_asset_access(uuid,boolean)',
  'v49_is_landlord(uuid)', 'v49_lease_can(uuid,boolean)'
 ] loop
  if to_regprocedure('public.' || f) is not null then
   if to_regprocedure('private.' || f) is not null then
    raise exception 'private.% esiste già e public.% è stata ricreata: va sistemata a mano', f, f;
   end if;
   execute format('alter function public.%s set schema private', f);
  end if;
  execute format('revoke all on function private.%s from public, anon', f);
  execute format('grant execute on function private.%s to authenticated, service_role', f);
 end loop;
end $$;

-- Le funzioni che chiamano quelle spostate con il vecchio nome vengono ricreate uguali, con il
-- nome nuovo. CREATE OR REPLACE tiene proprietario e permessi.
do $$
declare r record; def text;
 pattern constant text := 'public\.(can_edit_home|is_home_member|is_home_owner|v19_can_edit|v19_can_read|v21_decision_open|v44_can_see_professional|v47_project_access|v48_asset_access|v49_is_landlord|v49_lease_can)\(';
begin
 for r in select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private') and p.prokind = 'f' and p.prosrc ~ pattern loop
  def := regexp_replace(pg_get_functiondef(r.oid), pattern, 'private.\1(', 'g');
  execute def;
 end loop;
end $$;

-- 3. Email verificata dell'utente che ha fatto l'accesso (null se non verificata).
create or replace function private.v51_verified_email() returns text
language sql stable security definer set search_path = '' as $$
 select lower(u.email) from auth.users u where u.id = (select auth.uid()) and u.email_confirmed_at is not null
$$;
revoke all on function private.v51_verified_email() from public, anon;
grant execute on function private.v51_verified_email() to authenticated;

drop policy if exists v49_leases_read on public.home_leases;
create policy v49_leases_read on public.home_leases for select to authenticated
 using (private.v19_can_read(user_id, home_id) or tenant_id = (select auth.uid())
  or (tenant_id is null and status = 'invited' and tenant_email = (select private.v51_verified_email())));

create or replace function public.v49_accept_lease(target uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); mail text := private.v51_verified_email();
begin
 if me is null then raise exception 'Accesso richiesto' using errcode = '42501'; end if;
 if mail is null then raise exception 'Accedi con l''indirizzo email invitato e verificato' using errcode = '42501'; end if;
 update public.home_leases set tenant_id = me, status = 'active'
  where id = target and tenant_id is null and status = 'invited' and tenant_email = mail and user_id <> me;
 return found;
end $$;
revoke all on function public.v49_accept_lease(uuid) from public, anon;
grant execute on function public.v49_accept_lease(uuid) to authenticated;

commit;

notify pgrst, 'reload schema';
