
-- Restore public read on employees but exclude the NIF column from anon access
CREATE POLICY "employees read public" ON public.employees FOR SELECT TO anon, authenticated USING (true);
GRANT SELECT (id, nome, slug, ativo, ordem, categoria, created_at, updated_at) ON public.employees TO anon;

-- Restore public read/insert on operational tables (app is anonymous by design)
GRANT SELECT, INSERT ON public.sales_entries TO anon;
GRANT SELECT, INSERT ON public.sgf_tickets TO anon;
GRANT SELECT, INSERT ON public.shift_days TO anon;

DROP POLICY IF EXISTS "sales_entries select authenticated" ON public.sales_entries;
DROP POLICY IF EXISTS "sales_entries insert authenticated" ON public.sales_entries;
CREATE POLICY "sales_entries select public" ON public.sales_entries FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "sales_entries insert public" ON public.sales_entries FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "sgf_tickets select authenticated" ON public.sgf_tickets;
DROP POLICY IF EXISTS "sgf_tickets insert authenticated" ON public.sgf_tickets;
CREATE POLICY "sgf_tickets select public" ON public.sgf_tickets FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "sgf_tickets insert public" ON public.sgf_tickets FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "shift_days select authenticated" ON public.shift_days;
DROP POLICY IF EXISTS "shift_days insert authenticated" ON public.shift_days;
CREATE POLICY "shift_days select public" ON public.shift_days FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "shift_days insert public" ON public.shift_days FOR INSERT TO anon, authenticated WITH CHECK (true);
