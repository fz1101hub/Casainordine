-- Casa in Ordine: profilo locatore/inquilino (Fase 2 della roadmap, 3.3).
-- Da eseguire una volta nel SQL Editor di Supabase, DOPO migrate_v48_fondo.sql. Rieseguibile.
--
-- Un contratto d'affitto (home_leases) unisce due persone che non condividono la casa:
-- - il locatore (user_id, oppure i membri della sua casa condivisa con i loro permessi) lo crea
--   da un suo immobile e invita l'inquilino con l'email; se chi l'ha creato lascia la casa, il
--   contratto passa al proprietario della casa come le altre voci (v41);
-- - l'inquilino lo accetta (v49_accept_lease) e da lì vede SOLO il contratto, i verbali e le loro
--   foto: niente immobili, documenti, bollette o altro dello spazio del locatore. Allo stesso modo
--   il locatore non vede niente dello spazio dell'inquilino. Dell'immobile il contratto tiene una
--   copia del nome e dell'indirizzo, così all'inquilino non serve accedere a home_properties.
-- - Verbali d'ingresso e d'uscita (home_lease_reports): stanze con stato e note, letture dei
--   contatori, note; li scrivono entrambi finché il contratto è attivo. Ciascuno firma per sé
--   (v49_sign_report); se il testo cambia dopo una firma, le firme si azzerano; firmato da
--   entrambi, il verbale non si cambia più.
-- - Foto dei verbali: bucket privato «lease-files», cartella <id del contratto>/, leggibili e
--   caricabili solo dalle due parti.
begin;

create table if not exists public.home_leases (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 home_id uuid references public.homes(id) on delete cascade,
 property_id uuid references public.home_properties(id) on delete set null,
 property_label text not null check (char_length(btrim(property_label)) between 2 and 160),
 property_address text not null default '' check (char_length(property_address) <= 300),
 tenant_email text not null check (tenant_email = lower(btrim(tenant_email)) and tenant_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$' and char_length(tenant_email) <= 254),
 tenant_id uuid references auth.users(id) on delete set null,
 start_on date not null,
 end_on date,
 rent numeric(12,2) check (rent is null or rent between 0 and 10000000),
 deposit numeric(12,2) check (deposit is null or deposit between 0 and 10000000),
 status text not null default 'invited' check (status in ('invited','active','ended')),
 notes text not null default '' check (char_length(notes) <= 1500),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check (end_on is null or end_on >= start_on)
);
create index if not exists idx_home_leases_home on public.home_leases(home_id) where home_id is not null;
create index if not exists idx_home_leases_owner on public.home_leases(user_id);
create index if not exists idx_home_leases_tenant on public.home_leases(tenant_id) where tenant_id is not null;
create index if not exists idx_home_leases_invite on public.home_leases(tenant_email) where tenant_id is null;
create index if not exists idx_home_leases_property on public.home_leases(property_id) where property_id is not null;
comment on table public.home_leases is
 'Contratti d''affitto tra locatore e inquilino: l''inquilino vede solo contratto, verbali e foto (Fase 2).';

create table if not exists public.home_lease_reports (
 id uuid primary key default gen_random_uuid(),
 lease_id uuid not null references public.home_leases(id) on delete cascade,
 kind text not null check (kind in ('check_in','check_out')),
 report_date date not null default current_date,
 rooms jsonb not null default '[]'::jsonb check (jsonb_typeof(rooms) = 'array' and jsonb_array_length(rooms) <= 40 and octet_length(rooms::text) <= 30000),
 readings jsonb not null default '[]'::jsonb check (jsonb_typeof(readings) = 'array' and jsonb_array_length(readings) <= 12 and octet_length(readings::text) <= 4000),
 notes text not null default '' check (char_length(notes) <= 3000),
 landlord_signed_at timestamptz,
 tenant_signed_at timestamptz,
 created_by uuid default auth.uid() references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique (lease_id, kind)
);
create index if not exists idx_home_lease_reports_created_by on public.home_lease_reports(created_by);

create table if not exists public.home_lease_photos (
 id uuid primary key default gen_random_uuid(),
 report_id uuid not null references public.home_lease_reports(id) on delete cascade,
 storage_path text not null unique check (storage_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$'),
 room text not null default '' check (char_length(room) <= 80),
 caption text not null default '' check (char_length(caption) <= 200),
 uploaded_by uuid default auth.uid() references auth.users(id) on delete set null,
 created_at timestamptz not null default now()
);
create index if not exists idx_home_lease_photos_report on public.home_lease_photos(report_id);
create index if not exists idx_home_lease_photos_uploaded_by on public.home_lease_photos(uploaded_by);

-- Ruolo di chi chiama su un contratto: 'landlord' (può leggere / modificare), 'tenant' (inquilino
-- che ha accettato), altrimenti null.
create or replace function public.v49_lease_can(target uuid, write boolean) returns boolean
language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.home_leases l where l.id = target and (
   (case when write then public.v19_can_edit(l.user_id, l.home_id) else public.v19_can_read(l.user_id, l.home_id) end)
   or (l.tenant_id = (select auth.uid()) and (not write or l.status = 'active'))))
$$;
create or replace function public.v49_is_landlord(target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.home_leases l where l.id = target and public.v19_can_edit(l.user_id, l.home_id))
$$;
-- Contratto dal percorso di un file («<id contratto>/<id>.jpg»); null se il percorso non è valido.
create or replace function public.v49_lease_from_path(path text) returns uuid
language sql immutable set search_path = '' as $$
 select case when path ~ '^[0-9a-f-]{36}/' then split_part(path, '/', 1)::uuid end
$$;
revoke all on function public.v49_lease_can(uuid, boolean) from public, anon;
revoke all on function public.v49_is_landlord(uuid) from public, anon;
revoke all on function public.v49_lease_from_path(text) from public, anon;
grant execute on function public.v49_lease_can(uuid, boolean) to authenticated;
grant execute on function public.v49_is_landlord(uuid) to authenticated;
grant execute on function public.v49_lease_from_path(text) to authenticated;

create or replace function public.v49_touch() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;
revoke all on function public.v49_touch() from public, anon, authenticated;
drop trigger if exists v49_leases_touch on public.home_leases;
create trigger v49_leases_touch before update on public.home_leases for each row execute function public.v49_touch();

-- L'immobile deve essere dello spazio del contratto.
create or replace function public.v49_lease_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r_user uuid; r_home uuid;
begin
 if new.property_id is not null then
  select user_id, home_id into r_user, r_home from public.home_properties where id = new.property_id;
  if not found or r_home is distinct from new.home_id or (r_home is null and r_user is distinct from new.user_id) then
   raise exception 'Immobile non appartenente allo spazio';
  end if;
 end if;
 return new;
end $$;
revoke all on function public.v49_lease_guard() from public, anon, authenticated;
drop trigger if exists v49_lease_guard on public.home_leases;
create trigger v49_lease_guard before insert or update of property_id on public.home_leases for each row execute function public.v49_lease_guard();

-- Verbali: firmato da entrambi non si cambia; se il testo cambia, le firme si azzerano.
create or replace function public.v49_report_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
 if tg_op = 'DELETE' then
  if old.landlord_signed_at is not null and old.tenant_signed_at is not null then raise exception 'Verbale firmato da entrambi: non si elimina'; end if;
  return old;
 end if;
 if old.landlord_signed_at is not null and old.tenant_signed_at is not null then raise exception 'Verbale firmato da entrambi: non si modifica'; end if;
 if (new.report_date, new.rooms, new.readings, new.notes) is distinct from (old.report_date, old.rooms, old.readings, old.notes) then
  new.landlord_signed_at := null; new.tenant_signed_at := null;
 end if;
 new.updated_at := now();
 return new;
end $$;
revoke all on function public.v49_report_guard() from public, anon, authenticated;
drop trigger if exists v49_report_guard on public.home_lease_reports;
create trigger v49_report_guard before update or delete on public.home_lease_reports for each row execute function public.v49_report_guard();

-- Regole di accesso.
alter table public.home_leases enable row level security;
drop policy if exists v49_leases_read on public.home_leases;
drop policy if exists v49_leases_invite on public.home_leases;
drop policy if exists v49_leases_insert on public.home_leases;
drop policy if exists v49_leases_update on public.home_leases;
drop policy if exists v49_leases_delete on public.home_leases;
create policy v49_leases_read on public.home_leases for select to authenticated
 using (public.v19_can_read(user_id, home_id) or tenant_id = (select auth.uid()));
-- Un invito si vede solo dall'indirizzo a cui è rivolto, finché non è accettato.
create policy v49_leases_invite on public.home_leases for select to authenticated
 using (tenant_id is null and status = 'invited' and tenant_email = lower(coalesce((select auth.jwt()) ->> 'email', '')));
create policy v49_leases_insert on public.home_leases for insert to authenticated
 with check (user_id = (select auth.uid()) and public.v19_can_edit(user_id, home_id) and tenant_id is null and status = 'invited');
create policy v49_leases_update on public.home_leases for update to authenticated
 using (public.v19_can_edit(user_id, home_id)) with check (public.v19_can_edit(user_id, home_id));
create policy v49_leases_delete on public.home_leases for delete to authenticated using (public.v19_can_edit(user_id, home_id));
revoke all on public.home_leases from anon, authenticated;
grant select, insert, delete on public.home_leases to authenticated;
-- Il locatore cambia i dati del contratto e lo chiude; l'inquilino lo accetta solo con v49_accept_lease.
grant update (property_label, property_address, tenant_email, start_on, end_on, rent, deposit, status, notes) on public.home_leases to authenticated;

alter table public.home_lease_reports enable row level security;
drop policy if exists v49_reports_read on public.home_lease_reports;
drop policy if exists v49_reports_insert on public.home_lease_reports;
drop policy if exists v49_reports_update on public.home_lease_reports;
drop policy if exists v49_reports_delete on public.home_lease_reports;
create policy v49_reports_read on public.home_lease_reports for select to authenticated using (public.v49_lease_can(lease_id, false));
create policy v49_reports_insert on public.home_lease_reports for insert to authenticated
 with check (created_by = (select auth.uid()) and public.v49_lease_can(lease_id, true) and landlord_signed_at is null and tenant_signed_at is null);
create policy v49_reports_update on public.home_lease_reports for update to authenticated
 using (public.v49_lease_can(lease_id, true)) with check (public.v49_lease_can(lease_id, true));
create policy v49_reports_delete on public.home_lease_reports for delete to authenticated using (public.v49_lease_can(lease_id, true));
revoke all on public.home_lease_reports from anon, authenticated;
grant select, insert, delete on public.home_lease_reports to authenticated;
grant update (report_date, rooms, readings, notes) on public.home_lease_reports to authenticated;

alter table public.home_lease_photos enable row level security;
drop policy if exists v49_photos_read on public.home_lease_photos;
drop policy if exists v49_photos_insert on public.home_lease_photos;
drop policy if exists v49_photos_delete on public.home_lease_photos;
create policy v49_photos_read on public.home_lease_photos for select to authenticated
 using (exists(select 1 from public.home_lease_reports r where r.id = report_id and public.v49_lease_can(r.lease_id, false)));
create policy v49_photos_insert on public.home_lease_photos for insert to authenticated
 with check (uploaded_by = (select auth.uid()) and exists(select 1 from public.home_lease_reports r where r.id = report_id
  and public.v49_lease_can(r.lease_id, true) and r.lease_id = public.v49_lease_from_path(storage_path)
  and not (r.landlord_signed_at is not null and r.tenant_signed_at is not null)));
create policy v49_photos_delete on public.home_lease_photos for delete to authenticated
 using (exists(select 1 from public.home_lease_reports r where r.id = report_id and public.v49_lease_can(r.lease_id, true)
  and not (r.landlord_signed_at is not null and r.tenant_signed_at is not null)));
revoke all on public.home_lease_photos from anon, authenticated;
grant select, insert, delete on public.home_lease_photos to authenticated;

-- L'inquilino accetta l'invito rivolto al suo indirizzo email.
create or replace function public.v49_accept_lease(target uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); mail text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
 if me is null or mail = '' then raise exception 'Accesso richiesto' using errcode = '42501'; end if;
 update public.home_leases set tenant_id = me, status = 'active'
  where id = target and tenant_id is null and status = 'invited' and tenant_email = mail and user_id <> me;
 return found;
end $$;
revoke all on function public.v49_accept_lease(uuid) from public, anon;
grant execute on function public.v49_accept_lease(uuid) to authenticated;

-- Firma di un verbale: ciascuna parte firma per sé, a contratto attivo.
create or replace function public.v49_sign_report(target uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare r record; me uuid := auth.uid();
begin
 select r2.id, r2.lease_id, l.tenant_id, l.status into r from public.home_lease_reports r2 join public.home_leases l on l.id = r2.lease_id where r2.id = target;
 if not found then raise exception 'Verbale non trovato' using errcode = 'P0002'; end if;
 if r.status <> 'active' then raise exception 'Contratto non attivo' using errcode = '42501'; end if;
 if public.v49_is_landlord(r.lease_id) then
  update public.home_lease_reports set landlord_signed_at = now() where id = target and landlord_signed_at is null;
  return 'landlord';
 elsif r.tenant_id = me then
  update public.home_lease_reports set tenant_signed_at = now() where id = target and tenant_signed_at is null;
  return 'tenant';
 end if;
 raise exception 'Non sei parte di questo contratto' using errcode = '42501';
end $$;
revoke all on function public.v49_sign_report(uuid) from public, anon;
grant execute on function public.v49_sign_report(uuid) to authenticated;

-- Foto: bucket privato, cartella del contratto, solo le due parti.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('lease-files', 'lease-files', false, 10485760, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists v49_lease_files_read on storage.objects;
drop policy if exists v49_lease_files_upload on storage.objects;
drop policy if exists v49_lease_files_delete on storage.objects;
create policy v49_lease_files_read on storage.objects for select to authenticated
 using (bucket_id = 'lease-files' and public.v49_lease_can(public.v49_lease_from_path(name), false));
create policy v49_lease_files_upload on storage.objects for insert to authenticated
 with check (bucket_id = 'lease-files' and public.v49_lease_can(public.v49_lease_from_path(name), true));
create policy v49_lease_files_delete on storage.objects for delete to authenticated
 using (bucket_id = 'lease-files' and public.v49_lease_can(public.v49_lease_from_path(name), true));

commit;
