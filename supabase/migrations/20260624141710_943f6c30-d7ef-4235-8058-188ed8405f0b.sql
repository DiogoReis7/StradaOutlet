
-- Remove public/anon read on employees (NIF leak) and tighten public insert/select on operational tables
DROP POLICY IF EXISTS "employees read public" ON public.employees;

DROP POLICY IF EXISTS "sales_entries insert public" ON public.sales_entries;
DROP POLICY IF EXISTS "sales_entries select public" ON public.sales_entries;
CREATE POLICY "sales_entries select authenticated" ON public.sales_entries FOR SELECT TO authenticated USING (true);
CREATE POLICY "sales_entries insert authenticated" ON public.sales_entries FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "sgf_tickets insert public" ON public.sgf_tickets;
DROP POLICY IF EXISTS "sgf_tickets select public" ON public.sgf_tickets;
CREATE POLICY "sgf_tickets select authenticated" ON public.sgf_tickets FOR SELECT TO authenticated USING (true);
CREATE POLICY "sgf_tickets insert authenticated" ON public.sgf_tickets FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "shift_days insert public" ON public.shift_days;
DROP POLICY IF EXISTS "shift_days select public" ON public.shift_days;
CREATE POLICY "shift_days select authenticated" ON public.shift_days FOR SELECT TO authenticated USING (true);
CREATE POLICY "shift_days insert authenticated" ON public.shift_days FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

-- Revoke anon access from public Data API roles
REVOKE SELECT ON public.employees FROM anon;
REVOKE SELECT, INSERT ON public.sales_entries FROM anon;
REVOKE SELECT, INSERT ON public.sgf_tickets FROM anon;
REVOKE SELECT, INSERT ON public.shift_days FROM anon;

-- Lock down SECURITY DEFINER functions: revoke broad EXECUTE, grant narrowly
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.match_employees_by_nifs(bigint[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.match_employees_by_nifs(bigint[]) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.admin_get_employee_nifs() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_employee_nifs() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.admin_set_employee_nif(uuid, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_employee_nif(uuid, bigint) TO authenticated;

-- Trigger-only functions: not callable via API
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
