-- Casa in Ordine v1.6. Eseguire UNA VOLTA dopo backup, su installazioni v1.5.
-- Lista personale di indirizzi mittenti confermati durante l'importazione di bollette.
-- Non autorizza pagamenti né confonde il dominio con una prova di identità.
CREATE TABLE IF NOT EXISTS public.mail_bill_senders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_email text NOT NULL CHECK (length(sender_email) BETWEEN 5 AND 254),
  sender_domain text NOT NULL CHECK (length(sender_domain) BETWEEN 4 AND 253),
  supplier text NOT NULL CHECK (length(supplier) BETWEEN 2 AND 120),
  supplier_key text NOT NULL CHECK (length(supplier_key) BETWEEN 2 AND 120),
  auth_state text NOT NULL DEFAULT 'unknown' CHECK (auth_state IN ('unknown','reported_pass','reported_fail')),
  confirmed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,sender_email,supplier_key)
);
CREATE INDEX IF NOT EXISTS idx_mail_bill_senders_owner ON public.mail_bill_senders(user_id,confirmed_at DESC);
ALTER TABLE public.mail_bill_senders ENABLE ROW LEVEL SECURITY;
-- All reads and writes are performed by authenticated backend routes. No cross-user access.
REVOKE ALL ON public.mail_bill_senders FROM anon,authenticated;
