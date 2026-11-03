-- Upgrade Casa in Ordine v1.2 -> v1.3, execute ONCE on Supabase.
-- Do not run after applying the complete v1.3 schema.sql.
ALTER TABLE public.mail_oauth_states ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'gmail';
ALTER TABLE public.mail_oauth_states DROP CONSTRAINT IF EXISTS mail_oauth_states_provider_check;
ALTER TABLE public.mail_oauth_states ADD CONSTRAINT mail_oauth_states_provider_check CHECK (provider IN ('gmail','outlook'));
ALTER TABLE public.mail_connections ADD COLUMN IF NOT EXISTS imap_login text;
ALTER TABLE public.mail_connections DROP CONSTRAINT IF EXISTS mail_connections_provider_check;
ALTER TABLE public.mail_connections ADD CONSTRAINT mail_connections_provider_check CHECK (provider IN ('gmail','outlook','icloud','yahoo','aol','libero','virgilio','tiscali','aruba','aruba_free','aruba_pec','fastmail','zoho','zoho_business','zoho_eu','zoho_business_eu','gmx','gmx_de','mail_com'));
CREATE TABLE IF NOT EXISTS public.mail_connection_attempts (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mail_connection_attempts_user ON public.mail_connection_attempts(user_id,created_at DESC);
ALTER TABLE public.mail_connection_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mail_connection_attempts FROM anon,authenticated;
