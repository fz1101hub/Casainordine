-- Prova locale di migrate_v64_rate_scadenze.sql.
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
select pg_temp.works('impegno: retta della scuola', $$insert into public.payment_plans(id,title,kind,payee,person,tax_category) values ('94000000-0000-0000-0000-000000000001','Retta scuola Luca','school','Istituto San Carlo','Luca','education')$$);
select pg_temp.works('impegno: contributi della colf', $$insert into public.payment_plans(id,title,kind,tax_category) values ('94000000-0000-0000-0000-000000000002','Contributi INPS Maria','domestic_worker','domestic_worker')$$);
select pg_temp.refused('tipo sconosciuto rifiutato', $$insert into public.payment_plans(title,kind) values ('Boh','casino')$$);
select pg_temp.refused('categoria del 730 sconosciuta rifiutata', $$insert into public.payment_plans(title,tax_category) values ('Boh','vacanze')$$);
select pg_temp.works('rata di settembre', $$insert into public.payment_installments(id,plan_id,label,due_on,amount_cents) values ('94000000-0000-0000-0000-0000000000a1','94000000-0000-0000-0000-000000000001','Retta di settembre','2026-09-10',35000)$$);
select pg_temp.works('contributi con importo da definire', $$insert into public.payment_installments(plan_id,label,due_on) values ('94000000-0000-0000-0000-000000000002','Contributi 4° trimestre 2026','2027-01-11')$$);
select pg_temp.refused('importo zero rifiutato', $$insert into public.payment_installments(plan_id,label,due_on,amount_cents) values ('94000000-0000-0000-0000-000000000001','Zero','2026-10-10',0)$$);
select pg_temp.works('rata pagata', $$update public.payment_installments set paid_on='2026-09-08', paid_cents=35000 where id='94000000-0000-0000-0000-0000000000a1'$$);
select pg_temp.works('rata pagata nel 730', $$insert into public.home_tax_items(tax_year,category,description,amount_cents,paid_on,payment_method,source,source_id) values (2026,'education','Retta scuola Luca · settembre',35000,'2026-09-08','traceable','installment','94000000-0000-0000-0000-0000000000a1')$$);
select pg_temp.refused('voce del 730 con una rata inventata rifiutata', $$insert into public.home_tax_items(tax_year,category,description,amount_cents,source,source_id) values (2026,'education','Inventata',100,'installment','94000000-0000-0000-0000-0000000000ff')$$);
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
insert into results select 'esterna non vede impegni né rate', not exists(select 1 from public.payment_plans) and not exists(select 1 from public.payment_installments);
select pg_temp.refused('esterna non aggiunge rate', $$insert into public.payment_installments(plan_id,label,due_on) values ('94000000-0000-0000-0000-000000000001','Mia','2026-12-01')$$);
with u as (update public.payment_installments set paid_on=null returning 1) insert into results select 'esterna non cambia le rate', count(*)=0 from u;
select pg_temp.refused('esterna non cita la rata di un altro nel suo 730', $$insert into public.home_tax_items(tax_year,category,description,amount_cents,source,source_id) values (2026,'education','Rubata',100,'installment','94000000-0000-0000-0000-0000000000a1')$$);
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.works('impegno cancellato', $$delete from public.payment_plans where id='94000000-0000-0000-0000-000000000002'$$);
insert into results select 'con l''impegno vanno via le sue rate', not exists(select 1 from public.payment_installments where plan_id='94000000-0000-0000-0000-000000000002');
reset role;
select pg_temp.works('avviso «installment» accettato', $$insert into public.user_alerts(user_id,kind,reference_id,event_date,title,body) values ('00000000-0000-0000-0000-00000000000a','installment','94000000-0000-0000-0000-0000000000a1','2026-09-10','Rata','Scade')$$);
select test, case when ok then 'ok' else 'NO' end from results;
select count(*) filter (where not ok) as falliti from results;
