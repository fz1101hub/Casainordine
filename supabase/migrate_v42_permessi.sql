-- Casa in Ordine: permessi del database ridotti a quelli che l'app usa davvero.
-- Da eseguire una volta nel SQL Editor di Supabase, DOPO migrate_v41_ex_membri.sql (o dopo la
-- v40, se la v41 non è ancora stata eseguita: le due sono indipendenti). Rieseguibile.
--
-- Supabase dà in automatico a "anon" (chi usa l'API senza accesso) e ad "authenticated" tutti i
-- permessi sulle tabelle dello schema public, anche quelli che l'app non usa mai. Le regole di
-- accesso (RLS) e l'API li fermano già; questa migrazione toglie anche i permessi, come seconda
-- difesa (secondo audit, D1):
--   - anon non ha più nessun permesso su tabelle, sequenze e funzioni di public: l'app non legge
--     e non scrive niente senza accesso (la prova e la pagina condivisa non usano il database
--     dal browser);
--   - authenticated non può più svuotare tabelle (TRUNCATE, che non passa dalle regole RLS),
--     creare chiavi esterne verso di esse (REFERENCES) o trigger (TRIGGER);
--   - lo stesso vale per le tabelle e le funzioni create in futuro (permessi predefiniti).
-- Lettura, inserimento, modifica e cancellazione per chi ha fatto l'accesso restano come prima,
-- sempre filtrati dalle regole RLS.
begin;

-- 1. Chi non ha fatto l'accesso
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
-- Le funzioni sono eseguibili da PUBLIC (cioè da tutti, anon compreso) se nessuno lo ha tolto:
-- prima si dà il permesso esplicito a chi lo aveva già, poi si toglie a PUBLIC e ad anon.
do $$
declare f record;
begin
 for f in
  select p.oid::regprocedure as signature, has_function_privilege('authenticated', p.oid, 'execute') as for_users
  from pg_catalog.pg_proc p
  where p.pronamespace = 'public'::regnamespace and pg_catalog.pg_get_userbyid(p.proowner) = current_user
    and has_function_privilege('anon', p.oid, 'execute')
 loop
  if f.for_users then execute format('grant execute on function %s to authenticated', f.signature); end if;
  execute format('grant execute on function %s to service_role', f.signature);
  execute format('revoke execute on function %s from public, anon', f.signature);
 end loop;
end $$;

-- 2. Chi ha fatto l'accesso: niente svuotamento, chiavi esterne o trigger sulle tabelle
revoke truncate, references, trigger on all tables in schema public from authenticated;
do $$
begin
 -- MAINTAIN (VACUUM, ANALYZE, REINDEX...) esiste da PostgreSQL 17.
 if current_setting('server_version_num')::int >= 170000 then
  execute 'revoke maintain on all tables in schema public from anon, authenticated';
 end if;
end $$;

-- 3. Le stesse regole per gli oggetti creati in futuro dalle migrazioni (ruolo postgres)
alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;
alter default privileges for role postgres in schema public revoke all on functions from anon;
alter default privileges for role postgres in schema public revoke execute on functions from public;
alter default privileges for role postgres in schema public revoke truncate, references, trigger on tables from authenticated;
do $$
begin
 if current_setting('server_version_num')::int >= 170000 then
  execute 'alter default privileges for role postgres in schema public revoke maintain on tables from anon, authenticated';
 end if;
end $$;

commit;
