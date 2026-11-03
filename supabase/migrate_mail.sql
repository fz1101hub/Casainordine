-- Casa in Ordine v1.2 - execute once on an existing Supabase project.
-- Sensitive mailbox tokens are encrypted by the backend with MAIL_TOKEN_ENCRYPTION_KEY.
create table if not exists public.mail_oauth_states (
 state_hash text primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 verifier_enc text not null,
 expires_at timestamptz not null,
 created_at timestamptz not null default now()
);
create table if not exists public.mail_connections (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 provider text not null check(provider in ('gmail')),
 email_address text not null,
 refresh_token_enc text not null,
 status text not null default 'active' check(status in ('active','error','reconnect')),
 last_sync_at timestamptz,
 last_error text,
 created_at timestamptz not null default now(),
 unique(user_id,provider,email_address),
 unique(id,user_id)
);
create table if not exists public.mail_documents (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 connection_id uuid,
 message_id text not null,
 attachment_id text not null,
 filename text not null,
 mime_type text not null,
 storage_path text not null unique,
 size_bytes integer not null,
 subject text,
 sender text,
 received_at timestamptz,
 suggestion jsonb not null default '{}'::jsonb,
 status text not null default 'pending' check(status in ('pending','imported','dismissed')),
 created_at timestamptz not null default now(),
 unique(connection_id,message_id,attachment_id),
 foreign key (connection_id,user_id) references public.mail_connections(id,user_id) on delete set null (connection_id)
);
create index if not exists idx_mail_documents_user on public.mail_documents(user_id,status,created_at desc);
create index if not exists idx_mail_connections_sync on public.mail_connections(last_sync_at);
alter table public.mail_oauth_states enable row level security;
alter table public.mail_connections enable row level security;
alter table public.mail_documents enable row level security;
-- All OAuth state, credentials and attachment metadata operations go through the authenticated backend.
revoke all on public.mail_oauth_states from anon,authenticated;
revoke all on public.mail_connections from anon,authenticated;
revoke all on public.mail_documents from anon,authenticated;
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
 values ('mail-bills','mail-bills',false,15728640,ARRAY['application/pdf','image/jpeg','image/png','image/webp'])
 on conflict (id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
-- Users may download only their own previously imported attachments.
create policy "mail_bills_download_own" on storage.objects for select to authenticated
 using (bucket_id='mail-bills' and (storage.foldername(name))[1]=(select auth.uid())::text);
