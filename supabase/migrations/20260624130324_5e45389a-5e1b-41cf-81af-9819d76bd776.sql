
-- 1) has_role: switch to SECURITY INVOKER (user can read own user_roles row)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- 2) Drop the permissive "public all" policies
DROP POLICY IF EXISTS "public all"       ON public.employees;
DROP POLICY IF EXISTS "public all"       ON public.products;
DROP POLICY IF EXISTS "public all"       ON public.sales_entries;
DROP POLICY IF EXISTS "public all"       ON public.sgf_tickets;
DROP POLICY IF EXISTS "public all"       ON public.shift_days;
DROP POLICY IF EXISTS "public all"       ON public.weight_overrides;

-- 3) Revoke anon Data API access on all of these tables
REVOKE ALL ON public.employees        FROM anon;
REVOKE ALL ON public.products         FROM anon;
REVOKE ALL ON public.sales_entries    FROM anon;
REVOKE ALL ON public.sgf_tickets      FROM anon;
REVOKE ALL ON public.shift_days       FROM anon;
REVOKE ALL ON public.weight_overrides FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.employees        TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products         TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_entries    TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sgf_tickets      TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shift_days       TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.weight_overrides TO authenticated;

-- 4) New scoped policies

-- employees: any signed-in user can read; only admins can mutate (protects NIF tampering)
CREATE POLICY "employees read authenticated"
  ON public.employees FOR SELECT TO authenticated USING (true);
CREATE POLICY "employees insert admin"
  ON public.employees FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "employees update admin"
  ON public.employees FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "employees delete admin"
  ON public.employees FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- products: any signed-in user can read; only admins mutate
CREATE POLICY "products read authenticated"
  ON public.products FOR SELECT TO authenticated USING (true);
CREATE POLICY "products insert admin"
  ON public.products FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "products update admin"
  ON public.products FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "products delete admin"
  ON public.products FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- weight_overrides: admin-only mutations, read by authenticated
CREATE POLICY "weight_overrides read authenticated"
  ON public.weight_overrides FOR SELECT TO authenticated USING (true);
CREATE POLICY "weight_overrides insert admin"
  ON public.weight_overrides FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "weight_overrides update admin"
  ON public.weight_overrides FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "weight_overrides delete admin"
  ON public.weight_overrides FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- sales_entries: operational data, any signed-in user can read/write
CREATE POLICY "sales_entries read authenticated"
  ON public.sales_entries FOR SELECT TO authenticated USING (true);
CREATE POLICY "sales_entries insert authenticated"
  ON public.sales_entries FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "sales_entries update authenticated"
  ON public.sales_entries FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "sales_entries delete authenticated"
  ON public.sales_entries FOR DELETE TO authenticated USING (true);

-- sgf_tickets
CREATE POLICY "sgf_tickets read authenticated"
  ON public.sgf_tickets FOR SELECT TO authenticated USING (true);
CREATE POLICY "sgf_tickets insert authenticated"
  ON public.sgf_tickets FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "sgf_tickets update authenticated"
  ON public.sgf_tickets FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "sgf_tickets delete authenticated"
  ON public.sgf_tickets FOR DELETE TO authenticated USING (true);

-- shift_days
CREATE POLICY "shift_days read authenticated"
  ON public.shift_days FOR SELECT TO authenticated USING (true);
CREATE POLICY "shift_days insert authenticated"
  ON public.shift_days FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "shift_days update authenticated"
  ON public.shift_days FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "shift_days delete authenticated"
  ON public.shift_days FOR DELETE TO authenticated USING (true);
