-- Prove di sicurezza delle funzioni del database (dalla v51).
-- Le funzioni privilegiate (SECURITY DEFINER) ignorano le regole di accesso: ognuna deve
-- controllare da sé chi la chiama. Qui ogni azione chiamabile dall'app viene provata da chi
-- non ha il permesso (estraneo, lettore, editor dove serve il proprietario) e da chi ce l'ha.
-- In più: l'elenco delle funzioni chiamabili è chiuso (una nuova fa fallire la prova finché
-- non viene aggiunta qui dopo averla controllata), le funzioni di controllo stanno fuori
-- dall'API e le regole che le usano funzionano ancora.
\set ON_ERROR_STOP 0
\pset pager off
insert into auth.users(id,email,email_confirmed_at) values
 ('00000000-0000-0000-0000-00000000000a','a@x.it',now()),   -- proprietaria
 ('00000000-0000-0000-0000-00000000000e','e@x.it',now()),   -- editor
 ('00000000-0000-0000-0000-00000000000f','v@x.it',now()),   -- lettore
 ('00000000-0000-0000-0000-00000000000c','x@x.it',now()),   -- estraneo
 ('00000000-0000-0000-0000-00000000000d','u@x.it',null);    -- email mai verificata
create temp table people as select id, email from auth.users;
grant select on people to authenticated;
create or replace function pg_temp.as_user(u text) returns void language sql as $$
 select set_config('request.jwt.claims', json_build_object('sub',u,'role','authenticated',
  'email',(select email from people where id=u::uuid))::text, false)$$;
create temp table results(test text, ok boolean);
create temp table ids(k text primary key, v text);
grant all on results, ids to authenticated;
-- refused: l'istruzione deve fallire; works: deve riuscire (se fallisce, il messaggio va nel nome).
create or replace function pg_temp.refused(label text, stmt text) returns void language plpgsql as $$
begin execute stmt; insert into results values (label, false);
exception when others then insert into results values (label, true); end $$;
create or replace function pg_temp.works(label text, stmt text) returns void language plpgsql as $$
begin execute stmt; insert into results values (label, true);
exception when others then insert into results values (label || ' — ' || sqlerrm, false); end $$;
create or replace function pg_temp.id(key text) returns text language sql as $$ select v from ids where k=key $$;

-- ---------------------------------------------------------------------------------------
-- Catalogo: chi può chiamare che cosa
-- ---------------------------------------------------------------------------------------
create temp table allowed(name text);
insert into allowed values ('accept_home_invite'),('add_home_expense'),('add_home_vehicle_deadline'),
 ('change_home_member_role'),('confirm_payment_receipt'),('create_home'),('delete_home'),('invite_home_member'),
 ('leave_home'),('remove_home_member'),('revoke_home_invite'),('v20_apply_offline_shopping'),('v20_apply_offline_task'),
 ('v20_register_pagopa'),('v20_restore_deleted'),('v21_create_vacation_share'),('v21_revoke_vacation_share'),
 ('v36_my_storage_used'),('v49_accept_lease'),('v49_sign_report'),('v52_restore_vehicle_deadline');
insert into results select 'funzione privilegiata chiamabile non controllata: public.'||p.proname, false
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.prosecdef and has_function_privilege('authenticated',p.oid,'execute')
  and p.proname not in (select name from allowed);
insert into results select 'le 21 azioni dell''app restano chiamabili', count(*)=21
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.prosecdef and has_function_privilege('authenticated',p.oid,'execute')
  and p.proname in (select name from allowed);
insert into results select 'chi non ha fatto l''accesso non chiama funzioni privilegiate', not exists(
 select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname in ('public','private') and p.prosecdef and has_function_privilege('anon',p.oid,'execute'));
insert into results select 'ogni funzione privilegiata fissa il search_path: '||n.nspname||'.'||p.proname, false
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname in ('public','private') and p.prosecdef and not exists(select 1 from unnest(p.proconfig) c where c like 'search_path=%');
insert into results select 'funzioni di controllo fuori da public',
 (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in
  ('can_edit_home','is_home_member','is_home_owner','v19_can_edit','v19_can_read','v21_decision_open',
   'v44_can_see_professional','v47_project_access','v48_asset_access','v49_is_landlord','v49_lease_can'))=0
 and (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname in
  ('can_edit_home','is_home_member','is_home_owner','v19_can_edit','v19_can_read','v21_decision_open',
   'v44_can_see_professional','v47_project_access','v48_asset_access','v49_is_landlord','v49_lease_can'))=11;
insert into results select 'nessuna funzione chiama ancora il vecchio nome: '||n.nspname||'.'||p.proname, false
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname in ('public','private') and p.prosrc ~ 'public\.(can_edit_home|is_home_member|is_home_owner|v19_can_edit|v19_can_read|v21_decision_open|v44_can_see_professional|v47_project_access|v48_asset_access|v49_is_landlord|v49_lease_can)\(';
insert into results select 'funzioni dei trigger in private non eseguibili: '||p.proname, false
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='private' and p.prorettype='trigger'::regtype and has_function_privilege('authenticated',p.oid,'execute');
insert into results select 'nessuna tabella nello schema private', not exists(
 select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='private' and c.relkind in ('r','v','m','p'));

set role authenticated;
-- ---------------------------------------------------------------------------------------
-- Case, inviti e ruoli
-- ---------------------------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
insert into ids select 'home', public.create_home('Casa delle prove')::text;
select pg_temp.refused('nome casa troppo corto rifiutato', 'select public.create_home(''x'')');
select pg_temp.works('la proprietaria invita l''editor', $$insert into ids select 'inv_e', public.invite_home_member(pg_temp.id('home')::uuid,'e@x.it','editor')$$);
select pg_temp.works('la proprietaria invita il lettore', $$insert into ids select 'inv_v', public.invite_home_member(pg_temp.id('home')::uuid,'v@x.it','viewer')$$);
select pg_temp.works('la proprietaria invita un indirizzo mai verificato', $$insert into ids select 'inv_u', public.invite_home_member(pg_temp.id('home')::uuid,'u@x.it','viewer')$$);
select pg_temp.refused('ruolo «owner» negli inviti rifiutato', $$select public.invite_home_member(pg_temp.id('home')::uuid,'z@x.it','owner')$$);
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select pg_temp.refused('estraneo non invita', $$select public.invite_home_member(pg_temp.id('home')::uuid,'z@x.it','editor')$$);
select pg_temp.refused('estraneo non usa l''invito di un altro', $$select public.accept_home_invite(pg_temp.id('inv_e'))$$);
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
select pg_temp.refused('email mai verificata non accetta l''invito', $$select public.accept_home_invite(pg_temp.id('inv_u'))$$);
select pg_temp.as_user('00000000-0000-0000-0000-00000000000e');
select pg_temp.works('l''editor accetta il suo invito', $$select public.accept_home_invite(pg_temp.id('inv_e'))$$);
select pg_temp.refused('invito già usato rifiutato', $$select public.accept_home_invite(pg_temp.id('inv_e'))$$);
select pg_temp.refused('l''editor non invita', $$select public.invite_home_member(pg_temp.id('home')::uuid,'z@x.it','viewer')$$);
select pg_temp.as_user('00000000-0000-0000-0000-00000000000f');
select pg_temp.works('il lettore accetta il suo invito', $$select public.accept_home_invite(pg_temp.id('inv_v'))$$);

select pg_temp.as_user('00000000-0000-0000-0000-00000000000e');
select pg_temp.refused('l''editor non cambia i ruoli', $$select public.change_home_member_role(pg_temp.id('home')::uuid,'00000000-0000-0000-0000-00000000000f','editor')$$);
select pg_temp.refused('l''editor non rimuove membri', $$select public.remove_home_member(pg_temp.id('home')::uuid,'00000000-0000-0000-0000-00000000000f')$$);
select public.revoke_home_invite((select id from public.home_invites where email='u@x.it' limit 1));
select pg_temp.refused('l''editor non elimina la casa', $$select public.delete_home(pg_temp.id('home')::uuid,'Casa delle prove')$$);
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select pg_temp.refused('estraneo non cambia i ruoli', $$select public.change_home_member_role(pg_temp.id('home')::uuid,'00000000-0000-0000-0000-00000000000c','editor')$$);
select pg_temp.refused('estraneo non rimuove membri', $$select public.remove_home_member(pg_temp.id('home')::uuid,'00000000-0000-0000-0000-00000000000e')$$);
select pg_temp.refused('estraneo non elimina la casa', $$select public.delete_home(pg_temp.id('home')::uuid,'Casa delle prove')$$);
select public.leave_home(pg_temp.id('home')::uuid);
reset role;
insert into results select 'l''invito revocato da un editor resta', count(*)=1 from public.home_invites where email='u@x.it';
insert into results select 'membri dopo gli inviti: proprietaria, editor, lettore',
 (select string_agg(role,',' order by role) from public.home_members where home_id=pg_temp.id('home')::uuid)='editor,owner,viewer';
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.refused('ruolo non valido rifiutato', $$select public.change_home_member_role(pg_temp.id('home')::uuid,'00000000-0000-0000-0000-00000000000f','owner')$$);
select public.change_home_member_role(pg_temp.id('home')::uuid,'00000000-0000-0000-0000-00000000000a','viewer');
insert into results select 'la proprietaria non si toglie il ruolo', (select role from public.home_members where home_id=pg_temp.id('home')::uuid and user_id='00000000-0000-0000-0000-00000000000a')='owner';
select pg_temp.refused('la proprietaria non si rimuove', $$select public.remove_home_member(pg_temp.id('home')::uuid,'00000000-0000-0000-0000-00000000000a')$$);
select pg_temp.refused('la proprietaria non lascia la casa', $$select public.leave_home(pg_temp.id('home')::uuid)$$);
select pg_temp.refused('nome sbagliato: la casa non si elimina', $$select public.delete_home(pg_temp.id('home')::uuid,'Altra casa')$$);
select pg_temp.works('la proprietaria revoca un invito', $$select public.revoke_home_invite((select id from public.home_invites where email='u@x.it' limit 1))$$);
reset role;
insert into results select 'invito revocato dalla proprietaria', count(*)=0 from public.home_invites where email='u@x.it';
set role authenticated;

-- ---------------------------------------------------------------------------------------
-- Le regole di accesso funzionano con le funzioni di controllo spostate
-- ---------------------------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-00000000000e');
select pg_temp.works('l''editor scrive una bolletta della casa', $$insert into public.bills(home_id,title,amount,due_date) values (pg_temp.id('home')::uuid,'Luce di casa',42.5,'2027-01-10')$$);
select pg_temp.as_user('00000000-0000-0000-0000-00000000000f');
insert into results select 'il lettore vede la bolletta', count(*)=1 from public.bills where home_id=pg_temp.id('home')::uuid;
select pg_temp.refused('il lettore non scrive bollette', $$insert into public.bills(home_id,title,amount,due_date) values (pg_temp.id('home')::uuid,'Furba',1,'2027-01-10')$$);
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
insert into results select 'l''estraneo non vede la bolletta', count(*)=0 from public.bills;
insert into results select 'l''estraneo non vede i membri', count(*)=0 from public.home_members where home_id=pg_temp.id('home')::uuid;

-- ---------------------------------------------------------------------------------------
-- Spese divise e saldi
-- ---------------------------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-00000000000f');
select pg_temp.refused('il lettore non aggiunge spese', $$select public.add_home_expense(pg_temp.id('home')::uuid,'Spesa',null,1000,current_date,'00000000-0000-0000-0000-00000000000f',array['00000000-0000-0000-0000-00000000000f']::uuid[])$$);
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select pg_temp.refused('l''estraneo non aggiunge spese', $$select public.add_home_expense(pg_temp.id('home')::uuid,'Spesa','Cibo',1000,current_date,'00000000-0000-0000-0000-00000000000c',array['00000000-0000-0000-0000-00000000000c']::uuid[])$$);
insert into results select 'l''estraneo non vede i saldi', count(*)=0 from public.v33_home_balances(pg_temp.id('home')::uuid);
select pg_temp.as_user('00000000-0000-0000-0000-00000000000e');
select pg_temp.refused('chi paga deve essere della casa', $$select public.add_home_expense(pg_temp.id('home')::uuid,'Spesa','Cibo',1000,current_date,'00000000-0000-0000-0000-00000000000c',array['00000000-0000-0000-0000-00000000000e']::uuid[])$$);
select pg_temp.refused('si divide solo tra membri', $$select public.add_home_expense(pg_temp.id('home')::uuid,'Spesa','Cibo',1000,current_date,'00000000-0000-0000-0000-00000000000e',array['00000000-0000-0000-0000-00000000000e','00000000-0000-0000-0000-00000000000c']::uuid[])$$);
select pg_temp.works('l''editor aggiunge una spesa divisa', $$select public.add_home_expense(pg_temp.id('home')::uuid,'Spesa','Cibo',1001,current_date,'00000000-0000-0000-0000-00000000000e',array['00000000-0000-0000-0000-00000000000e','00000000-0000-0000-0000-00000000000a']::uuid[])$$);
insert into results select 'quote che sommano al totale', (select sum(amount) from public.home_expense_shares)=10.01;
insert into results select 'saldi della casa per i membri', (select count(*) from public.v33_home_balances(pg_temp.id('home')::uuid))=3;

-- ---------------------------------------------------------------------------------------
-- Auto: scadenze
-- ---------------------------------------------------------------------------------------
insert into public.home_vehicles(home_id,name) values (pg_temp.id('home')::uuid,'Panda');
insert into ids select 'car', id::text from public.home_vehicles where name='Panda';
select pg_temp.as_user('00000000-0000-0000-0000-00000000000f');
select pg_temp.refused('il lettore non aggiunge scadenze dell''auto', $$select public.add_home_vehicle_deadline(pg_temp.id('home')::uuid,pg_temp.id('car')::uuid,'Bollo','2027-03-01',15000,12)$$);
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
insert into ids select 'home_x', public.create_home('Casa dell''estraneo')::text;
select pg_temp.refused('l''estraneo non aggiunge scadenze all''auto degli altri', $$select public.add_home_vehicle_deadline(pg_temp.id('home')::uuid,pg_temp.id('car')::uuid,'Bollo','2027-03-01',15000,12)$$);
select pg_temp.refused('l''auto di un''altra casa non si usa', $$select public.add_home_vehicle_deadline(pg_temp.id('home_x')::uuid,pg_temp.id('car')::uuid,'Bollo','2027-03-01',15000,12)$$);
select pg_temp.as_user('00000000-0000-0000-0000-00000000000e');
select pg_temp.works('l''editor aggiunge una scadenza dell''auto', $$select public.add_home_vehicle_deadline(pg_temp.id('home')::uuid,pg_temp.id('car')::uuid,'Bollo','2027-03-01',15000,12)$$);
-- Ripristino di una scadenza (v52): si collega a bolletta e utenza già ripristinate, senza rifarle.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
insert into public.bills(home_id,title,amount,due_date) values (pg_temp.id('home_x')::uuid,'Bolletta dell''estraneo',5,'2027-01-01');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000e');
insert into public.bills(id,home_id,title,amount,due_date,paid_at) values ('60000000-0000-4000-8000-000000000001',pg_temp.id('home')::uuid,'Assicurazione · Panda',300,'2026-06-01',now());
reset role;
insert into ids select 'bill_x', id::text from public.bills where title='Bolletta dell''estraneo';
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000f');
select pg_temp.refused('il lettore non ripristina scadenze', $$select public.v52_restore_vehicle_deadline(pg_temp.id('home')::uuid,pg_temp.id('car')::uuid,'Assicurazione','2026-06-01',12,'60000000-0000-4000-8000-000000000001',null,null)$$);
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select pg_temp.refused('l''estraneo non ripristina scadenze nella casa', $$select public.v52_restore_vehicle_deadline(pg_temp.id('home')::uuid,pg_temp.id('car')::uuid,'Assicurazione','2026-06-01',12,null,null,null)$$);
select pg_temp.refused('l''estraneo non collega l''auto degli altri alla sua casa', $$select public.v52_restore_vehicle_deadline(pg_temp.id('home_x')::uuid,pg_temp.id('car')::uuid,'Assicurazione','2026-06-01',12,null,null,null)$$);
select pg_temp.as_user('00000000-0000-0000-0000-00000000000e');
select pg_temp.refused('bolletta di un''altra casa rifiutata', $$select public.v52_restore_vehicle_deadline(pg_temp.id('home')::uuid,pg_temp.id('car')::uuid,'Assicurazione','2026-06-01',12,pg_temp.id('bill_x')::uuid,null,null)$$);
select pg_temp.refused('tipo di scadenza non valido rifiutato', $$select public.v52_restore_vehicle_deadline(pg_temp.id('home')::uuid,pg_temp.id('car')::uuid,'Multa','2026-06-01',12,null,null,null)$$);
select pg_temp.refused('ripetizione non valida rifiutata', $$select public.v52_restore_vehicle_deadline(pg_temp.id('home')::uuid,pg_temp.id('car')::uuid,'Bollo','2026-06-01',6,null,null,null)$$);
select pg_temp.works('l''editor ripristina una scadenza collegata alla bolletta', $$select public.v52_restore_vehicle_deadline(pg_temp.id('home')::uuid,pg_temp.id('car')::uuid,'Assicurazione','2026-06-01',12,'60000000-0000-4000-8000-000000000001',null,'62000000-0000-4000-8000-000000000001')$$);
insert into results select 'scadenza già presente: niente di nuovo', public.v52_restore_vehicle_deadline(pg_temp.id('home')::uuid,pg_temp.id('car')::uuid,'Assicurazione','2026-06-01',12,'60000000-0000-4000-8000-000000000001',null,'62000000-0000-4000-8000-000000000001') is null;
insert into results select 'la scadenza punta alla bolletta già pagata, senza crearne un''altra',
 (select b.paid_at is not null from public.home_vehicle_deadlines d join public.bills b on b.id=d.bill_id where d.id='62000000-0000-4000-8000-000000000001')
 and (select count(*) from public.bills where title like 'Assicurazione%')=1;

-- ---------------------------------------------------------------------------------------
-- Ricevute di pagamento
-- ---------------------------------------------------------------------------------------
reset role;
insert into public.payment_receipts(user_id,home_id,bill_id,paid_on,amount,status)
 select '00000000-0000-0000-0000-00000000000e', pg_temp.id('home')::uuid, id, current_date, 42.5, 'pending' from public.bills where title='Luce di casa';
insert into ids select 'receipt', id::text from public.payment_receipts;
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000f');
select pg_temp.refused('il lettore non conferma pagamenti', $$select public.confirm_payment_receipt(pg_temp.id('receipt')::uuid)$$);
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select pg_temp.refused('l''estraneo non conferma pagamenti', $$select public.confirm_payment_receipt(pg_temp.id('receipt')::uuid)$$);
select pg_temp.as_user('00000000-0000-0000-0000-00000000000e');
select pg_temp.works('l''editor conferma il pagamento', $$select public.confirm_payment_receipt(pg_temp.id('receipt')::uuid)$$);
select pg_temp.refused('pagamento già confermato rifiutato', $$select public.confirm_payment_receipt(pg_temp.id('receipt')::uuid)$$);
insert into results select 'bolletta segnata come pagata', (select paid_at is not null from public.bills where title='Luce di casa');

-- ---------------------------------------------------------------------------------------
-- Azioni fatte offline, avvisi pagoPA, cestino
-- ---------------------------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-00000000000f');
select pg_temp.refused('il lettore non aggiunge alla lista della spesa', $$select public.v20_apply_offline_shopping(gen_random_uuid(),'Latte',pg_temp.id('home')::uuid)$$);
select pg_temp.refused('il lettore non registra avvisi pagoPA della casa', $$select public.v20_register_pagopa(pg_temp.id('home')::uuid,'301000000000000001',null,'Comune',10,'2027-02-01',false)$$);
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select pg_temp.refused('l''estraneo non aggiunge alla lista della spesa', $$select public.v20_apply_offline_shopping(gen_random_uuid(),'Latte',pg_temp.id('home')::uuid)$$);
select pg_temp.refused('l''estraneo non registra avvisi pagoPA della casa', $$select public.v20_register_pagopa(pg_temp.id('home')::uuid,'301000000000000001',null,'Comune',10,'2027-02-01',true)$$);
select pg_temp.works('l''estraneo registra un avviso nel suo spazio', $$select public.v20_register_pagopa(null,'301000000000000002',null,'Comune',10,'2027-02-01',true)$$);
select pg_temp.works('attività fatta offline nello spazio personale', $$select public.v20_apply_offline_task('10000000-0000-0000-0000-000000000001','Chiamare l''idraulico',null)$$);
insert into results select 'l''attività offline è personale', (select home_id is null and user_id='00000000-0000-0000-0000-00000000000c' from public.house_tasks where title='Chiamare l''idraulico');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000e');
insert into ids select 'shop', public.v20_apply_offline_shopping('10000000-0000-0000-0000-000000000002','Pane',pg_temp.id('home')::uuid)::text;
insert into results select 'la stessa azione offline non si ripete', public.v20_apply_offline_shopping('10000000-0000-0000-0000-000000000002','Pane',pg_temp.id('home')::uuid)::text=pg_temp.id('shop');
insert into ids select 'task_e', public.v20_apply_offline_task('10000000-0000-0000-0000-000000000001','Titolo dell''editor',null)::text;
insert into public.house_tasks(home_id,title) values (pg_temp.id('home')::uuid,'Pulire le grondaie');
delete from public.house_tasks where title='Pulire le grondaie';
insert into ids select 'bin', id::text from public.home_recycle_bin where snapshot->>'title'='Pulire le grondaie';
reset role;
insert into results select 'la stessa chiave offline di un altro crea una voce nuova',
 (select user_id from public.house_tasks where id=pg_temp.id('task_e')::uuid)='00000000-0000-0000-0000-00000000000e'
 and exists(select 1 from public.house_tasks where title='Chiamare l''idraulico' and user_id='00000000-0000-0000-0000-00000000000c');
insert into results select 'eliminazione finita nel cestino', pg_temp.id('bin') is not null;
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000f');
select pg_temp.refused('il lettore non recupera dal cestino', $$select public.v20_restore_deleted(pg_temp.id('bin')::uuid)$$);
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select pg_temp.refused('l''estraneo non recupera dal cestino', $$select public.v20_restore_deleted(pg_temp.id('bin')::uuid)$$);
select pg_temp.as_user('00000000-0000-0000-0000-00000000000e');
select pg_temp.works('l''editor recupera dal cestino', $$select public.v20_restore_deleted(pg_temp.id('bin')::uuid)$$);
select pg_temp.refused('non si recupera due volte', $$select public.v20_restore_deleted(pg_temp.id('bin')::uuid)$$);

-- ---------------------------------------------------------------------------------------
-- Vacanze: condivisione temporanea
-- ---------------------------------------------------------------------------------------
insert into public.home_vacation_plans(home_id,title,starts_on,ends_on) values (pg_temp.id('home')::uuid,'Mare','2027-07-01','2027-07-10');
insert into ids select 'plan', id::text from public.home_vacation_plans where title='Mare';
select pg_temp.as_user('00000000-0000-0000-0000-00000000000f');
select pg_temp.refused('il lettore non condivide la vacanza', $$select public.v21_create_vacation_share(pg_temp.id('plan')::uuid,'Annaffiare le piante',24)$$);
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select pg_temp.refused('l''estraneo non condivide la vacanza', $$select public.v21_create_vacation_share(pg_temp.id('plan')::uuid,'Annaffiare le piante',24)$$);
select pg_temp.as_user('00000000-0000-0000-0000-00000000000e');
select pg_temp.works('l''editor condivide la vacanza', $$select public.v21_create_vacation_share(pg_temp.id('plan')::uuid,'Annaffiare le piante',24)$$);
insert into ids select 'share', id::text from public.home_vacation_shares;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000f');
select pg_temp.refused('il lettore non revoca la condivisione', $$select public.v21_revoke_vacation_share(pg_temp.id('share')::uuid)$$);
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select pg_temp.refused('l''estraneo non revoca la condivisione', $$select public.v21_revoke_vacation_share(pg_temp.id('share')::uuid)$$);
select pg_temp.as_user('00000000-0000-0000-0000-00000000000e');
select pg_temp.works('l''editor revoca la condivisione', $$select public.v21_revoke_vacation_share(pg_temp.id('share')::uuid)$$);

-- ---------------------------------------------------------------------------------------
-- Frase SOS (funzioni ordinarie che usano le funzioni di controllo)
-- ---------------------------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-00000000000f');
select pg_temp.refused('il lettore non sceglie la frase SOS', $$select public.v40_set_sos_key(pg_temp.id('home')::uuid,'AAAAAAAAAAAAAAAAAAAAAA==','{"v":"1","iv":"AAAAAAAAAAAAAAAA","data":"AAAAAAAAAAAAAAAAAAAAAAAA"}','[]')$$);
select pg_temp.refused('il lettore non cancella le schede SOS', $$select public.v40_reset_sos(pg_temp.id('home')::uuid)$$);
select pg_temp.as_user('00000000-0000-0000-0000-00000000000e');
select pg_temp.works('l''editor sceglie la frase SOS', $$select public.v40_set_sos_key(pg_temp.id('home')::uuid,'AAAAAAAAAAAAAAAAAAAAAA==','{"v":"1","iv":"AAAAAAAAAAAAAAAA","data":"AAAAAAAAAAAAAAAAAAAAAAAA"}','[]')$$);
select pg_temp.works('l''editor cancella le schede SOS', $$select public.v40_reset_sos(pg_temp.id('home')::uuid)$$);

-- ---------------------------------------------------------------------------------------
-- Spazio usato dai documenti: ognuno vede solo il proprio
-- ---------------------------------------------------------------------------------------
reset role;
insert into storage.objects(bucket_id,name,owner,metadata) values
 ('house-documents','00000000-0000-0000-0000-00000000000a/f1.pdf','00000000-0000-0000-0000-00000000000a','{"size":1000}'),
 ('house-documents','00000000-0000-0000-0000-00000000000c/f2.pdf','00000000-0000-0000-0000-00000000000c','{"size":7}');
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
insert into results select 'spazio usato: solo i propri file', public.v36_my_storage_used()=1000;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
insert into results select 'spazio usato dell''estraneo', public.v36_my_storage_used()=7;

-- ---------------------------------------------------------------------------------------
-- Affitti: serve l'email verificata
-- ---------------------------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
insert into public.home_leases(id,property_label,tenant_email,start_on) values
 ('90000000-0000-0000-0000-000000000001','Monolocale','u@x.it','2027-01-01'),
 ('90000000-0000-0000-0000-000000000002','Bilocale','x@x.it','2027-01-01');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
insert into results select 'email non verificata: l''invito d''affitto non si vede', count(*)=0 from public.home_leases;
select pg_temp.refused('email non verificata: l''invito d''affitto non si accetta', $$select public.v49_accept_lease('90000000-0000-0000-0000-000000000001')$$);
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
insert into results select 'email verificata: si vede solo il proprio invito', (select string_agg(property_label,',') from public.home_leases)='Bilocale';
insert into results select 'l''invito di un altro non si accetta', not public.v49_accept_lease('90000000-0000-0000-0000-000000000001');
insert into results select 'il proprio invito si accetta', public.v49_accept_lease('90000000-0000-0000-0000-000000000002');
-- Con la sessione che porta un altro indirizzo, conta solo quello verificato dell'account.
select set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-00000000000d','role','authenticated','email','x@x.it')::text, false);
insert into results select 'l''email della sessione non basta', count(*)=0 from public.home_leases;

-- ---------------------------------------------------------------------------------------
-- In fondo: chi lascia la casa ed eliminazione
-- ---------------------------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-00000000000f');
select pg_temp.works('il lettore lascia la casa', $$select public.leave_home(pg_temp.id('home')::uuid)$$);
insert into results select 'dopo l''uscita non vede più niente', count(*)=0 from public.bills;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.works('la proprietaria rimuove l''editor', $$select public.remove_home_member(pg_temp.id('home')::uuid,'00000000-0000-0000-0000-00000000000e')$$);
select pg_temp.works('la proprietaria elimina la casa con il nome giusto', $$select public.delete_home(pg_temp.id('home')::uuid,'Casa delle prove')$$);
reset role;
insert into results select 'casa eliminata', count(*)=0 from public.homes where id=pg_temp.id('home')::uuid;
select test, case when ok then 'ok' else 'NO' end from results;
select count(*) filter (where not ok) as falliti from results;
