
-- Re-allow public read on app tables (the app is designed for public viewing; only writes need auth)
CREATE POLICY "employees read public" ON public.employees
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "sales_entries select public" ON public.sales_entries
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "shift_days select public" ON public.shift_days
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "sgf_tickets select public" ON public.sgf_tickets
  FOR SELECT TO anon, authenticated USING (true);

-- Grant Data API access to anon
GRANT SELECT ON public.employees TO anon;
GRANT SELECT ON public.products TO anon;
GRANT SELECT ON public.sales_entries TO anon;
GRANT SELECT ON public.shift_days TO anon;
GRANT SELECT ON public.sgf_tickets TO anon;
GRANT SELECT ON public.weight_overrides TO anon;
