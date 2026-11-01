
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employees TO authenticated;
GRANT ALL ON public.employees TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_entries TO authenticated;
GRANT ALL ON public.sales_entries TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sgf_tickets TO authenticated;
GRANT ALL ON public.sgf_tickets TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.shift_days TO authenticated;
GRANT ALL ON public.shift_days TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.weight_overrides TO authenticated;
GRANT ALL ON public.weight_overrides TO service_role;

GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
