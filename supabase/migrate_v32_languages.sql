-- Casa in Ordine 3.2: language is an individual account preference, never shared by a household.
CREATE TABLE public.user_language_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  language text NOT NULL DEFAULT 'it' CHECK (language IN ('it','en','es','fr','de','pt')),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.user_language_preferences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_language_preferences FROM PUBLIC, anon;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.user_language_preferences TO authenticated;
CREATE POLICY user_language_preferences_select ON public.user_language_preferences
 FOR SELECT TO authenticated USING ((select auth.uid())=user_id);
CREATE POLICY user_language_preferences_insert ON public.user_language_preferences
 FOR INSERT TO authenticated WITH CHECK ((select auth.uid())=user_id);
CREATE POLICY user_language_preferences_update ON public.user_language_preferences
 FOR UPDATE TO authenticated USING ((select auth.uid())=user_id) WITH CHECK ((select auth.uid())=user_id);
CREATE POLICY user_language_preferences_delete ON public.user_language_preferences
 FOR DELETE TO authenticated USING ((select auth.uid())=user_id);
