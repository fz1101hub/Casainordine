-- Casa in Ordine v1.3 -> v1.4. Execute once on an existing database.
-- If starting from scratch, use schema.sql instead.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS auto_confirm_payments boolean NOT NULL DEFAULT false;
GRANT UPDATE (auto_confirm_payments) ON public.profiles TO authenticated;

CREATE TABLE IF NOT EXISTS public.mail_payment_evidence (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 connection_id uuid,
 message_id text NOT NULL,
 sender_email text NOT NULL,
 subject text NOT NULL DEFAULT '',
 amount numeric(12,2) NOT NULL CHECK (amount > 0),
 received_at timestamptz NOT NULL,
 bill_id uuid,
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','auto_confirmed','dismissed')),
 reviewed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(connection_id,message_id),
 FOREIGN KEY (connection_id,user_id) REFERENCES public.mail_connections(id,user_id) ON DELETE SET NULL (connection_id),
 FOREIGN KEY (bill_id,user_id) REFERENCES public.bills(id,user_id) ON DELETE SET NULL (bill_id)
);
CREATE INDEX IF NOT EXISTS idx_mail_payment_pending ON public.mail_payment_evidence(user_id,status,created_at DESC);

CREATE TABLE IF NOT EXISTS public.mail_payment_trusted_senders (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 sender_email text NOT NULL,
 supplier_key text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(user_id,sender_email,supplier_key)
);
CREATE INDEX IF NOT EXISTS idx_mail_payment_trust_owner ON public.mail_payment_trusted_senders(user_id);

ALTER TABLE public.mail_payment_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mail_payment_trusted_senders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mail_payment_evidence FROM anon,authenticated;
REVOKE ALL ON public.mail_payment_trusted_senders FROM anon,authenticated;
