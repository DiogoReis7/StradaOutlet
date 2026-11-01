
-- sales_entries: split the previous "ALL" public policy
DROP POLICY IF EXISTS "sales_entries public all" ON public.sales_entries;
CREATE POLICY "sales_entries select public" ON public.sales_entries
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "sales_entries insert public" ON public.sales_entries
  FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "sales_entries update public" ON public.sales_entries
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "sales_entries delete admin" ON public.sales_entries
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- sgf_tickets
DROP POLICY IF EXISTS "sgf_tickets public all" ON public.sgf_tickets;
CREATE POLICY "sgf_tickets select public" ON public.sgf_tickets
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "sgf_tickets insert public" ON public.sgf_tickets
  FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "sgf_tickets update public" ON public.sgf_tickets
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "sgf_tickets delete admin" ON public.sgf_tickets
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- shift_days
DROP POLICY IF EXISTS "shift_days public all" ON public.shift_days;
CREATE POLICY "shift_days select public" ON public.shift_days
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "shift_days insert public" ON public.shift_days
  FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "shift_days update public" ON public.shift_days
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "shift_days delete admin" ON public.shift_days
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
