-- Regression: individual language preferences, isolated PostgreSQL CI only.
BEGIN;
INSERT INTO auth.users(id,email) VALUES
 ('a3200000-0000-4000-8000-000000000001','v32-a@example.invalid'),
 ('a3200000-0000-4000-8000-000000000002','v32-b@example.invalid');
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'a3200000-0000-4000-8000-000000000001';
INSERT INTO public.user_language_preferences(user_id,language) VALUES (auth.uid(),'fr');
SET LOCAL request.jwt.claim.sub = 'a3200000-0000-4000-8000-000000000002';
INSERT INTO public.user_language_preferences(user_id,language) VALUES (auth.uid(),'de');
SELECT 'B sees only own preference', CASE WHEN count(*)=1 AND min(language)='de' THEN 'ok' ELSE 'NO' END FROM public.user_language_preferences;
WITH changed AS (UPDATE public.user_language_preferences SET language='pt' WHERE user_id='a3200000-0000-4000-8000-000000000001' RETURNING 1)
SELECT 'B cannot update A', CASE WHEN count(*)=0 THEN 'ok' ELSE 'NO' END FROM changed;
WITH removed AS (DELETE FROM public.user_language_preferences WHERE user_id='a3200000-0000-4000-8000-000000000001' RETURNING 1)
SELECT 'B cannot delete A', CASE WHEN count(*)=0 THEN 'ok' ELSE 'NO' END FROM removed;
DO $$ BEGIN
  BEGIN
    UPDATE public.user_language_preferences SET user_id='a3200000-0000-4000-8000-000000000001' WHERE user_id=auth.uid();
    RAISE EXCEPTION 'ownership transfer unexpectedly allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE public.user_language_preferences SET language='xx' WHERE user_id=auth.uid();
    RAISE EXCEPTION 'invalid language unexpectedly allowed';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $$;
SET LOCAL request.jwt.claim.sub = 'a3200000-0000-4000-8000-000000000001';
SELECT 'A preference unchanged', CASE WHEN count(*)=1 AND min(language)='fr' THEN 'ok' ELSE 'NO' END FROM public.user_language_preferences;
UPDATE public.user_language_preferences SET language='en' WHERE user_id=auth.uid();
SELECT 'A can update own preference', CASE WHEN count(*)=1 AND min(language)='en' THEN 'ok' ELSE 'NO' END FROM public.user_language_preferences;
RESET ROLE;
SELECT 'anon has no table privileges', CASE WHEN NOT (has_table_privilege('anon','public.user_language_preferences','SELECT') OR has_table_privilege('anon','public.user_language_preferences','INSERT') OR has_table_privilege('anon','public.user_language_preferences','UPDATE') OR has_table_privilege('anon','public.user_language_preferences','DELETE')) THEN 'ok' ELSE 'NO' END;
ROLLBACK;
