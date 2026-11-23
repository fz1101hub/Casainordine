-- Casa in Ordine v52: ripristino delle scadenze dell'auto da un backup.
-- Da eseguire una volta nel SQL Editor di Supabase, DOPO migrate_v51_sicurezza_funzioni.sql.
-- Rieseguibile.
--
-- Le scadenze dell'auto si creano solo con add_home_vehicle_deadline, che crea anche la bolletta
-- (e l'utenza, se la scadenza si ripete). Nel ripristino bolletta e utenza tornano già dal backup,
-- con il loro stato (pagata, importo vero): rifarle con add_home_vehicle_deadline le
-- duplicherebbe. Questa funzione aggiunge solo la scadenza e la collega a bolletta e utenza
-- esistenti, con gli stessi controlli: permesso di modifica sulla casa, auto della casa, bolletta e
-- utenza della stessa casa, tipo e ripetizione validi. Con un identificativo già presente non
-- aggiunge niente e restituisce null.
begin;

create or replace function public.v52_restore_vehicle_deadline(target_home uuid, target_vehicle uuid, deadline_label text,
 deadline_date date, repeat_every_months integer, linked_bill uuid, linked_utility uuid, deadline_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare new_id uuid;
begin
 if target_home is null or not private.can_edit_home(target_home) then raise exception 'Non hai permessi di modifica' using errcode = '42501'; end if;
 if deadline_label is null or deadline_label not in ('Bollo','Assicurazione','Revisione','Tagliando','Altro') or deadline_date is null
    or repeat_every_months is null or repeat_every_months not in (0, 12, 24) then
  raise exception 'Scadenza non valida' using errcode = '22023';
 end if;
 if not exists(select 1 from public.home_vehicles v where v.id = target_vehicle and v.home_id = target_home) then
  raise exception 'Veicolo non appartenente alla casa' using errcode = '42501';
 end if;
 if linked_bill is not null and not exists(select 1 from public.bills b where b.id = linked_bill and b.home_id = target_home) then
  raise exception 'Bolletta non appartenente alla casa' using errcode = '42501';
 end if;
 if linked_utility is not null and not exists(select 1 from public.utilities u where u.id = linked_utility and u.home_id = target_home) then
  raise exception 'Utenza non appartenente alla casa' using errcode = '42501';
 end if;
 insert into public.home_vehicle_deadlines(id, home_id, vehicle_id, bill_id, utility_id, label, due_date, repeat_months)
 values (coalesce(deadline_id, gen_random_uuid()), target_home, target_vehicle, linked_bill, linked_utility, deadline_label, deadline_date, repeat_every_months)
 on conflict (id) do nothing
 returning id into new_id;
 return new_id;
end $$;
revoke all on function public.v52_restore_vehicle_deadline(uuid, uuid, text, date, integer, uuid, uuid, uuid) from public, anon;
grant execute on function public.v52_restore_vehicle_deadline(uuid, uuid, text, date, integer, uuid, uuid, uuid) to authenticated;

commit;

notify pgrst, 'reload schema';
