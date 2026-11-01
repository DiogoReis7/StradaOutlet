
-- 1) Restrict UPDATE on operational tables to admin (DELETE already admin-only).
DROP POLICY IF EXISTS "sales_entries update public" ON public.sales_entries;
CREATE POLICY "sales_entries update admin" ON public.sales_entries
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "sgf_tickets update public" ON public.sgf_tickets;
CREATE POLICY "sgf_tickets update admin" ON public.sgf_tickets
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "shift_days update public" ON public.shift_days;
CREATE POLICY "shift_days update admin" ON public.shift_days
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 2) Hide NIF column from non-admin readers via column-level grants.
REVOKE SELECT ON public.employees FROM anon, authenticated;
GRANT SELECT (id, nome, slug, username_sgf, nome_sgf, ativo, ordem, created_at, updated_at)
  ON public.employees TO anon, authenticated;
-- Admin reads NIF through the security-definer RPC below, so no column grant needed for nif.

-- 3) Safe NIF matching RPC: caller already has NIFs from the Sisqual file,
--    and only receives id+nome for matched rows. This does NOT leak the
--    full NIF directory to anyone.
CREATE OR REPLACE FUNCTION public.match_employees_by_nifs(p_nifs bigint[])
RETURNS TABLE (nif bigint, id uuid, nome text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.nif::bigint, e.id, e.nome
  FROM public.employees e
  WHERE e.nif = ANY(p_nifs)
$$;

REVOKE ALL ON FUNCTION public.match_employees_by_nifs(bigint[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.match_employees_by_nifs(bigint[]) TO anon, authenticated;
