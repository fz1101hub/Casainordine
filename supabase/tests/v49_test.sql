-- Prova locale di migrate_v49_affitti.sql: ruoli separati, inviti, firme, foto.
\set ON_ERROR_STOP 0
\pset pager off
-- Dalla v51 l'invito si vede e si accetta solo con l'email verificata.
insert into auth.users(id,email,email_confirmed_at) values
 ('00000000-0000-0000-0000-00000000000a','locatore@x.it',now()),('00000000-0000-0000-0000-00000000000b','inquilina@x.it',now()),
 ('00000000-0000-0000-0000-00000000000c','estraneo@x.it',now());
create or replace function pg_temp.as_user(u text, mail text) returns void language sql as $$
 select set_config('request.jwt.claims', json_build_object('sub',u,'role','authenticated','email',mail)::text, false)$$;
create temp table results(test text, ok boolean);
grant all on results to authenticated;
set role authenticated;
-- Locatore: immobile, documento privato, contratto con invito
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a','locatore@x.it');
insert into public.home_properties(id,label,address) values ('80000000-0000-0000-0000-000000000001','Bilocale via Roma','Via Roma 1, Milano');
insert into public.bills(title,amount,due_date) values ('Bolletta privata del locatore',50,'2026-12-01');
insert into public.home_leases(id,property_id,property_label,property_address,tenant_email,start_on,rent,deposit) values
 ('90000000-0000-0000-0000-000000000001','80000000-0000-0000-0000-000000000001','Bilocale via Roma','Via Roma 1, Milano','inquilina@x.it','2027-01-01',800,1600);
insert into results select 'contratto creato come invito', (select status from public.home_leases)='invited';
do $$ begin insert into public.home_leases(property_label,tenant_email,start_on,status) values ('Furbo','a@b.it','2027-01-01','active'); insert into results values ('non si crea già attivo', false);
exception when others then insert into results values ('non si crea già attivo', true); end $$;
do $$ begin insert into public.home_leases(property_label,tenant_email,start_on) values ('Maiuscole','Inquilina@X.it','2027-01-01'); insert into results values ('email in minuscolo', false);
exception when check_violation then insert into results values ('email in minuscolo', true); end $$;
-- Estraneo: non vede l'invito, non può accettarlo
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c','estraneo@x.it');
insert into results select 'estraneo non vede', count(*)=0 from public.home_leases;
insert into results select 'estraneo non accetta', not public.v49_accept_lease('90000000-0000-0000-0000-000000000001');
-- Inquilina: vede l'invito, lo accetta; poi vede solo il contratto
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b','inquilina@x.it');
insert into results select 'inquilina vede l''invito', count(*)=1 from public.home_leases;
insert into results select 'inquilina accetta', public.v49_accept_lease('90000000-0000-0000-0000-000000000001');
insert into results select 'contratto attivo', (select status='active' and tenant_id='00000000-0000-0000-0000-00000000000b' from public.home_leases);
insert into results select 'inquilina non vede immobili né bollette del locatore', (select count(*) from public.home_properties)=0 and (select count(*) from public.bills)=0;
with u as (update public.home_leases set rent=1 returning 1) insert into results select 'inquilina non cambia il contratto', count(*)=0 from u;
insert into public.home_lease_reports(id,lease_id,kind,rooms,readings) values ('a0000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000001','check_in','[{"room":"Cucina","state":"good"}]','[{"meter":"Luce","value":1234,"unit":"kWh"}]');
insert into results select 'inquilina scrive il verbale', count(*)=1 from public.home_lease_reports;
insert into public.home_lease_photos(report_id,storage_path) values ('a0000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000001/b0000000-0000-0000-0000-000000000001.jpg');
insert into results select 'inquilina aggiunge una foto', count(*)=1 from public.home_lease_photos;
do $$ begin insert into public.home_lease_photos(report_id,storage_path) values ('a0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000009/b0000000-0000-0000-0000-000000000002.jpg'); insert into results values ('foto fuori dalla cartella del contratto rifiutata', false);
exception when others then insert into results values ('foto fuori dalla cartella del contratto rifiutata', true); end $$;
insert into results select 'firma inquilina', public.v49_sign_report('a0000000-0000-0000-0000-000000000001')='tenant';
-- Locatore: vede il verbale, lo cambia (firme azzerate), poi firmano entrambi
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a','locatore@x.it');
update public.home_lease_reports set notes='Pareti da ritinteggiare in camera';
insert into results select 'modifica azzera le firme', (select tenant_signed_at is null from public.home_lease_reports);
insert into results select 'firma locatore', public.v49_sign_report('a0000000-0000-0000-0000-000000000001')='landlord';
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b','inquilina@x.it');
insert into results select 'firma inquilina di nuovo', public.v49_sign_report('a0000000-0000-0000-0000-000000000001')='tenant';
do $$ begin update public.home_lease_reports set notes='cambio'; insert into results values ('verbale firmato non si cambia', false);
exception when raise_exception then insert into results values ('verbale firmato non si cambia', true); end $$;
do $$ begin delete from public.home_lease_reports; insert into results values ('verbale firmato non si elimina', false);
exception when raise_exception then insert into results values ('verbale firmato non si elimina', true); end $$;
do $$ begin update public.home_lease_reports set landlord_signed_at=null; insert into results values ('firme non si toccano a mano', false);
exception when insufficient_privilege then insert into results values ('firme non si toccano a mano', true); end $$;
-- Estraneo: niente verbali, foto o firme
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c','estraneo@x.it');
insert into results select 'estraneo non vede verbali e foto', (select count(*) from public.home_lease_reports)=0 and (select count(*) from public.home_lease_photos)=0;
do $$ begin perform public.v49_sign_report('a0000000-0000-0000-0000-000000000001'); insert into results values ('estraneo non firma', false);
exception when others then insert into results values ('estraneo non firma', true); end $$;
-- Storage: solo le parti leggono e caricano nella cartella del contratto
reset role;
insert into storage.objects(bucket_id,name,owner) values ('lease-files','90000000-0000-0000-0000-000000000001/b0000000-0000-0000-0000-000000000001.jpg','00000000-0000-0000-0000-00000000000b');
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a','locatore@x.it');
insert into results select 'locatore vede il file', count(*)=1 from storage.objects where bucket_id='lease-files';
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c','estraneo@x.it');
insert into results select 'estraneo non vede il file', count(*)=0 from storage.objects where bucket_id='lease-files';
do $$ begin insert into storage.objects(bucket_id,name) values ('lease-files','90000000-0000-0000-0000-000000000001/x.jpg'); insert into results values ('estraneo non carica', false);
exception when others then insert into results values ('estraneo non carica', true); end $$;
-- Contratto concluso: l'inquilina lo vede ma non scrive più
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a','locatore@x.it');
update public.home_leases set status='ended';
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b','inquilina@x.it');
insert into results select 'inquilina vede il contratto concluso', count(*)=1 from public.home_leases;
do $$ begin insert into public.home_lease_reports(lease_id,kind) values ('90000000-0000-0000-0000-000000000001','check_out'); insert into results values ('a contratto concluso non scrive', false);
exception when others then insert into results values ('a contratto concluso non scrive', true); end $$;
reset role;
insert into results select 'anon senza permessi', not has_table_privilege('anon','public.home_leases','select') and not has_function_privilege('anon','public.v49_accept_lease(uuid)','execute');
select test, case when ok then 'ok' else 'NO' end from results;
select count(*) filter (where not ok) as falliti from results;
