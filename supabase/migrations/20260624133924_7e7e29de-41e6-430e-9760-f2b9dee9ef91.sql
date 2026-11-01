
-- Allow public (anon) read on reference tables
DROP POLICY IF EXISTS "employees read public" ON public.employees;
CREATE POLICY "employees read public" ON public.employees FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "products read public" ON public.products;
CREATE POLICY "products read public" ON public.products FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "weight_overrides read public" ON public.weight_overrides;
CREATE POLICY "weight_overrides read public" ON public.weight_overrides FOR SELECT TO anon, authenticated USING (true);

-- Allow public full access on operational tables
DROP POLICY IF EXISTS "sales_entries read authenticated" ON public.sales_entries;
DROP POLICY IF EXISTS "sales_entries insert authenticated" ON public.sales_entries;
DROP POLICY IF EXISTS "sales_entries update authenticated" ON public.sales_entries;
DROP POLICY IF EXISTS "sales_entries delete authenticated" ON public.sales_entries;
CREATE POLICY "sales_entries public all" ON public.sales_entries FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "sgf_tickets read authenticated" ON public.sgf_tickets;
DROP POLICY IF EXISTS "sgf_tickets insert authenticated" ON public.sgf_tickets;
DROP POLICY IF EXISTS "sgf_tickets update authenticated" ON public.sgf_tickets;
DROP POLICY IF EXISTS "sgf_tickets delete authenticated" ON public.sgf_tickets;
CREATE POLICY "sgf_tickets public all" ON public.sgf_tickets FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "shift_days read authenticated" ON public.shift_days;
DROP POLICY IF EXISTS "shift_days insert authenticated" ON public.shift_days;
DROP POLICY IF EXISTS "shift_days update authenticated" ON public.shift_days;
DROP POLICY IF EXISTS "shift_days delete authenticated" ON public.shift_days;
CREATE POLICY "shift_days public all" ON public.shift_days FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- Grants (PostgREST needs explicit privileges per role)
GRANT SELECT ON public.employees TO anon;
GRANT SELECT ON public.products TO anon;
GRANT SELECT ON public.weight_overrides TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_entries TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sgf_tickets TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shift_days TO anon;
