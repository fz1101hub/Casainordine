-- Prova locale di migrate_v62_scheda_spese_bilanci.sql.
\set ON_ERROR_STOP 0
\pset pager off
insert into auth.users(id,email) values ('00000000-0000-0000-0000-00000000000a','a@x.it'),('00000000-0000-0000-0000-00000000000c','c@x.it');
create or replace function pg_temp.as_user(u text) returns void language sql as $$
 select set_config('request.jwt.claims', json_build_object('sub',u,'role','authenticated')::text, false)$$;
create temp table results(test text, ok boolean);
grant all on results to authenticated;
create or replace function pg_temp.refused(label text, stmt text) returns void language plpgsql as $$
begin execute stmt; insert into results values (label, false);
exception when others then insert into results values (label, true); end $$;
create or replace function pg_temp.works(label text, stmt text) returns void language plpgsql as $$
begin execute stmt; insert into results values (label, true);
exception when others then insert into results values (label || ' — ' || sqlerrm, false); end $$;
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
-- Scheda d'emergenza e bilanci.
select pg_temp.works('persona con i dati della scheda', $$insert into public.health_people(id,name,relation,birth_on,blood_type,allergies,doctor_name,doctor_phone,emergency_name,emergency_phone,checkup_plan)
 values ('92000000-0000-0000-0000-000000000001','Luca','child','2026-09-20','0+','Penicillina','Dott.ssa Bianchi','+39 02 1234567','Nonna Pia','333 1234567',true)$$);
select pg_temp.works('seconda persona', $$insert into public.health_people(id,name,relation) values ('92000000-0000-0000-0000-000000000002','Anna','self')$$);
select pg_temp.refused('gruppo sanguigno sconosciuto rifiutato', $$update public.health_people set blood_type='C+' where id='92000000-0000-0000-0000-000000000001'$$);
select pg_temp.refused('telefono con lettere rifiutato', $$update public.health_people set doctor_phone='chiamami' where id='92000000-0000-0000-0000-000000000001'$$);
select pg_temp.refused('allergie troppo lunghe rifiutate', $$update public.health_people set allergies=repeat('x',501) where id='92000000-0000-0000-0000-000000000001'$$);
select pg_temp.works('bilanci spenti', $$update public.health_people set checkup_plan=false, conditions='Asma lieve' where id='92000000-0000-0000-0000-000000000001'$$);
-- Spese sanitarie.
select pg_temp.works('visita per la spesa', $$insert into public.health_appointments(id,person_id,kind,title,on_date) values ('92000000-0000-0000-0000-0000000000a1','92000000-0000-0000-0000-000000000001','visit','Pediatra privato','2026-11-20')$$);
select pg_temp.works('spesa in farmacia in contanti', $$insert into public.health_expenses(id,person_id,spent_on,kind,description,amount_cents,payment_method) values ('92000000-0000-0000-0000-0000000000e1','92000000-0000-0000-0000-000000000001','2026-11-21','pharmacy','Sciroppo',850,'cash')$$);
select pg_temp.works('spesa della visita con la carta', $$insert into public.health_expenses(id,person_id,spent_on,kind,description,amount_cents,payment_method,appointment_id) values ('92000000-0000-0000-0000-0000000000e2','92000000-0000-0000-0000-000000000001','2026-11-20','visit','Visita',12000,'traceable','92000000-0000-0000-0000-0000000000a1')$$);
select pg_temp.refused('visita di un''altra persona rifiutata', $$insert into public.health_expenses(person_id,spent_on,description,amount_cents,appointment_id) values ('92000000-0000-0000-0000-000000000002','2026-11-20','Visita',100,'92000000-0000-0000-0000-0000000000a1')$$);
select pg_temp.refused('tipo sconosciuto rifiutato', $$insert into public.health_expenses(person_id,spent_on,kind,description,amount_cents) values ('92000000-0000-0000-0000-000000000001','2026-11-20','magia','Boh',100)$$);
select pg_temp.refused('importo zero rifiutato', $$insert into public.health_expenses(person_id,spent_on,description,amount_cents) values ('92000000-0000-0000-0000-000000000001','2026-11-20','Niente',0)$$);
select pg_temp.works('nel 730 con «anche in contanti»', $$insert into public.home_tax_items(tax_year,category,description,amount_cents,paid_on,payment_method,cash_ok,source,source_id) values (2026,'medical','Luca · Sciroppo',850,'2026-11-21','cash',true,'health_expense','92000000-0000-0000-0000-0000000000e1')$$);
select pg_temp.refused('la stessa spesa due volte nel 730 rifiutata', $$insert into public.home_tax_items(tax_year,category,description,amount_cents,source,source_id) values (2026,'medical','Di nuovo',850,'health_expense','92000000-0000-0000-0000-0000000000e1')$$);
select pg_temp.refused('voce che cita una spesa che non c''è rifiutata', $$insert into public.home_tax_items(tax_year,category,description,amount_cents,source,source_id) values (2026,'medical','Inventata',850,'health_expense','92000000-0000-0000-0000-0000000000ff')$$);
select pg_temp.works('spesa della visita nel 730', $$insert into public.home_tax_items(tax_year,category,description,amount_cents,source,source_id) values (2026,'medical','Luca · Visita',12000,'health_expense','92000000-0000-0000-0000-0000000000e2')$$);
select pg_temp.works('visita cancellata: la spesa resta senza visita', $$delete from public.health_appointments where id='92000000-0000-0000-0000-0000000000a1'$$);
insert into results select 'la spesa ha perso il collegamento alla visita', (select appointment_id is null from public.health_expenses where id='92000000-0000-0000-0000-0000000000e2');
select pg_temp.works('spesa cancellata', $$delete from public.health_expenses where id='92000000-0000-0000-0000-0000000000e1'$$);
insert into results select 'con la spesa va via la sua voce del 730', not exists(select 1 from public.home_tax_items where source_id='92000000-0000-0000-0000-0000000000e1');
-- Un'altra persona.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
insert into results select 'esterna non vede le spese', not exists(select 1 from public.health_expenses);
select pg_temp.refused('esterna non aggiunge spese', $$insert into public.health_expenses(person_id,spent_on,description,amount_cents) values ('92000000-0000-0000-0000-000000000001','2026-11-20','Mia',100)$$);
select pg_temp.refused('esterna non cita la spesa di un altro nel suo 730', $$insert into public.home_tax_items(tax_year,category,description,amount_cents,source,source_id) values (2026,'medical','Rubata',100,'health_expense','92000000-0000-0000-0000-0000000000e2')$$);
with u as (update public.health_people set allergies='' returning 1) insert into results select 'esterna non cambia la scheda', count(*)=0 from u;
-- Persona cancellata: via spese e voci del 730.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.works('persona cancellata', $$delete from public.health_people where id='92000000-0000-0000-0000-000000000001'$$);
insert into results select 'con la persona vanno via le spese e le loro voci del 730', not exists(select 1 from public.health_expenses) and not exists(select 1 from public.home_tax_items where source='health_expense');
reset role;
select test, case when ok then 'ok' else 'NO' end from results;
select count(*) filter (where not ok) as falliti from results;
