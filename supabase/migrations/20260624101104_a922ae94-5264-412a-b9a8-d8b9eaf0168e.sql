
-- Open data tables for public (anon + authenticated) read/write since this is an internal tool with no registration.

-- Drop existing restrictive policies on data tables
DROP POLICY IF EXISTS "employees read all auth" ON public.employees;
DROP POLICY IF EXISTS "employees admin write" ON public.employees;
DROP POLICY IF EXISTS "products read all auth" ON public.products;
DROP POLICY IF EXISTS "products admin write" ON public.products;
DROP POLICY IF EXISTS "sales all auth" ON public.sales_entries;
DROP POLICY IF EXISTS "shifts all auth" ON public.shift_days;
DROP POLICY IF EXISTS "sgf all auth" ON public.sgf_tickets;
DROP POLICY IF EXISTS "wo all auth" ON public.weight_overrides;

-- Grant to anon
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employees TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_entries TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shift_days TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sgf_tickets TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.weight_overrides TO anon;

-- Open policies (no registration required)
CREATE POLICY "public all" ON public.employees FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "public all" ON public.products FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "public all" ON public.sales_entries FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "public all" ON public.shift_days FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "public all" ON public.sgf_tickets FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "public all" ON public.weight_overrides FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
