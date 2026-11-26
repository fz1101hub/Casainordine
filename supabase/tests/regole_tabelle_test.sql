-- Regole di accesso di tutte le tabelle (scelta dell'utente «Funzioni protette del database»,
-- 24 novembre 2026). Le 21 funzioni privilegiate sono già provate una per una in
-- sicurezza_funzioni_test.sql; qui si controlla che NESSUNA tabella, anche una aggiunta in futuro,
-- resti senza protezioni:
--  - regole di accesso attive su ogni tabella di public, nessuna regola «true», nessun permesso
--    agli utenti senza accesso (anon);
--  - le regole di scrittura controllano chi scrive (auth.uid o appartenenza alla casa);
--  - le tabelle con home_id modificabile hanno un trigger BEFORE UPDATE che impedisce di spostare
--    le righe tra case e spazi personali;
--  - i file dei documenti: nessuno può collegare a un suo documento il percorso di un file di un
--    altro (prima di questi controlli il file sarebbe diventato leggibile ai membri della sua casa).
\set ON_ERROR_STOP 0
\pset pager off
create temp table results(test text, ok boolean);
grant all on results to authenticated;
create or replace function pg_temp.refused(label text, stmt text) returns void language plpgsql as $$
begin execute stmt; insert into results values (label, false);
exception when others then insert into results values (label, true); end $$;
create or replace function pg_temp.works(label text, stmt text) returns void language plpgsql as $$
begin execute stmt; insert into results values (label, true);
exception when others then insert into results values (label || ' — ' || sqlerrm, false); end $$;

-- ---------------------------------------------------------------------------------------
-- 1. Catalogo: ogni tabella
-- ---------------------------------------------------------------------------------------
insert into results
select 'regole di accesso attive su public.' || c.relname, c.relrowsecurity
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r';

insert into results
select 'nessuna regola «true»: ' || tablename || '.' || policyname, false
from pg_policies
where schemaname = 'public' and (coalesce(qual, '') ~ '^\(?true\)?$' or coalesce(with_check, '') ~ '^\(?true\)?$');

insert into results
select 'la scrittura controlla chi scrive: ' || tablename || '.' || policyname, false
from pg_policies
where schemaname = 'public' and cmd in ('INSERT', 'UPDATE', 'ALL')
  and coalesce(with_check, qual, '') !~ '(auth\.uid|can_edit|is_home_member|is_home_owner|v19_can|v44_|private\.)';

insert into results
select 'nessun permesso senza accesso (anon) su public.' || table_name, false
from information_schema.role_table_grants
where grantee = 'anon' and table_schema = 'public'
group by table_name;

-- Tabelle con home_id che un utente può modificare: serve un trigger BEFORE UPDATE (le guardie
-- «scope» e «guard» rifiutano lo spostamento tra spazi).
insert into results
select 'guardia contro lo spostamento tra case: public.' || c.relname,
       exists (select 1 from pg_trigger g where g.tgrelid = c.oid and not g.tgisinternal
               and (g.tgtype & 2) = 2 and (g.tgtype & 16) = 16)
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
  -- Con il numero di colonna (attnum) has_column_privilege non dà errore se il piano lo valuta
  -- prima degli altri filtri (succedeva a volte con le tabelle pg_toast, senza home_id).
  and exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'home_id' and a.attnum > 0 and not a.attisdropped
              and has_column_privilege('authenticated', a.attrelid, a.attnum, 'UPDATE'))
  and exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname and p.cmd in ('UPDATE', 'ALL'));

-- ---------------------------------------------------------------------------------------
-- 2. Percorsi dei file dei documenti
-- ---------------------------------------------------------------------------------------
insert into auth.users(id, email, email_confirmed_at) values
 ('00000000-0000-0000-0000-0000000000a1', 'vittima@x.it', now()),
 ('00000000-0000-0000-0000-0000000000b2', 'altro@x.it', now());
create or replace function pg_temp.as_user(u text) returns void language sql as $$
 select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, false) $$;

-- Il file personale della vittima (senza riga di documento, per esempio dopo un errore di
-- caricamento) e un suo documento personale con la riga.
insert into storage.buckets(id, name, public) values ('house-documents', 'house-documents', false) on conflict do nothing;
insert into storage.objects(bucket_id, name, owner) values
 ('house-documents', '00000000-0000-0000-0000-0000000000a1/orfano.pdf', '00000000-0000-0000-0000-0000000000a1'),
 ('house-documents', '00000000-0000-0000-0000-0000000000a1/contratto.pdf', '00000000-0000-0000-0000-0000000000a1');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
insert into public.home_documents(user_id, name, doc_type, mime_type, storage_path, file_size)
values ('00000000-0000-0000-0000-0000000000a1', 'Contratto', 'contratto', 'application/pdf', '00000000-0000-0000-0000-0000000000a1/contratto.pdf', 10);

set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
create temp table ids(k text primary key, v text);
insert into ids select 'casa', public.create_home('Casa di Bruno')::text;
select pg_temp.works('un documento della propria casa con il proprio file',
 $$insert into public.home_documents(user_id, home_id, name, doc_type, mime_type, storage_path, file_size)
   values ('00000000-0000-0000-0000-0000000000b2', (select v from ids where k='casa')::uuid, 'Mio', 'altro', 'application/pdf', '00000000-0000-0000-0000-0000000000b2/mio.pdf', 10)$$);
select pg_temp.refused('nessun documento con il file personale di un altro',
 $$insert into public.home_documents(user_id, home_id, name, doc_type, mime_type, storage_path, file_size)
   values ('00000000-0000-0000-0000-0000000000b2', (select v from ids where k='casa')::uuid, 'Furto', 'altro', 'application/pdf', '00000000-0000-0000-0000-0000000000a1/orfano.pdf', 10)$$);
select pg_temp.refused('nemmeno indicando l''altro come autore originale',
 $$insert into public.home_documents(user_id, former_user_id, home_id, name, doc_type, mime_type, storage_path, file_size)
   values ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000a1', (select v from ids where k='casa')::uuid, 'Furto', 'altro', 'application/pdf', '00000000-0000-0000-0000-0000000000a1/orfano.pdf', 10)$$);
select pg_temp.refused('il file di un proprio documento non si sostituisce con quello di un altro',
 $$update public.home_documents set storage_path = '00000000-0000-0000-0000-0000000000a1/orfano.pdf' where name = 'Mio'$$);
select pg_temp.refused('il proprio documento non si attribuisce a un altro',
 $$update public.home_documents set user_id = '00000000-0000-0000-0000-0000000000a1' where name = 'Mio'$$);
insert into results select 'i file personali di un altro restano invisibili',
 count(*) = 0 from storage.objects where name like '00000000-0000-0000-0000-0000000000a1/%';
select pg_temp.refused('nessun caricamento nella cartella di un altro',
 $$insert into storage.objects(bucket_id, name, owner) values ('house-documents', '00000000-0000-0000-0000-0000000000a1/finto.pdf', '00000000-0000-0000-0000-0000000000b2')$$);
delete from storage.objects where name like '00000000-0000-0000-0000-0000000000a1/%';
reset role;
insert into results select 'i file della vittima non si cancellano da fuori', count(*) = 2 from storage.objects where name like '00000000-0000-0000-0000-0000000000a1/%';
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
insert into results select 'la vittima vede ancora il suo contratto',
 count(*) = 1 from storage.objects where name = '00000000-0000-0000-0000-0000000000a1/contratto.pdf';
reset role;

select test, case when ok then 'ok' else 'NO' end from results order by ok, test;
select count(*) filter (where not ok) as falliti, count(*) as prove from results;
