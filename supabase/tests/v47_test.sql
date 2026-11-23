-- Prova locale di migrate_v47_progetti.sql.
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
insert into public.home_projects(id,home_id,title,budget) values ('50000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Rifacimento bagno',8000);
insert into public.home_professionals(id,home_id,name,trade) values ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Edil Rossi','builder');
insert into public.home_documents(id,home_id,doc_type,name,mime_type,file_size,storage_path,sha256) values
 ('60000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','foto','prima.jpg','image/jpeg',1000,'00000000-0000-0000-0000-00000000000a/p1.jpg',repeat('a',64)),
 ('60000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','preventivo','prev.pdf','application/pdf',1000,'00000000-0000-0000-0000-00000000000a/q1.pdf',repeat('b',64));
insert into results select 'nuovi tipi di documento', count(*)=2 from public.home_documents;
insert into public.home_project_phases(project_id,title,due_on) values ('50000000-0000-0000-0000-000000000001','Demolizione','2027-01-15'),('50000000-0000-0000-0000-000000000001','Impianti','2027-02-01');
insert into public.home_project_quotes(id,project_id,professional_id,amount,status,document_id) values ('70000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',7200,'accepted','60000000-0000-0000-0000-000000000002');
insert into public.home_project_quotes(project_id,supplier,amount) values ('50000000-0000-0000-0000-000000000001','Bagni Srl',7900);
insert into public.home_project_expenses(project_id,quote_id,description,amount) values ('50000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001','Acconto',2000);
insert into public.home_project_photos(project_id,document_id,kind) values ('50000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001','before');
insert into results select 'voci del progetto', (select count(*) from public.home_project_phases)=2 and (select count(*) from public.home_project_quotes)=2 and (select count(*) from public.home_project_expenses)=1 and (select count(*) from public.home_project_photos)=1;
do $$ begin insert into public.home_project_quotes(project_id,amount) values ('50000000-0000-0000-0000-000000000001',100); insert into results values ('preventivo senza fornitore rifiutato', false);
exception when check_violation then insert into results values ('preventivo senza fornitore rifiutato', true); end $$;
-- C (lettore)
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
insert into results select 'lettore vede tutto', (select count(*) from public.home_project_phases)=2 and (select count(*) from public.home_project_photos)=1;
with u as (update public.home_project_phases set done_at=now() returning 1) insert into results select 'lettore non chiude fasi', count(*)=0 from u;
do $$ begin insert into public.home_project_expenses(project_id,description,amount) values ('50000000-0000-0000-0000-000000000001','Spesa del lettore',5); insert into results values ('lettore non aggiunge spese', false);
exception when others then insert into results values ('lettore non aggiunge spese', true); end $$;
-- B (editor)
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
with u as (update public.home_project_phases set done_at=now() where title='Demolizione' returning 1) insert into results select 'editor chiude una fase', count(*)=1 from u;
with u as (update public.home_projects set status='in_progress' returning 1) insert into results select 'editor cambia stato', count(*)=1 from u;
do $$ begin update public.home_project_phases set project_id=gen_random_uuid(); insert into results values ('fase non cambia progetto', false);
exception when insufficient_privilege then insert into results values ('fase non cambia progetto', true); end $$;
-- D (esterna) con un suo progetto personale
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
insert into results select 'esterna non vede', (select count(*) from public.home_projects)=0 and (select count(*) from public.home_project_quotes)=0;
insert into public.home_projects(id,title) values ('50000000-0000-0000-0000-000000000002','Tinteggiatura');
insert into public.home_documents(id,doc_type,name,mime_type,file_size,storage_path,sha256) values ('60000000-0000-0000-0000-000000000003','foto','mia.jpg','image/jpeg',1000,'00000000-0000-0000-0000-00000000000d/m.jpg',repeat('c',64));
do $$ begin insert into public.home_project_quotes(project_id,professional_id,amount) values ('50000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001',500); insert into results values ('professionista di altro spazio rifiutato', false);
exception when raise_exception then insert into results values ('professionista di altro spazio rifiutato', true); end $$;
do $$ begin insert into public.home_project_photos(project_id,document_id) values ('50000000-0000-0000-0000-000000000002','60000000-0000-0000-0000-000000000001'); insert into results values ('foto di altro spazio rifiutata', false);
exception when raise_exception then insert into results values ('foto di altro spazio rifiutata', true); end $$;
do $$ begin insert into public.home_project_expenses(project_id,quote_id,description,amount) values ('50000000-0000-0000-0000-000000000002','70000000-0000-0000-0000-000000000001','Furbata',1); insert into results values ('preventivo di altro progetto rifiutato', false);
exception when raise_exception then insert into results values ('preventivo di altro progetto rifiutato', true); end $$;
do $$ begin insert into public.home_project_phases(project_id,title) values ('50000000-0000-0000-0000-000000000001','Intrusa'); insert into results values ('esterna non scrive nel progetto della casa', false);
exception when others then insert into results values ('esterna non scrive nel progetto della casa', true); end $$;
insert into public.home_project_photos(project_id,document_id,kind) values ('50000000-0000-0000-0000-000000000002','60000000-0000-0000-0000-000000000003','after');
insert into results select 'foto personale collegata', count(*)=1 from public.home_project_photos;
reset role;
-- B cancella l'account: le sue voci restano senza autore
delete from auth.users where id='00000000-0000-0000-0000-00000000000b';
insert into results select 'fase resta senza autore', (select count(*) from public.home_project_phases where title='Demolizione' and done_at is not null)=1;
-- Eliminato il progetto, le sue voci se ne vanno; la foto resta un documento dell'archivio
delete from public.home_projects where id='50000000-0000-0000-0000-000000000001';
insert into results select 'voci eliminate con il progetto', (select count(*) from public.home_project_phases)=0 and (select count(*) from public.home_project_quotes)=0 and (select count(*) from public.home_project_expenses)=0;
insert into results select 'documenti restano in archivio', (select count(*) from public.home_documents where id in ('60000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000002'))=2;
insert into results select 'anon senza permessi', not has_table_privilege('anon','public.home_projects','select') and not has_table_privilege('anon','public.home_project_photos','select');
select test, case when ok then 'ok' else 'NO' end from results;
select count(*) filter (where not ok) as falliti from results;
