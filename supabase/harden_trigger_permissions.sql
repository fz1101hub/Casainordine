-- Applied to the hosted Casa in Ordine Supabase project on 2026-11-03.
-- Trigger functions are called by PostgreSQL internally, not by browsers or REST RPC.
-- Restrict direct execution while preserving trigger behavior.
REVOKE ALL ON FUNCTION public.on_auth_email_changed() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.on_new_auth_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.v19_reference_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.v20_audit_changes() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.v20_reference_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.v21_scope_guard() FROM PUBLIC, anon, authenticated;
