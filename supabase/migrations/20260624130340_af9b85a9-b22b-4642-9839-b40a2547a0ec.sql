
-- sales_entries
DROP POLICY IF EXISTS "sales_entries insert authenticated" ON public.sales_entries;
DROP POLICY IF EXISTS "sales_entries update authenticated" ON public.sales_entries;
DROP POLICY IF EXISTS "sales_entries delete authenticated" ON public.sales_entries;
CREATE POLICY "sales_entries insert authenticated"
  ON public.sales_entries FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "sales_entries update authenticated"
  ON public.sales_entries FOR UPDATE TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "sales_entries delete authenticated"
  ON public.sales_entries FOR DELETE TO authenticated
  USING (auth.uid() IS NOT NULL);

-- sgf_tickets
DROP POLICY IF EXISTS "sgf_tickets insert authenticated" ON public.sgf_tickets;
DROP POLICY IF EXISTS "sgf_tickets update authenticated" ON public.sgf_tickets;
DROP POLICY IF EXISTS "sgf_tickets delete authenticated" ON public.sgf_tickets;
CREATE POLICY "sgf_tickets insert authenticated"
  ON public.sgf_tickets FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "sgf_tickets update authenticated"
  ON public.sgf_tickets FOR UPDATE TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "sgf_tickets delete authenticated"
  ON public.sgf_tickets FOR DELETE TO authenticated
  USING (auth.uid() IS NOT NULL);

-- shift_days
DROP POLICY IF EXISTS "shift_days insert authenticated" ON public.shift_days;
DROP POLICY IF EXISTS "shift_days update authenticated" ON public.shift_days;
DROP POLICY IF EXISTS "shift_days delete authenticated" ON public.shift_days;
CREATE POLICY "shift_days insert authenticated"
  ON public.shift_days FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "shift_days update authenticated"
  ON public.shift_days FOR UPDATE TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "shift_days delete authenticated"
  ON public.shift_days FOR DELETE TO authenticated
  USING (auth.uid() IS NOT NULL);
