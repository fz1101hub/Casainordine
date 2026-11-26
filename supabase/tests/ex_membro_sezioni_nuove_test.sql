-- Revisione del lavoro della notte del 26 novembre 2026: un membro che cancella l'account non deve
-- portarsi via le voci che ha scritto nelle case di altri nelle sezioni nuove (animali, salute,
-- spese detraibili, documenti di famiglia, rate). v41_hand_over_shared_rows le passa al
-- proprietario; qui si controlla che nessuna guardia delle tabelle nuove lo impedisca e che le
-- voci personali del membro se ne vadano con l'account.
\set ON_ERROR_STOP 0
\pset pager off
insert into auth.users(id,email) values
 ('00000000-0000-0000-0000-00000000000a','a@x.it'),('00000000-0000-0000-0000-00000000000b','b@x.it');
insert into public.homes(id,name,owner_id) values ('10000000-0000-0000-0000-000000000001','Casa prova','00000000-0000-0000-0000-00000000000a');
insert into public.home_members(home_id,user_id,email,role) values
 ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000a','a@x.it','owner'),
 ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000b','b@x.it','editor')
 on conflict do nothing;
create or replace function pg_temp.as_user(u text) returns void language sql as $$
 select set_config('request.jwt.claims', json_build_object('sub',u,'role','authenticated')::text, false)$$;
create temp table results(test text, ok boolean);
grant all on results to authenticated;

set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
-- Nella casa di A
insert into public.home_pets(id,home_id,name) values ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Fido');
insert into public.home_pet_tasks(pet_id,title,every_days,next_on) values ('20000000-0000-0000-0000-000000000001','Antiparassitario',30,'2026-12-01');
insert into public.health_people(id,home_id,name,birth_on) values ('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Luca','2023-05-02');
insert into public.health_therapies(person_id,name,times) values ('30000000-0000-0000-0000-000000000001','Sciroppo',array['08:00'::time]);
insert into public.health_appointments(person_id,title,on_date) values ('30000000-0000-0000-0000-000000000001','Pediatra','2026-12-10');
insert into public.health_expenses(id,person_id,spent_on,description,amount_cents) values ('31000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','2026-11-20','Farmacia',1250);
insert into public.home_tax_items(home_id,tax_year,category,description,amount_cents,source,source_id) values
 ('10000000-0000-0000-0000-000000000001',2026,'medical','Farmacia',1250,'health_expense','31000000-0000-0000-0000-000000000001');
insert into public.family_documents(home_id,holder,kind,expires_on) values ('10000000-0000-0000-0000-000000000001','Luca','passport','2027-05-12');
insert into public.payment_plans(id,home_id,title,kind) values ('40000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Retta scuola','school');
insert into public.payment_installments(plan_id,label,due_on,amount_cents) values ('40000000-0000-0000-0000-000000000001','Retta di dicembre','2026-12-10',35000);
-- Nello spazio personale di B
insert into public.health_people(id,name) values ('30000000-0000-0000-0000-000000000002','B personale');
insert into public.family_documents(holder,kind,expires_on) values ('B','identity_card','2030-01-01');
insert into results select 'voci di B scritte', (select count(*) from public.home_pets)=1 and (select count(*) from public.health_people)=2
  and (select count(*) from public.home_tax_items)=1 and (select count(*) from public.family_documents)=2 and (select count(*) from public.payment_installments)=1;
reset role;

delete from auth.users where id='00000000-0000-0000-0000-00000000000b';
insert into results select 'account di B cancellato', not exists(select 1 from auth.users where id='00000000-0000-0000-0000-00000000000b');

-- Nella casa di A restano, a nome del proprietario.
insert into results select 'animale e piano restano alla casa', (select count(*) from public.home_pets where user_id='00000000-0000-0000-0000-00000000000a')=1 and (select count(*) from public.home_pet_tasks)=1;
insert into results select 'persona, terapia, visita e spesa restano', (select count(*) from public.health_people where user_id='00000000-0000-0000-0000-00000000000a' and home_id is not null)=1
  and (select count(*) from public.health_therapies)=1 and (select count(*) from public.health_appointments)=1 and (select count(*) from public.health_expenses)=1;
insert into results select 'voce del 730 collegata resta', (select count(*) from public.home_tax_items where user_id='00000000-0000-0000-0000-00000000000a' and source='health_expense')=1;
insert into results select 'documento della casa resta', (select count(*) from public.family_documents where home_id is not null and user_id='00000000-0000-0000-0000-00000000000a')=1;
insert into results select 'piano e rata restano', (select count(*) from public.payment_plans where user_id='00000000-0000-0000-0000-00000000000a')=1 and (select count(*) from public.payment_installments)=1;
-- Le voci personali di B se ne vanno con l'account.
insert into results select 'voci personali di B cancellate', not exists(select 1 from public.health_people where id='30000000-0000-0000-0000-000000000002')
  and not exists(select 1 from public.family_documents where home_id is null);

-- A le vede e le modifica.
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
insert into results select 'il proprietario le vede', (select count(*) from public.home_pets)=1 and (select count(*) from public.health_expenses)=1 and (select count(*) from public.payment_installments)=1;
with u as (update public.payment_installments set paid_on='2026-12-09', paid_cents=35000 returning 1) insert into results select 'il proprietario segna la rata pagata', count(*)=1 from u;
reset role;

select test, case when ok then 'ok' else 'NO' end from results;
select count(*) filter (where not ok) as falliti from results;
