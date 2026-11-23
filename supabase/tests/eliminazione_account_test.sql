-- Eliminazione dell'account dall'inizio alla fine (scelta dell'utente, 23 novembre 2026), sul
-- database con tutte le migrazioni: quello che fa admin.deleteUser (cancellazione di auth.users)
-- con i trigger di migrate_v37_account.sql e migrate_v41_ex_membri.sql.
-- A è proprietaria di una casa condivisa con B (modifica) e C (sola lettura); B ha anche una casa
-- tutta sua e il suo spazio personale. Si cancella B e si controlla:
-- - lo spazio personale e la casa di B spariscono;
-- - quello che B ha inserito nella casa di A resta alla casa (passa ad A); chi ha pagato, diviso o
--   aggiunto conserva l'identificativo di B, che l'app mostra come «b (ex membro)»;
-- - i file dei documenti condivisi restano nella cartella di B (former_user_id);
-- - B non è più membro; gli altri sì; i dati di A non cambiano;
-- - l'indirizzo email di B non resta in nessuna tabella (inviti compresi).
\set ON_ERROR_STOP 0
\pset pager off
insert into auth.users(id,email) values
 ('00000000-0000-0000-0000-00000000000a','a@x.it'),('00000000-0000-0000-0000-00000000000b','b@x.it'),
 ('00000000-0000-0000-0000-00000000000c','c@x.it');
insert into public.profiles(id,email) values ('00000000-0000-0000-0000-00000000000a','a@x.it'),
 ('00000000-0000-0000-0000-00000000000b','b@x.it'),('00000000-0000-0000-0000-00000000000c','c@x.it') on conflict do nothing;
insert into public.homes(id,name,owner_id) values
 ('10000000-0000-0000-0000-000000000001','Casa di A','00000000-0000-0000-0000-00000000000a'),
 ('10000000-0000-0000-0000-000000000002','Casa di B','00000000-0000-0000-0000-00000000000b');
insert into public.home_members(home_id,user_id,email,role) values
 ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000a','a@x.it','owner'),
 ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000b','b@x.it','editor'),
 ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000c','c@x.it','viewer'),
 ('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-00000000000b','b@x.it','owner')
 on conflict do nothing;
-- Inviti: quello con cui B è entrata, uno ancora aperto al suo indirizzo (scritto in maiuscolo) e
-- uno per un'altra persona, che deve restare.
insert into public.home_invites(home_id,email,role,token_hash,expires_at,claimed_at,created_by) values
 ('10000000-0000-0000-0000-000000000001','b@x.it','editor',repeat('1',64),now()+interval '7 days',now()-interval '1 day','00000000-0000-0000-0000-00000000000a'),
 ('10000000-0000-0000-0000-000000000001','B@X.it','viewer',repeat('2',64),now()+interval '7 days',null,'00000000-0000-0000-0000-00000000000a'),
 ('10000000-0000-0000-0000-000000000001','d@x.it','viewer',repeat('3',64),now()+interval '7 days',null,'00000000-0000-0000-0000-00000000000a');
create or replace function pg_temp.as_user(u text) returns void language sql as $$
 select set_config('request.jwt.claims', json_build_object('sub',u,'role','authenticated')::text, false)$$;
create temp table results(test text, ok boolean);
grant all on results to authenticated;

-- B: spazio personale, casa sua, voci nella casa di A.
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
insert into public.bills(id,title,supplier,category,amount,due_date) values
 ('20000000-0000-0000-0000-0000000000b1','Telefono di B','Tim','Internet',29,current_date+10);
insert into public.bills(id,home_id,title,supplier,category,amount,due_date) values
 ('20000000-0000-0000-0000-0000000000b2','10000000-0000-0000-0000-000000000001','Luce della casa','Enel','Luce',61.5,current_date+3),
 ('20000000-0000-0000-0000-0000000000b3','10000000-0000-0000-0000-000000000002','Gas della casa di B','Eni','Gas',40,current_date+5);
insert into public.utilities(id,supplier,category,billing_day,next_due_date) values
 ('30000000-0000-0000-0000-0000000000b1','Fastweb','Internet',5,current_date+20);
insert into public.house_tasks(id,title,due_date) values ('40000000-0000-0000-0000-0000000000b1','Rinnovare la carta d''identità',current_date+30);
insert into public.house_tasks(id,home_id,title,due_date,assigned_to) values
 ('40000000-0000-0000-0000-0000000000b2','10000000-0000-0000-0000-000000000001','Pulire i filtri',current_date+7,'00000000-0000-0000-0000-00000000000b');
insert into public.home_documents(id,home_id,doc_type,name,mime_type,file_size,storage_path,sha256) values
 ('60000000-0000-0000-0000-0000000000b1',null,'altro','personale.pdf','application/pdf',1000,'00000000-0000-0000-0000-00000000000b/personale.pdf',repeat('a',64)),
 ('60000000-0000-0000-0000-0000000000b2','10000000-0000-0000-0000-000000000001','contratto','caldaia.pdf','application/pdf',1000,'00000000-0000-0000-0000-00000000000b/caldaia.pdf',repeat('b',64));
insert into public.home_shopping(id,home_id,title,created_by) values
 ('70000000-0000-0000-0000-0000000000b1','10000000-0000-0000-0000-000000000001','Latte','00000000-0000-0000-0000-00000000000b');
-- A: le sue bollette, personale e della casa.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
insert into public.bills(id,title,supplier,category,amount,due_date) values
 ('20000000-0000-0000-0000-0000000000a1','Auto di A','Allianz','Altro',300,current_date+40);
insert into public.bills(id,home_id,title,supplier,category,amount,due_date) values
 ('20000000-0000-0000-0000-0000000000a2','10000000-0000-0000-0000-000000000001','Acqua della casa','Acea','Acqua',30,current_date+12);
reset role;
-- Promemoria e spese divise li scrive il server o una funzione: qui direttamente.
insert into public.reminders(user_id,bill_id,reminder_date) values
 ('00000000-0000-0000-0000-00000000000b','20000000-0000-0000-0000-0000000000b2',current_date);
insert into public.home_expenses(id,home_id,title,category,amount,incurred_on,created_by,paid_by) values
 ('80000000-0000-0000-0000-0000000000b1','10000000-0000-0000-0000-000000000001','Spesa del sabato','Spesa alimentare',50,current_date,'00000000-0000-0000-0000-00000000000b','00000000-0000-0000-0000-00000000000b');
insert into public.home_expense_shares(expense_id,user_id,amount) values
 ('80000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-00000000000a',25),
 ('80000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-00000000000b',25);
insert into results select 'dati di prova inseriti', (select count(*) from public.bills)=5 and (select count(*) from public.home_documents)=2
 and (select count(*) from public.reminders)=1 and (select count(*) from public.home_expense_shares)=2 and (select count(*) from public.home_shopping)=1;
create temp table before_a as select count(*) as n from public.bills where user_id='00000000-0000-0000-0000-00000000000a';

-- Cancellazione dell'account di B, come fa admin.deleteUser.
do $$ begin
 delete from auth.users where id='00000000-0000-0000-0000-00000000000b';
 insert into results values ('cancellazione riuscita', true);
exception when others then insert into results values ('cancellazione riuscita: ' || sqlerrm, false);
end $$;

-- Spazio personale e casa di B: spariti.
insert into results select 'bolletta personale cancellata', not exists(select 1 from public.bills where id='20000000-0000-0000-0000-0000000000b1');
insert into results select 'utenza personale cancellata', not exists(select 1 from public.utilities where id='30000000-0000-0000-0000-0000000000b1');
insert into results select 'attività personale cancellata', not exists(select 1 from public.house_tasks where id='40000000-0000-0000-0000-0000000000b1');
insert into results select 'documento personale cancellato', not exists(select 1 from public.home_documents where id='60000000-0000-0000-0000-0000000000b1');
insert into results select 'casa tutta sua cancellata, con le bollette', not exists(select 1 from public.homes where id='10000000-0000-0000-0000-000000000002')
 and not exists(select 1 from public.bills where id='20000000-0000-0000-0000-0000000000b3');
insert into results select 'profilo e promemoria personali cancellati', not exists(select 1 from public.profiles where id='00000000-0000-0000-0000-00000000000b')
 and not exists(select 1 from public.reminders where user_id='00000000-0000-0000-0000-00000000000b');
-- Quello che B ha inserito nella casa di A: resta alla casa.
insert into results select 'bolletta della casa resta, passata ad A', (select user_id from public.bills where id='20000000-0000-0000-0000-0000000000b2')='00000000-0000-0000-0000-00000000000a';
insert into results select 'attività della casa resta, assegnata all''ex membro', exists(select 1 from public.house_tasks where id='40000000-0000-0000-0000-0000000000b2'
 and user_id='00000000-0000-0000-0000-00000000000a' and assigned_to='00000000-0000-0000-0000-00000000000b');
insert into results select 'documento della casa resta, file nella cartella di B', exists(select 1 from public.home_documents where id='60000000-0000-0000-0000-0000000000b2'
 and user_id='00000000-0000-0000-0000-00000000000a' and former_user_id='00000000-0000-0000-0000-00000000000b' and storage_path like '00000000-0000-0000-0000-00000000000b/%');
-- Chi ha aggiunto, pagato o diviso conserva l'identificativo: l'app lo mostra come «b (ex membro)».
insert into results select 'lista della spesa resta, con l''ex membro come autore', exists(select 1 from public.home_shopping where id='70000000-0000-0000-0000-0000000000b1'
 and created_by='00000000-0000-0000-0000-00000000000b');
insert into results select 'spesa divisa resta, conti invariati', (select sum(amount) from public.home_expense_shares where expense_id='80000000-0000-0000-0000-0000000000b1')=50
 and exists(select 1 from public.home_expenses where id='80000000-0000-0000-0000-0000000000b1' and paid_by='00000000-0000-0000-0000-00000000000b');
-- Membri: B esce, resta il suo nome da mostrare (senza email); A e C restano.
insert into results select 'B non è più membro, A e C sì', (select array_agg(user_id::text order by user_id) from public.home_members where home_id='10000000-0000-0000-0000-000000000001')
 = array['00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-00000000000c'];
insert into results select 'ex membro con il solo nome', exists(select 1 from public.home_former_members where home_id='10000000-0000-0000-0000-000000000001'
 and user_id='00000000-0000-0000-0000-00000000000b' and display_name='b');
-- Dati di A invariati.
insert into results select 'bollette di A invariate', (select count(*) from public.bills where user_id='00000000-0000-0000-0000-00000000000a' and id in
 ('20000000-0000-0000-0000-0000000000a1','20000000-0000-0000-0000-0000000000a2'))=2;
-- Inviti: quelli all'indirizzo di B spariscono (anche in maiuscolo), quello per un'altra persona resta.
insert into results select 'inviti all''indirizzo di B cancellati', not exists(select 1 from public.home_invites where lower(email)='b@x.it');
insert into results select 'invito per un''altra persona intatto', exists(select 1 from public.home_invites where email='d@x.it');
-- L'indirizzo email di B non resta in nessuna colonna di testo del database pubblico.
do $$
declare col record; found bigint; places text := '';
begin
 for col in select c.table_name, c.column_name from information_schema.columns c
  join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name and t.table_type = 'BASE TABLE'
  where c.table_schema = 'public' and c.data_type in ('text','character varying','jsonb','json')
 loop
  execute format('select count(*) from public.%I where %I::text ilike %L', col.table_name, col.column_name, '%b@x.it%') into found;
  if found > 0 then places := places || ' ' || col.table_name || '.' || col.column_name; end if;
 end loop;
 insert into results values ('email di B in nessuna tabella' || places, places = '');
end $$;
select test, case when ok then 'ok' else 'NO' end from results;
select count(*) filter (where not ok) as falliti from results;
