
-- Allow anonymous (no login) writes to operational tables; only admin login is used for management.
-- NC product weight set to 0 (NC counts as indicator only, not for points formula).

GRANT INSERT, UPDATE, DELETE ON public.sales_entries TO anon;
GRANT INSERT, UPDATE, DELETE ON public.sgf_tickets TO anon;
GRANT INSERT, UPDATE, DELETE ON public.shift_days TO anon;

-- sales_entries
DROP POLICY IF EXISTS "sales_entries insert authenticated" ON public.sales_entries;
DROP POLICY IF EXISTS "sales_entries update admin" ON public.sales_entries;
DROP POLICY IF EXISTS "sales_entries delete admin" ON public.sales_entries;
CREATE POLICY "sales_entries insert public" ON public.sales_entries FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "sales_entries update public" ON public.sales_entries FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "sales_entries delete public" ON public.sales_entries FOR DELETE TO anon, authenticated USING (true);

-- sgf_tickets
DROP POLICY IF EXISTS "sgf_tickets insert authenticated" ON public.sgf_tickets;
DROP POLICY IF EXISTS "sgf_tickets update admin" ON public.sgf_tickets;
DROP POLICY IF EXISTS "sgf_tickets delete admin" ON public.sgf_tickets;
CREATE POLICY "sgf_tickets insert public" ON public.sgf_tickets FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "sgf_tickets update public" ON public.sgf_tickets FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "sgf_tickets delete public" ON public.sgf_tickets FOR DELETE TO anon, authenticated USING (true);

-- shift_days
DROP POLICY IF EXISTS "shift_days insert authenticated" ON public.shift_days;
DROP POLICY IF EXISTS "shift_days update admin" ON public.shift_days;
DROP POLICY IF EXISTS "shift_days delete admin" ON public.shift_days;
CREATE POLICY "shift_days insert public" ON public.shift_days FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "shift_days update public" ON public.shift_days FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "shift_days delete public" ON public.shift_days FOR DELETE TO anon, authenticated USING (true);

-- NC peso = 0 (não pondera; apenas indicador)
UPDATE public.products SET peso = 0 WHERE codigo = 'nc';
