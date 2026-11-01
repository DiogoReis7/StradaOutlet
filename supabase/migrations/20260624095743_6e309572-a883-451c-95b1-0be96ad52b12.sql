
-- Replace permissive policies with auth.uid() IS NOT NULL
DROP POLICY IF EXISTS "wo read all auth" ON public.weight_overrides;
DROP POLICY IF EXISTS "wo write auth" ON public.weight_overrides;
CREATE POLICY "wo all auth" ON public.weight_overrides FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "shifts rw auth" ON public.shift_days;
CREATE POLICY "shifts all auth" ON public.shift_days FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "sales rw auth" ON public.sales_entries;
CREATE POLICY "sales all auth" ON public.sales_entries FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "sgf rw auth" ON public.sgf_tickets;
CREATE POLICY "sgf all auth" ON public.sgf_tickets FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- Lock SECURITY DEFINER functions
REVOKE ALL ON FUNCTION public.has_role(UUID, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
