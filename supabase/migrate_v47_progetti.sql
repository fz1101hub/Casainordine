-- Casa in Ordine: progetti e lavori (Fase 2 della roadmap, 3.3).
-- Da eseguire una volta nel SQL Editor di Supabase, DOPO migrate_v46_scorte.sql (serve la v44 per i
-- professionisti). Rieseguibile.
--
-- - home_projects: la scheda del lavoro (titolo, stato, budget, date, note), nello spazio della casa
--   o in quello personale, con l'accesso delle altre voci della casa.
-- - home_project_phases, home_project_quotes (preventivi), home_project_expenses (spese) e
--   home_project_photos (foto prima, durante e dopo) appartengono a un progetto: chi può vedere il
--   progetto le vede, chi può modificarlo le modifica (v47_project_access).
--   created_by resta vuoto se chi le ha scritte cancella l'account: le voci del lavoro restano.
-- - Fornitori: un preventivo può indicare un professionista di fiducia (v44) dello stesso spazio
--   oppure solo un nome; documenti e foto sono nell'archivio (home_documents) dello stesso spazio.
-- - home_documents ammette due tipi nuovi: «foto» e «preventivo».
begin;

alter table public.home_documents drop constraint if exists home_documents_doc_type_check;
alter table public.home_documents add constraint home_documents_doc_type_check
 check (doc_type in ('bolletta','contratto','ricevuta','garanzia','manuale','condominio','altro','foto','preventivo'));

create table if not exists public.home_projects (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 home_id uuid references public.homes(id) on delete cascade,
 title text not null check (char_length(btrim(title)) between 2 and 120),
 status text not null default 'planning' check (status in ('idea','planning','in_progress','paused','done')),
 budget numeric(12,2) check (budget is null or budget between 0 and 100000000),
 start_on date,
 end_on date,
 notes text not null default '' check (char_length(notes) <= 3000),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check (end_on is null or start_on is null or end_on >= start_on)
);
create index if not exists idx_home_projects_home on public.home_projects(home_id) where home_id is not null;
create index if not exists idx_home_projects_user on public.home_projects(user_id) where home_id is null;
comment on table public.home_projects is 'Progetti e lavori di casa: scheda, stato e budget (Fase 2).';

create table if not exists public.home_project_phases (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.home_projects(id) on delete cascade,
 created_by uuid default auth.uid() references auth.users(id) on delete set null,
 title text not null check (char_length(btrim(title)) between 2 and 160),
 due_on date,
 done_at timestamptz,
 position smallint not null default 0 check (position between 0 and 999),
 created_at timestamptz not null default now()
);
create index if not exists idx_home_project_phases_project on public.home_project_phases(project_id);

create table if not exists public.home_project_quotes (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.home_projects(id) on delete cascade,
 created_by uuid default auth.uid() references auth.users(id) on delete set null,
 professional_id uuid references public.home_professionals(id) on delete set null,
 supplier text not null default '' check (char_length(supplier) <= 120),
 amount numeric(12,2) not null check (amount between 0 and 100000000),
 received_on date,
 status text not null default 'pending' check (status in ('pending','accepted','rejected')),
 document_id uuid references public.home_documents(id) on delete set null,
 notes text not null default '' check (char_length(notes) <= 1000),
 created_at timestamptz not null default now(),
 check (professional_id is not null or char_length(btrim(supplier)) >= 2)
);
create index if not exists idx_home_project_quotes_project on public.home_project_quotes(project_id);
create index if not exists idx_home_project_quotes_professional on public.home_project_quotes(professional_id) where professional_id is not null;
create index if not exists idx_home_project_quotes_document on public.home_project_quotes(document_id) where document_id is not null;

create table if not exists public.home_project_expenses (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.home_projects(id) on delete cascade,
 created_by uuid default auth.uid() references auth.users(id) on delete set null,
 quote_id uuid references public.home_project_quotes(id) on delete set null,
 description text not null check (char_length(btrim(description)) between 2 and 200),
 amount numeric(12,2) not null check (amount between 0 and 100000000),
 paid_on date not null default current_date,
 document_id uuid references public.home_documents(id) on delete set null,
 created_at timestamptz not null default now()
);
create index if not exists idx_home_project_expenses_project on public.home_project_expenses(project_id);
create index if not exists idx_home_project_expenses_quote on public.home_project_expenses(quote_id) where quote_id is not null;
create index if not exists idx_home_project_expenses_document on public.home_project_expenses(document_id) where document_id is not null;

create table if not exists public.home_project_photos (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.home_projects(id) on delete cascade,
 created_by uuid default auth.uid() references auth.users(id) on delete set null,
 document_id uuid not null references public.home_documents(id) on delete cascade,
 kind text not null default 'before' check (kind in ('before','during','after')),
 caption text not null default '' check (char_length(caption) <= 200),
 created_at timestamptz not null default now(),
 unique (project_id, document_id)
);
create index if not exists idx_home_project_photos_project on public.home_project_photos(project_id);
create index if not exists idx_home_project_photos_document on public.home_project_photos(document_id);

create or replace function public.v47_touch() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;
revoke all on function public.v47_touch() from public, anon, authenticated;
drop trigger if exists v47_projects_touch on public.home_projects;
create trigger v47_projects_touch before update on public.home_projects
 for each row execute function public.v47_touch();

-- Al massimo 100 progetti per spazio.
create or replace function public.v47_project_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('v47_projects:' || coalesce(new.home_id, new.user_id)::text, 0));
 if (select count(*) from public.home_projects p
     where case when new.home_id is null then p.home_id is null and p.user_id = new.user_id else p.home_id = new.home_id end) >= 100 then
  raise exception 'Ci sono già 100 progetti in questo spazio.' using errcode = 'P0001';
 end if;
 return new;
end $$;
revoke all on function public.v47_project_limit() from public, anon, authenticated;
drop trigger if exists v47_project_limit on public.home_projects;
create trigger v47_project_limit before insert on public.home_projects
 for each row execute function public.v47_project_limit();

-- Chi può vedere (write=false) o modificare (write=true) un progetto, e quindi le sue voci.
create or replace function public.v47_project_access(target uuid, write boolean) returns boolean
language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.home_projects p where p.id = target
  and case when write then public.v19_can_edit(p.user_id, p.home_id) else public.v19_can_read(p.user_id, p.home_id) end)
$$;
revoke all on function public.v47_project_access(uuid, boolean) from public, anon;
grant execute on function public.v47_project_access(uuid, boolean) to authenticated;

-- Professionisti, documenti, preventivi collegati: dello stesso spazio (o progetto) della voce.
create or replace function public.v47_reference_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare p_user uuid; p_home uuid; r_user uuid; r_home uuid; j jsonb := to_jsonb(new);
begin
 select user_id, home_id into p_user, p_home from public.home_projects where id = new.project_id;
 if not found then raise exception 'Progetto non trovato'; end if;
 if j->>'professional_id' is not null then
  select user_id, home_id into r_user, r_home from public.home_professionals where id = (j->>'professional_id')::uuid;
  if not found or r_home is distinct from p_home or (r_home is null and r_user is distinct from p_user) then raise exception 'Professionista non appartenente allo spazio'; end if;
 end if;
 if j->>'document_id' is not null then
  select user_id, home_id into r_user, r_home from public.home_documents where id = (j->>'document_id')::uuid;
  if not found or r_home is distinct from p_home or (r_home is null and r_user is distinct from p_user) then raise exception 'Documento non appartenente allo spazio'; end if;
 end if;
 if j->>'quote_id' is not null and not exists(select 1 from public.home_project_quotes q where q.id = (j->>'quote_id')::uuid and q.project_id = new.project_id) then
  raise exception 'Preventivo di un altro progetto';
 end if;
 return new;
end $$;
revoke all on function public.v47_reference_guard() from public, anon, authenticated;
drop trigger if exists v47_quotes_guard on public.home_project_quotes;
create trigger v47_quotes_guard before insert or update on public.home_project_quotes for each row execute function public.v47_reference_guard();
drop trigger if exists v47_expenses_guard on public.home_project_expenses;
create trigger v47_expenses_guard before insert or update on public.home_project_expenses for each row execute function public.v47_reference_guard();
drop trigger if exists v47_photos_guard on public.home_project_photos;
create trigger v47_photos_guard before insert or update on public.home_project_photos for each row execute function public.v47_reference_guard();

-- Regole di accesso.
alter table public.home_projects enable row level security;
drop policy if exists v47_projects_read on public.home_projects;
drop policy if exists v47_projects_insert on public.home_projects;
drop policy if exists v47_projects_update on public.home_projects;
drop policy if exists v47_projects_delete on public.home_projects;
create policy v47_projects_read on public.home_projects for select to authenticated using (public.v19_can_read(user_id, home_id));
create policy v47_projects_insert on public.home_projects for insert to authenticated
 with check (user_id = (select auth.uid()) and public.v19_can_edit(user_id, home_id));
create policy v47_projects_update on public.home_projects for update to authenticated
 using (public.v19_can_edit(user_id, home_id)) with check (public.v19_can_edit(user_id, home_id));
create policy v47_projects_delete on public.home_projects for delete to authenticated using (public.v19_can_edit(user_id, home_id));
revoke all on public.home_projects from anon, authenticated;
grant select, insert, delete on public.home_projects to authenticated;
grant update (title, status, budget, start_on, end_on, notes) on public.home_projects to authenticated;

do $$
declare t text;
begin
 foreach t in array array['home_project_phases','home_project_quotes','home_project_expenses','home_project_photos'] loop
  execute format('alter table public.%I enable row level security', t);
  execute format('drop policy if exists v47_read on public.%I', t);
  execute format('drop policy if exists v47_insert on public.%I', t);
  execute format('drop policy if exists v47_update on public.%I', t);
  execute format('drop policy if exists v47_delete on public.%I', t);
  execute format('create policy v47_read on public.%I for select to authenticated using (public.v47_project_access(project_id, false))', t);
  execute format('create policy v47_insert on public.%I for insert to authenticated with check (created_by = (select auth.uid()) and public.v47_project_access(project_id, true))', t);
  execute format('create policy v47_update on public.%I for update to authenticated using (public.v47_project_access(project_id, true)) with check (public.v47_project_access(project_id, true))', t);
  execute format('create policy v47_delete on public.%I for delete to authenticated using (public.v47_project_access(project_id, true))', t);
  execute format('revoke all on public.%I from anon, authenticated', t);
  execute format('grant select, insert, delete on public.%I to authenticated', t);
 end loop;
end $$;
-- Si cambiano i dati della voce, non il progetto a cui appartiene né chi l'ha scritta.
grant update (title, due_on, done_at, position) on public.home_project_phases to authenticated;
grant update (professional_id, supplier, amount, received_on, status, document_id, notes) on public.home_project_quotes to authenticated;
grant update (quote_id, description, amount, paid_on, document_id) on public.home_project_expenses to authenticated;
grant update (kind, caption) on public.home_project_photos to authenticated;

commit;
