-- Prova locale di migrate_v44_professionisti.sql.
\set ON_ERROR_STOP 0
\pset pager off
insert into auth.users(id,email) values
 ('00000000-0000-0000-0000-00000000000a','a@x.it'),('00000000-0000-0000-0000-00000000000b','b@x.it'),
 ('00000000-0000-0000-0000-00000000000c','c@x.it'),('00000000-0000-0000-0000-00000000000d','d@x.it');
insert into public.homes(id,name,owner_id) values ('10000000-0000-0000-0000-000000000001','Casa prova','00000000-0000-0000-0000-00000000000a');
insert into public.home_members(home_id,user_id,email,role) values
 ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000a','a@x.it','owner'),
 ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000b','b@x.it','editor'),
 ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000c','c@x.it','viewer')
 on conflict do nothing;
create or replace function pg_temp.as_user(u text) returns void language sql as $$
 select set_config('request.jwt.claims', json_build_object('sub',u,'role','authenticated')::text, false)$$;
create temp table results(test text, ok boolean);
grant all on results to authenticated;
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
insert into public.home_professionals(id,home_id,name,trade,phone) values ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Mario Rossi','Idraulico','333 1234567');
insert into public.maintenance_assets(id,home_id,name) values ('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Caldaia');
insert into public.maintenance_events(home_id,asset_id,done_on,cost,description,professional_id) values ('10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','2026-11-01',120,'Revisione annuale','20000000-0000-0000-0000-000000000001');
insert into results select 'intervento collegato', count(*)=1 from public.maintenance_events where professional_id is not null;
insert into public.home_professional_notes(professional_id,note) values ('20000000-0000-0000-0000-000000000001','Puntuale, chiede contanti');
insert into results select 'nota privata salvata', count(*)=1 from public.home_professional_notes;
-- upsert come lo fa PostgREST (riscrive le colonne inviate)
insert into public.home_professional_notes(professional_id,note) values ('20000000-0000-0000-0000-000000000001','Puntuale')
 on conflict (professional_id,user_id) do update set professional_id=excluded.professional_id, note=excluded.note;
insert into results select 'nota aggiornata con upsert', (select note from public.home_professional_notes)='Puntuale';
-- C (sola lettura): vede il professionista, non la nota di A; può tenere una sua nota; non modifica
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
insert into results select 'lettore vede il professionista', count(*)=1 from public.home_professionals;
insert into results select 'nota di A invisibile', count(*)=0 from public.home_professional_notes;
insert into public.home_professional_notes(professional_id,note) values ('20000000-0000-0000-0000-000000000001','Mia nota');
insert into results select 'lettore tiene una sua nota', count(*)=1 from public.home_professional_notes;
with u as (update public.home_professionals set phone='000' returning 1) insert into results select 'lettore non modifica', count(*)=0 from u;
do $$ begin
 insert into public.home_professionals(home_id,name,trade) values ('10000000-0000-0000-0000-000000000001','Abusivo','Fabbro');
 insert into results values ('lettore non crea', false);
exception when others then insert into results values ('lettore non crea', true); end $$;
-- B (editor) modifica; non cambia autore o casa
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
with u as (update public.home_professionals set phone='06 123' returning 1) insert into results select 'editor modifica', count(*)=1 from u;
do $$ begin update public.home_professionals set home_id=null; insert into results values ('casa non si cambia', false);
exception when insufficient_privilege then insert into results values ('casa non si cambia', true); end $$;
insert into results select 'editor non vede note altrui', count(*)=0 from public.home_professional_notes;
-- D (esterna): niente; non può collegare il professionista della casa ai suoi interventi né scriverci note
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
insert into results select 'esterna non vede', count(*)=0 from public.home_professionals;
insert into public.maintenance_assets(id,name) values ('30000000-0000-0000-0000-000000000002','Lavatrice mia');
do $$ begin
 insert into public.maintenance_events(asset_id,done_on,cost,description,professional_id) values ('30000000-0000-0000-0000-000000000002','2026-11-02',50,'Riparazione','20000000-0000-0000-0000-000000000001');
 insert into results values ('professionista di un altro spazio rifiutato', false);
exception when raise_exception then insert into results values ('professionista di un altro spazio rifiutato', true); end $$;
do $$ begin
 insert into public.home_professional_notes(professional_id,note) values ('20000000-0000-0000-0000-000000000001','Spia');
 insert into results values ('esterna non scrive note', false);
exception when others then insert into results values ('esterna non scrive note', true); end $$;
-- Professionista personale di D usato nel suo spazio: ammesso
insert into public.home_professionals(id,name,trade) values ('20000000-0000-0000-0000-000000000002','Luca Bianchi','Tecnico elettrodomestici');
insert into public.maintenance_events(asset_id,done_on,cost,description,professional_id) values ('30000000-0000-0000-0000-000000000002','2026-11-02',50,'Riparazione','20000000-0000-0000-0000-000000000002');
insert into results select 'professionista personale collegato', count(*)=1 from public.maintenance_events where professional_id='20000000-0000-0000-0000-000000000002';
-- Eliminato il professionista, l'intervento resta senza nome
delete from public.home_professionals where id='20000000-0000-0000-0000-000000000002';
insert into results select 'intervento resta dopo eliminazione', count(*)=1 from public.maintenance_events where description='Riparazione' and professional_id is null;
reset role;
-- Cancellazione dell'account di A: il professionista della casa resta (passa alla proprietaria? A è la proprietaria: la casa sparisce con lei)
-- Cancellazione dell'account di C: la sua nota privata sparisce
delete from auth.users where id='00000000-0000-0000-0000-00000000000c';
insert into results select 'nota privata cancellata con l''account', count(*)=1 from public.home_professional_notes;
-- B lascia l'account: il professionista che aveva creato resta nella casa
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
insert into public.home_professionals(id,home_id,name,trade) values ('20000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','Elettro Srl','Elettricista');
reset role;
delete from auth.users where id='00000000-0000-0000-0000-00000000000b';
insert into results select 'professionista resta nella casa', (select user_id from public.home_professionals where id='20000000-0000-0000-0000-000000000003')='00000000-0000-0000-0000-00000000000a';
insert into results select 'anon senza permessi', not has_table_privilege('anon','public.home_professionals','select') and not has_table_privilege('anon','public.home_professional_notes','select');
select test, case when ok then 'ok' else 'NO' end from results;
select count(*) filter (where not ok) as falliti from results;
