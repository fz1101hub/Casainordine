-- Casa in Ordine 3.0: personal Home preferences, one row per authenticated user.
-- Additive migration; safe to apply after v2.1.
CREATE TABLE IF NOT EXISTS public.user_home_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  widget_order text[] NOT NULL DEFAULT ARRAY['bills','shopping','tasks','five_minutes']::text[],
  layout text NOT NULL DEFAULT 'compact',
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_home_preferences_layout_check CHECK (layout IN ('compact','expanded')),
  CONSTRAINT user_home_preferences_widgets_check CHECK (
    cardinality(widget_order) BETWEEN 1 AND 4
    AND widget_order <@ ARRAY['bills','shopping','tasks','five_minutes']::text[]
    AND array_position(widget_order, NULL) IS NULL
    AND cardinality(array_positions(widget_order,'bills')) <= 1
    AND cardinality(array_positions(widget_order,'shopping')) <= 1
    AND cardinality(array_positions(widget_order,'tasks')) <= 1
    AND cardinality(array_positions(widget_order,'five_minutes')) <= 1
  )
);
ALTER TABLE public.user_home_preferences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_home_preferences FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_home_preferences TO authenticated;
CREATE POLICY user_home_preferences_select ON public.user_home_preferences
  FOR SELECT TO authenticated USING ((select auth.uid()) = user_id);
CREATE POLICY user_home_preferences_insert ON public.user_home_preferences
  FOR INSERT TO authenticated WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY user_home_preferences_update ON public.user_home_preferences
  FOR UPDATE TO authenticated USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY user_home_preferences_delete ON public.user_home_preferences
  FOR DELETE TO authenticated USING ((select auth.uid()) = user_id);
