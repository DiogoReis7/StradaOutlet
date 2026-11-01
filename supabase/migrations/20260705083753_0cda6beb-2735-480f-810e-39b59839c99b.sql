
-- SALES ENTRIES: drop anon policies, recreate as authenticated-only
DROP POLICY IF EXISTS "sales_entries delete public" ON public.sales_entries;
DROP POLICY IF EXISTS "sales_entries insert public" ON public.sales_entries;
DROP POLICY IF EXISTS "sales_entries select public" ON public.sales_entries;
DROP POLICY IF EXISTS "sales_entries update public" ON public.sales_entries;
CREATE POLICY "sales_entries insert authenticated" ON public.sales_entries FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "sales_entries update authenticated" ON public.sales_entries FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "sales_entries delete authenticated" ON public.sales_entries FOR DELETE TO authenticated USING (true);

-- SGF TICKETS
DROP POLICY IF EXISTS "sgf_tickets delete public" ON public.sgf_tickets;
DROP POLICY IF EXISTS "sgf_tickets insert public" ON public.sgf_tickets;
DROP POLICY IF EXISTS "sgf_tickets select public" ON public.sgf_tickets;
DROP POLICY IF EXISTS "sgf_tickets update public" ON public.sgf_tickets;
CREATE POLICY "sgf_tickets insert authenticated" ON public.sgf_tickets FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "sgf_tickets update authenticated" ON public.sgf_tickets FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "sgf_tickets delete authenticated" ON public.sgf_tickets FOR DELETE TO authenticated USING (true);

-- SHIFT DAYS
DROP POLICY IF EXISTS "shift_days delete public" ON public.shift_days;
DROP POLICY IF EXISTS "shift_days insert public" ON public.shift_days;
DROP POLICY IF EXISTS "shift_days select public" ON public.shift_days;
DROP POLICY IF EXISTS "shift_days update public" ON public.shift_days;
CREATE POLICY "shift_days insert authenticated" ON public.shift_days FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "shift_days update authenticated" ON public.shift_days FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "shift_days delete authenticated" ON public.shift_days FOR DELETE TO authenticated USING (true);

-- Read-only tables: drop anon SELECT
DROP POLICY IF EXISTS "employees read public" ON public.employees;
DROP POLICY IF EXISTS "products read public" ON public.products;
DROP POLICY IF EXISTS "weight_overrides read public" ON public.weight_overrides;

-- Challenges: was open to public
DROP POLICY IF EXISTS "Anyone can read challenges" ON public.challenges;
CREATE POLICY "Authenticated can read challenges" ON public.challenges FOR SELECT TO authenticated USING (true);

-- Revoke anon privileges
REVOKE ALL ON public.sales_entries FROM anon;
REVOKE ALL ON public.sgf_tickets FROM anon;
REVOKE ALL ON public.shift_days FROM anon;
REVOKE ALL ON public.employees FROM anon;
REVOKE ALL ON public.products FROM anon;
REVOKE ALL ON public.weight_overrides FROM anon;
REVOKE ALL ON public.challenges FROM anon;
