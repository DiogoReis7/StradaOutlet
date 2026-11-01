-- ===== 20260624095723_f3c8e942-cb2d-473e-9cbc-27ebc6facfea.sql =====

-- Roles
CREATE TYPE public.app_role AS ENUM ('admin','member');

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles read all authenticated" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles update own" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles insert own" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_roles read own" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- updated_at helper
CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

-- auto profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email,'@',1)));
  -- first user becomes admin
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role='admin') THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'member');
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Domain tables
CREATE TABLE public.employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  username_sgf TEXT,
  nome_sgf TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  ordem INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employees TO authenticated;
GRANT ALL ON public.employees TO service_role;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
CREATE POLICY "employees read all auth" ON public.employees FOR SELECT TO authenticated USING (true);
CREATE POLICY "employees admin write" ON public.employees FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_employees_updated BEFORE UPDATE ON public.employees FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo TEXT NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  categoria TEXT,
  peso NUMERIC(10,4) NOT NULL DEFAULT 0,
  ordem INT NOT NULL DEFAULT 0,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "products read all auth" ON public.products FOR SELECT TO authenticated USING (true);
CREATE POLICY "products admin write" ON public.products FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_products_updated BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.weight_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  peso NUMERIC(10,4) NOT NULL,
  UNIQUE (employee_id, product_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.weight_overrides TO authenticated;
GRANT ALL ON public.weight_overrides TO service_role;
ALTER TABLE public.weight_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wo read all auth" ON public.weight_overrides FOR SELECT TO authenticated USING (true);
CREATE POLICY "wo write auth" ON public.weight_overrides FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.shift_days (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  data DATE NOT NULL,
  horas NUMERIC(5,2),
  estado TEXT,
  UNIQUE (employee_id, data)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shift_days TO authenticated;
GRANT ALL ON public.shift_days TO service_role;
ALTER TABLE public.shift_days ENABLE ROW LEVEL SECURITY;
CREATE POLICY "shifts rw auth" ON public.shift_days FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.sales_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  data DATE NOT NULL,
  quantidade NUMERIC(10,2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (employee_id, product_id, data)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_entries TO authenticated;
GRANT ALL ON public.sales_entries TO service_role;
ALTER TABLE public.sales_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sales rw auth" ON public.sales_entries FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_sales_updated BEFORE UPDATE ON public.sales_entries FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX ON public.sales_entries (data);
CREATE INDEX ON public.sales_entries (employee_id, data);

CREATE TABLE public.sgf_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  senha TEXT NOT NULL,
  servico TEXT,
  staff_username TEXT,
  nome_staff TEXT,
  employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  balcao TEXT,
  emitida_em TIMESTAMPTZ NOT NULL,
  inicio_em TIMESTAMPTZ,
  fim_em TIMESTAMPTZ,
  espera_s INT,
  atendimento_s INT,
  estado TEXT,
  eh_marcacao BOOLEAN,
  paperless BOOLEAN
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sgf_tickets TO authenticated;
GRANT ALL ON public.sgf_tickets TO service_role;
ALTER TABLE public.sgf_tickets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sgf rw auth" ON public.sgf_tickets FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX ON public.sgf_tickets (emitida_em);
CREATE INDEX ON public.sgf_tickets (employee_id);
CREATE INDEX ON public.sgf_tickets (estado);

-- ===== 20260624095743_6e309572-a883-451c-95b1-0be96ad52b12.sql =====

-- Replace permissive policies with auth.uid() IS NOT NULL
DROP POLICY IF EXISTS "wo read all auth" ON public.weight_overrides;
DROP POLICY IF EXISTS "wo write auth" ON public.weight_overrides;
CREATE POLICY "wo all auth" ON public.weight_overrides FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "shifts rw auth" ON public.shift_days;
CREATE POLICY "shifts all auth" ON public.shift_days FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "sales rw auth" ON public.sales_entries;
CREATE POLICY "sales all auth" ON public.sales_entries FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "sgf rw auth" ON public.sgf_tickets;
CREATE POLICY "sgf all auth" ON public.sgf_tickets FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- Lock SECURITY DEFINER functions
REVOKE ALL ON FUNCTION public.has_role(UUID, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;

-- ===== 20260624101104_a922ae94-5264-412a-b9a8-d8b9eaf0168e.sql =====

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

-- ===== 20260624125523_ab2df577-ad10-42a0-be5e-cfa93b397363.sql =====

ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS nif bigint;
CREATE UNIQUE INDEX IF NOT EXISTS employees_nif_uniq ON public.employees(nif) WHERE nif IS NOT NULL;

ALTER TABLE public.shift_days ADD COLUMN IF NOT EXISTS descricao text;
CREATE UNIQUE INDEX IF NOT EXISTS shift_days_emp_data_uniq ON public.shift_days(employee_id, data);

-- ===== 20260624130324_5e45389a-5e1b-41cf-81af-9819d76bd776.sql =====

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

-- ===== 20260624130340_af9b85a9-b22b-4642-9839-b40a2547a0ec.sql =====

-- sales_entries
DROP POLICY IF EXISTS "sales_entries insert authenticated" ON public.sales_entries;
DROP POLICY IF EXISTS "sales_entries update authenticated" ON public.sales_entries;
DROP POLICY IF EXISTS "sales_entries delete authenticated" ON public.sales_entries;
CREATE POLICY "sales_entries insert authenticated"
  ON public.sales_entries FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "sales_entries update authenticated"
  ON public.sales_entries FOR UPDATE TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "sales_entries delete authenticated"
  ON public.sales_entries FOR DELETE TO authenticated
  USING (auth.uid() IS NOT NULL);

-- sgf_tickets
DROP POLICY IF EXISTS "sgf_tickets insert authenticated" ON public.sgf_tickets;
DROP POLICY IF EXISTS "sgf_tickets update authenticated" ON public.sgf_tickets;
DROP POLICY IF EXISTS "sgf_tickets delete authenticated" ON public.sgf_tickets;
CREATE POLICY "sgf_tickets insert authenticated"
  ON public.sgf_tickets FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "sgf_tickets update authenticated"
  ON public.sgf_tickets FOR UPDATE TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "sgf_tickets delete authenticated"
  ON public.sgf_tickets FOR DELETE TO authenticated
  USING (auth.uid() IS NOT NULL);

-- shift_days
DROP POLICY IF EXISTS "shift_days insert authenticated" ON public.shift_days;
DROP POLICY IF EXISTS "shift_days update authenticated" ON public.shift_days;
DROP POLICY IF EXISTS "shift_days delete authenticated" ON public.shift_days;
CREATE POLICY "shift_days insert authenticated"
  ON public.shift_days FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "shift_days update authenticated"
  ON public.shift_days FOR UPDATE TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "shift_days delete authenticated"
  ON public.shift_days FOR DELETE TO authenticated
  USING (auth.uid() IS NOT NULL);

-- ===== 20260624130742_8a33a4ee-78b0-4f4a-85ef-e8a0cc1f8333.sql =====

ALTER TABLE public.sales_entries REPLICA IDENTITY FULL;
ALTER TABLE public.sgf_tickets REPLICA IDENTITY FULL;
ALTER TABLE public.shift_days REPLICA IDENTITY FULL;
ALTER TABLE public.employees REPLICA IDENTITY FULL;
ALTER TABLE public.products REPLICA IDENTITY FULL;
ALTER TABLE public.weight_overrides REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='sales_entries') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.sales_entries;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='sgf_tickets') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.sgf_tickets;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='shift_days') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.shift_days;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='employees') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.employees;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='products') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.products;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='weight_overrides') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.weight_overrides;
  END IF;
END $$;

-- ===== 20260624133924_7e7e29de-41e6-430e-9760-f2b9dee9ef91.sql =====

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

-- ===== 20260624134107_6e01f9e2-326f-46cb-a543-783b14c96826.sql =====

-- sales_entries: split the previous "ALL" public policy
DROP POLICY IF EXISTS "sales_entries public all" ON public.sales_entries;
CREATE POLICY "sales_entries select public" ON public.sales_entries
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "sales_entries insert public" ON public.sales_entries
  FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "sales_entries update public" ON public.sales_entries
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "sales_entries delete admin" ON public.sales_entries
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- sgf_tickets
DROP POLICY IF EXISTS "sgf_tickets public all" ON public.sgf_tickets;
CREATE POLICY "sgf_tickets select public" ON public.sgf_tickets
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "sgf_tickets insert public" ON public.sgf_tickets
  FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "sgf_tickets update public" ON public.sgf_tickets
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "sgf_tickets delete admin" ON public.sgf_tickets
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- shift_days
DROP POLICY IF EXISTS "shift_days public all" ON public.shift_days;
CREATE POLICY "shift_days select public" ON public.shift_days
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "shift_days insert public" ON public.shift_days
  FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "shift_days update public" ON public.shift_days
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "shift_days delete admin" ON public.shift_days
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- ===== 20260624134446_5e390e59-fd9f-46fc-9289-cd54f75523ed.sql =====

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

-- ===== 20260624135826_14813afa-fee7-4451-8dd2-d1718cc5fbc5.sql =====
-- Restore SELECT on nif to authenticated (admin uses authenticated session in this app).
-- Anon (públicas) continuam sem acesso ao NIF.
GRANT SELECT (nif) ON public.employees TO authenticated;

-- ===== 20260624141025_9ebabeaa-3d41-4b61-9127-7c969ae5811d.sql =====
-- Add categoria column to employees (e.g. Móvel, Fixo, TVs, Energia)
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS categoria text;

-- Restrict NIF visibility to admins only.
-- Revoke the column-level SELECT previously granted to authenticated/anon.
REVOKE SELECT (nif) ON public.employees FROM authenticated;
DO $$ BEGIN
  EXECUTE 'REVOKE SELECT (nif) ON public.employees FROM anon';
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Admin-only RPC to fetch employee NIFs
CREATE OR REPLACE FUNCTION public.admin_get_employee_nifs()
RETURNS TABLE(id uuid, nif bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.id, e.nif::bigint
  FROM public.employees e
  WHERE public.has_role(auth.uid(), 'admin')
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_employee_nifs() TO authenticated;

-- Admin-only RPC to set an employee NIF (writes still allowed via column update,
-- but this gives a clean checked path the UI uses).
CREATE OR REPLACE FUNCTION public.admin_set_employee_nif(_id uuid, _nif bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  UPDATE public.employees SET nif = _nif WHERE id = _id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_set_employee_nif(uuid, bigint) TO authenticated;
-- ===== 20260624141710_943f6c30-d7ef-4235-8058-188ed8405f0b.sql =====

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

-- ===== 20260624142108_290b7661-e57c-43f5-8183-5965ff848ea1.sql =====

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

-- ===== 20260624142253_c796f553-ca30-4127-86f9-6ef938e73fac.sql =====
GRANT SELECT (username_sgf, nome_sgf) ON public.employees TO anon;
-- ===== 20260624142808_cd1287a3-8697-4b22-a63f-57b28c78d696.sql =====
CREATE OR REPLACE FUNCTION public.set_employee_categorias_by_nif(p_pairs jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r jsonb;
  updated int := 0;
  rc int;
BEGIN
  FOR r IN SELECT * FROM jsonb_array_elements(p_pairs)
  LOOP
    UPDATE public.employees
       SET categoria = NULLIF(trim(r->>'categoria'), '')
     WHERE nif = ((r->>'nif')::bigint);
    GET DIAGNOSTICS rc = ROW_COUNT;
    updated := updated + rc;
  END LOOP;
  RETURN updated;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_employee_categorias_by_nif(jsonb) TO anon, authenticated;
-- ===== 20260624144105_809a70b5-aa72-4e20-9d99-c0a581a7017c.sql =====

-- Drop public read policy on employees (exposes NIF)
DROP POLICY IF EXISTS "employees read public" ON public.employees;

-- sgf_tickets: drop public read + public insert
DROP POLICY IF EXISTS "sgf_tickets select public" ON public.sgf_tickets;
DROP POLICY IF EXISTS "sgf_tickets insert public" ON public.sgf_tickets;
CREATE POLICY "sgf_tickets select authenticated" ON public.sgf_tickets
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "sgf_tickets insert authenticated" ON public.sgf_tickets
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

-- shift_days: drop public read + public insert
DROP POLICY IF EXISTS "shift_days select public" ON public.shift_days;
DROP POLICY IF EXISTS "shift_days insert public" ON public.shift_days;
CREATE POLICY "shift_days select authenticated" ON public.shift_days
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "shift_days insert authenticated" ON public.shift_days
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

-- sales_entries: drop public read + public insert
DROP POLICY IF EXISTS "sales_entries select public" ON public.sales_entries;
DROP POLICY IF EXISTS "sales_entries insert public" ON public.sales_entries;
CREATE POLICY "sales_entries select authenticated" ON public.sales_entries
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "sales_entries insert authenticated" ON public.sales_entries
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

-- Revoke EXECUTE on SECURITY DEFINER functions from PUBLIC and anon
REVOKE ALL ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.match_employees_by_nifs(bigint[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_get_employee_nifs() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_employee_nif(uuid, bigint) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_employee_categorias_by_nif(jsonb) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.match_employees_by_nifs(bigint[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_employee_nifs() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_employee_nif(uuid, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_employee_categorias_by_nif(jsonb) TO authenticated;

-- ===== 20260624144402_a2850960-dbd7-4b49-a94a-5efd062fbaa8.sql =====

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

-- ===== 20260624150216_2d011220-c8e0-4d2c-8785-d8b4bfe5a3d2.sql =====

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

-- ===== 20260626204709_39a42d35-f77c-4f65-a2c7-adeb5421516a.sql =====
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS objetivo_mes TEXT, ADD COLUMN IF NOT EXISTS notas TEXT;
-- ===== 20260626212634_a1d633f4-7633-475d-ac17-68f7ce2f5377.sql =====

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

-- ===== 20260702120246_c12a72f5-dc2d-4552-86f0-2e1ce556969a.sql =====

CREATE TABLE public.challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo text NOT NULL,
  descricao text,
  tipo text NOT NULL CHECK (tipo IN ('diario','semanal','mensal')),
  start_date date NOT NULL,
  end_date date NOT NULL,
  scope text NOT NULL DEFAULT 'loja' CHECK (scope IN ('loja','individual')),
  metric text NOT NULL DEFAULT 'pts',
  target numeric NOT NULL DEFAULT 0,
  premio text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.challenges TO authenticated;
GRANT SELECT ON public.challenges TO anon;
GRANT ALL ON public.challenges TO service_role;

ALTER TABLE public.challenges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read challenges" ON public.challenges FOR SELECT USING (true);
CREATE POLICY "Admins manage challenges insert" ON public.challenges FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage challenges update" ON public.challenges FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage challenges delete" ON public.challenges FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER challenges_set_updated_at
BEFORE UPDATE ON public.challenges
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ===== 20260705083753_0cda6beb-2735-480f-810e-39b59839c99b.sql =====

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

-- ===== 20260708155011_1b834547-d46b-40e2-97f7-7e31ff8ccd5b.sql =====

CREATE TABLE public.nps_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL,
  notas TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nps_snapshots TO authenticated;
GRANT ALL ON public.nps_snapshots TO service_role;
ALTER TABLE public.nps_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read nps_snapshots" ON public.nps_snapshots FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth write nps_snapshots" ON public.nps_snapshots FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.nps_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id UUID NOT NULL REFERENCES public.nps_snapshots(id) ON DELETE CASCADE,
  employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  raw_name TEXT NOT NULL,
  code TEXT,
  inqueritos INTEGER NOT NULL DEFAULT 0,
  netscore NUMERIC(6,2) NOT NULL DEFAULT 0,
  det_pct NUMERIC(6,4) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX nps_scores_snapshot_idx ON public.nps_scores(snapshot_id);
CREATE INDEX nps_scores_employee_idx ON public.nps_scores(employee_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nps_scores TO authenticated;
GRANT ALL ON public.nps_scores TO service_role;
ALTER TABLE public.nps_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read nps_scores" ON public.nps_scores FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth write nps_scores" ON public.nps_scores FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.nps_surveys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id UUID NOT NULL REFERENCES public.nps_snapshots(id) ON DELETE CASCADE,
  employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  ext_id TEXT,
  data DATE,
  semana TEXT,
  area_n1 TEXT,
  tip_n1 TEXT,
  tip_n2 TEXT,
  tip_n3 TEXT,
  tip_n4 TEXT,
  tip_n5 TEXT,
  tip_n6 TEXT,
  motivo_macro TEXT,
  nota_global INTEGER,
  classe TEXT,
  raw_name TEXT,
  code TEXT,
  cav TEXT,
  segmento TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX nps_surveys_snapshot_idx ON public.nps_surveys(snapshot_id);
CREATE INDEX nps_surveys_employee_idx ON public.nps_surveys(employee_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nps_surveys TO authenticated;
GRANT ALL ON public.nps_surveys TO service_role;
ALTER TABLE public.nps_surveys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read nps_surveys" ON public.nps_surveys FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth write nps_surveys" ON public.nps_surveys FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER trg_nps_snapshots_updated BEFORE UPDATE ON public.nps_snapshots FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ===== 20260709093834_10315f0d-a857-4c24-9826-ed4dfedb273a.sql =====
ALTER TABLE public.nps_surveys ADD COLUMN IF NOT EXISTS confirmacao TEXT;
-- ===== 20260709094043_16e3aeb1-2b5c-4412-8118-e85548af6027.sql =====
ALTER TABLE public.nps_surveys 
  ADD COLUMN IF NOT EXISTS tipo TEXT,
  ADD COLUMN IF NOT EXISTS nota_pessoa INTEGER;
-- ===== 20260709095450_1cab6c96-69d7-4b11-b73a-a9126dc388dc.sql =====
-- Evita duplicar inquéritos ao reimportar (mesmo snapshot + mesmo ID de origem)
CREATE UNIQUE INDEX IF NOT EXISTS nps_surveys_snapshot_ext_uidx
  ON public.nps_surveys (snapshot_id, ext_id)
  WHERE ext_id IS NOT NULL;

-- Aceleradores de consulta
CREATE INDEX IF NOT EXISTS nps_surveys_snapshot_emp_idx
  ON public.nps_surveys (snapshot_id, employee_id);

CREATE INDEX IF NOT EXISTS nps_scores_snapshot_idx
  ON public.nps_scores (snapshot_id);

CREATE INDEX IF NOT EXISTS nps_surveys_data_idx
  ON public.nps_surveys (data DESC);
-- ===== 20260709100231_9189bab5-89d1-463d-98be-2b3e7d0e881f.sql =====
-- Remove duplicate (snapshot_id, ext_id) rows keeping newest, then create a full unique constraint usable by ON CONFLICT
DELETE FROM public.nps_surveys a
USING public.nps_surveys b
WHERE a.snapshot_id = b.snapshot_id
  AND a.ext_id IS NOT NULL
  AND b.ext_id IS NOT NULL
  AND a.ext_id = b.ext_id
  AND a.ctid < b.ctid;

DROP INDEX IF EXISTS public.nps_surveys_snapshot_ext_uidx;

ALTER TABLE public.nps_surveys
  ADD CONSTRAINT nps_surveys_snapshot_ext_key UNIQUE (snapshot_id, ext_id);
-- ===== 20260709102117_4590476f-c6fc-48be-a4ad-072a4fc884a8.sql =====
CREATE TABLE public.challenge_popup_seen (
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  seen_date date NOT NULL,
  digest text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (employee_id, seen_date, digest)
);

GRANT SELECT, INSERT ON public.challenge_popup_seen TO authenticated;
GRANT ALL ON public.challenge_popup_seen TO service_role;

ALTER TABLE public.challenge_popup_seen ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read popup seen"
  ON public.challenge_popup_seen FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Authenticated can record popup seen"
  ON public.challenge_popup_seen FOR INSERT
  TO authenticated WITH CHECK (true);
-- ===== 20260721152407_b25102f1-53c2-4680-8461-8021d358d0f6.sql =====
-- Restringir coluna nif a admins: revogar SELECT direto; leitura continua via RPC admin_get_employee_nifs
REVOKE SELECT (nif) ON public.employees FROM authenticated;
REVOKE SELECT (nif) ON public.employees FROM anon;
-- ===== 20260803113818_0c456885-7324-4974-82da-16088cf7a143.sql =====
INSERT INTO public.products (codigo, nome, categoria, peso, ordem, ativo)
VALUES ('migracoes-tv', 'Migração TV', 'fixo', 0.5, 6, true)
ON CONFLICT DO NOTHING;

UPDATE public.products SET ordem = ordem + 1 WHERE ordem >= 6 AND codigo <> 'migracoes-tv';
-- ===== 20260826231504_095c53cc-8977-44f8-94ed-39c68c327806.sql =====
-- 1) Harden SECURITY DEFINER functions with admin checks
CREATE OR REPLACE FUNCTION public.set_employee_categorias_by_nif(p_pairs jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r jsonb;
  updated int := 0;
  rc int;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  FOR r IN SELECT * FROM jsonb_array_elements(p_pairs)
  LOOP
    UPDATE public.employees
       SET categoria = NULLIF(trim(r->>'categoria'), '')
     WHERE nif = ((r->>'nif')::bigint);
    GET DIAGNOSTICS rc = ROW_COUNT;
    updated := updated + rc;
  END LOOP;
  RETURN updated;
END;
$function$;

-- 2) Monthly points target per employee
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS objetivo_pontos numeric;

-- 3) Activity log (audit) for sales and tickets
CREATE TABLE IF NOT EXISTS public.activity_log (
  id uuid primary key default gen_random_uuid(),
  tabela text not null,
  accao text not null,
  registo_id uuid,
  user_id uuid,
  detalhe jsonb,
  created_at timestamptz not null default now()
);
GRANT SELECT ON public.activity_log TO authenticated;
GRANT ALL ON public.activity_log TO service_role;
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "activity_log read admin" ON public.activity_log;
CREATE POLICY "activity_log read admin" ON public.activity_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.log_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  rid uuid;
  det jsonb;
BEGIN
  IF TG_OP = 'DELETE' THEN
    rid := OLD.id; det := to_jsonb(OLD);
  ELSE
    rid := NEW.id; det := to_jsonb(NEW);
  END IF;
  INSERT INTO public.activity_log (tabela, accao, registo_id, user_id, detalhe)
  VALUES (TG_TABLE_NAME, lower(TG_OP), rid, auth.uid(), det);
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_log_sales ON public.sales_entries;
CREATE TRIGGER trg_log_sales AFTER INSERT OR UPDATE OR DELETE ON public.sales_entries
FOR EACH ROW EXECUTE FUNCTION public.log_activity();

CREATE INDEX IF NOT EXISTS idx_activity_log_created ON public.activity_log (created_at DESC);
-- ===== 20260826231527_3e4842e8-6e86-445d-a609-5a08f9f03794.sql =====
REVOKE ALL ON FUNCTION public.log_activity() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.match_employees_by_nifs(p_nifs bigint[])
 RETURNS TABLE(nif bigint, id uuid, nome text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT e.nif::bigint, e.id, e.nome
  FROM public.employees e
  WHERE e.nif = ANY(p_nifs) AND public.has_role(auth.uid(), 'admin')
$function$;
REVOKE ALL ON FUNCTION public.match_employees_by_nifs(bigint[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.match_employees_by_nifs(bigint[]) TO authenticated;
REVOKE ALL ON FUNCTION public.admin_get_employee_nifs() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_employee_nifs() TO authenticated;
REVOKE ALL ON FUNCTION public.admin_set_employee_nif(uuid, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_employee_nif(uuid, bigint) TO authenticated;
REVOKE ALL ON FUNCTION public.set_employee_categorias_by_nif(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_employee_categorias_by_nif(jsonb) TO authenticated;
-- ===== 20260826232254_27e6f267-ad5d-44f4-ab97-7892326eb0a6.sql =====
ALTER PUBLICATION supabase_realtime ADD TABLE public.nps_snapshots;
ALTER PUBLICATION supabase_realtime ADD TABLE public.nps_scores;
ALTER PUBLICATION supabase_realtime ADD TABLE public.nps_surveys;
ALTER PUBLICATION supabase_realtime ADD TABLE public.challenges;
-- ===== 20260826233925_489e3752-9b96-415a-8e2f-3a87c6dc4867.sql =====
CREATE TABLE public.telemarketing_slots (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  data date NOT NULL,
  hora smallint NOT NULL,
  feito boolean NOT NULL DEFAULT true,
  vendas integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, data, hora)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.telemarketing_slots TO authenticated;
GRANT ALL ON public.telemarketing_slots TO service_role;

ALTER TABLE public.telemarketing_slots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "telemarketing select authenticated" ON public.telemarketing_slots FOR SELECT TO authenticated USING (true);
CREATE POLICY "telemarketing insert authenticated" ON public.telemarketing_slots FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "telemarketing update authenticated" ON public.telemarketing_slots FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "telemarketing delete authenticated" ON public.telemarketing_slots FOR DELETE TO authenticated USING (true);

CREATE TRIGGER trg_telemarketing_updated BEFORE UPDATE ON public.telemarketing_slots
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER PUBLICATION supabase_realtime ADD TABLE public.telemarketing_slots;
-- ===== 20260826234830_6a9c5a46-e978-4ccc-a53c-15d2aae49e84.sql =====
CREATE TABLE public.day_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data date NOT NULL,
  texto text NOT NULL,
  autor text,
  user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.day_notes TO authenticated;
GRANT ALL ON public.day_notes TO service_role;

ALTER TABLE public.day_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "day_notes select authenticated" ON public.day_notes FOR SELECT TO authenticated USING (true);
CREATE POLICY "day_notes insert authenticated" ON public.day_notes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "day_notes update authenticated" ON public.day_notes FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "day_notes delete authenticated" ON public.day_notes FOR DELETE TO authenticated USING (true);

CREATE INDEX day_notes_data_idx ON public.day_notes (data DESC);

CREATE TRIGGER trg_day_notes_updated BEFORE UPDATE ON public.day_notes
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER PUBLICATION supabase_realtime ADD TABLE public.day_notes;
-- ===== 20260827083037_efa37ed4-1227-4d9b-b602-a300f2e9d23e.sql =====
DROP POLICY IF EXISTS "sales_entries insert authenticated" ON public.sales_entries;
DROP POLICY IF EXISTS "sales_entries update authenticated" ON public.sales_entries;
DROP POLICY IF EXISTS "sales_entries delete authenticated" ON public.sales_entries;
DROP POLICY IF EXISTS "sales rw auth" ON public.sales_entries;

CREATE POLICY "sales_entries insert available or admin"
ON public.sales_entries
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR NOT EXISTS (
    SELECT 1
    FROM public.shift_days sd
    WHERE sd.employee_id = sales_entries.employee_id
      AND sd.data = sales_entries.data
      AND lower(coalesce(sd.estado, '') || ' ' || coalesce(sd.descricao, '')) LIKE '%baixa%'
  )
);

CREATE POLICY "sales_entries update available or admin"
ON public.sales_entries
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR NOT EXISTS (
    SELECT 1
    FROM public.shift_days sd
    WHERE sd.employee_id = sales_entries.employee_id
      AND sd.data = sales_entries.data
      AND lower(coalesce(sd.estado, '') || ' ' || coalesce(sd.descricao, '')) LIKE '%baixa%'
  )
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR NOT EXISTS (
    SELECT 1
    FROM public.shift_days sd
    WHERE sd.employee_id = sales_entries.employee_id
      AND sd.data = sales_entries.data
      AND lower(coalesce(sd.estado, '') || ' ' || coalesce(sd.descricao, '')) LIKE '%baixa%'
  )
);

CREATE POLICY "sales_entries delete available or admin"
ON public.sales_entries
FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR NOT EXISTS (
    SELECT 1
    FROM public.shift_days sd
    WHERE sd.employee_id = sales_entries.employee_id
      AND sd.data = sales_entries.data
      AND lower(coalesce(sd.estado, '') || ' ' || coalesce(sd.descricao, '')) LIKE '%baixa%'
  )
);
-- ===== 20260827190102_d4c98f59-fc1d-4f39-b7de-5d5fcfe79fde.sql =====
-- CHECKLISTS
CREATE TABLE public.checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL DEFAULT 'abertura',
  texto text NOT NULL,
  ordem integer NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.checklist_items TO authenticated;
GRANT ALL ON public.checklist_items TO service_role;
ALTER TABLE public.checklist_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "checklist_items read" ON public.checklist_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "checklist_items insert admin" ON public.checklist_items FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "checklist_items update admin" ON public.checklist_items FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "checklist_items delete admin" ON public.checklist_items FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.checklist_marks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.checklist_items(id) ON DELETE CASCADE,
  data date NOT NULL,
  feito boolean NOT NULL DEFAULT true,
  marcado_por text,
  user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (item_id, data)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.checklist_marks TO authenticated;
GRANT ALL ON public.checklist_marks TO service_role;
ALTER TABLE public.checklist_marks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "checklist_marks read" ON public.checklist_marks FOR SELECT TO authenticated USING (true);
CREATE POLICY "checklist_marks insert" ON public.checklist_marks FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "checklist_marks update" ON public.checklist_marks FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "checklist_marks delete" ON public.checklist_marks FOR DELETE TO authenticated USING (true);

-- AUSENCIAS
CREATE TABLE public.absences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  tipo text NOT NULL DEFAULT 'falta',
  data_inicio date NOT NULL,
  data_fim date NOT NULL,
  motivo text,
  estado text NOT NULL DEFAULT 'pendente',
  notas text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.absences TO authenticated;
GRANT ALL ON public.absences TO service_role;
ALTER TABLE public.absences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "absences read" ON public.absences FOR SELECT TO authenticated USING (true);
CREATE POLICY "absences insert admin" ON public.absences FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "absences update admin" ON public.absences FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "absences delete admin" ON public.absences FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_absences_updated BEFORE UPDATE ON public.absences FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- AVISOS
CREATE TABLE public.announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo text NOT NULL,
  corpo text,
  prioridade text NOT NULL DEFAULT 'normal',
  ativo boolean NOT NULL DEFAULT true,
  expira_em date,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.announcements TO authenticated;
GRANT ALL ON public.announcements TO service_role;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "announcements read" ON public.announcements FOR SELECT TO authenticated USING (true);
CREATE POLICY "announcements insert admin" ON public.announcements FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "announcements update admin" ON public.announcements FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "announcements delete admin" ON public.announcements FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_announcements_updated BEFORE UPDATE ON public.announcements FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.announcement_reads (
  announcement_id uuid NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (announcement_id, user_id)
);
GRANT SELECT, INSERT, DELETE ON public.announcement_reads TO authenticated;
GRANT ALL ON public.announcement_reads TO service_role;
ALTER TABLE public.announcement_reads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "announcement_reads read" ON public.announcement_reads FOR SELECT TO authenticated USING (true);
CREATE POLICY "announcement_reads insert own" ON public.announcement_reads FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "announcement_reads delete own" ON public.announcement_reads FOR DELETE TO authenticated USING (user_id = auth.uid());

-- BADGES
CREATE TABLE public.badges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text NOT NULL UNIQUE,
  nome text NOT NULL,
  descricao text,
  icone text NOT NULL DEFAULT 'trophy',
  cor text NOT NULL DEFAULT 'var(--neon-yellow)',
  ordem integer NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.badges TO authenticated;
GRANT ALL ON public.badges TO service_role;
ALTER TABLE public.badges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "badges read" ON public.badges FOR SELECT TO authenticated USING (true);
CREATE POLICY "badges insert admin" ON public.badges FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "badges update admin" ON public.badges FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "badges delete admin" ON public.badges FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.employee_badges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  badge_id uuid NOT NULL REFERENCES public.badges(id) ON DELETE CASCADE,
  data date NOT NULL DEFAULT CURRENT_DATE,
  motivo text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, badge_id, data)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_badges TO authenticated;
GRANT ALL ON public.employee_badges TO service_role;
ALTER TABLE public.employee_badges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "employee_badges read" ON public.employee_badges FOR SELECT TO authenticated USING (true);
CREATE POLICY "employee_badges insert admin" ON public.employee_badges FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "employee_badges update admin" ON public.employee_badges FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "employee_badges delete admin" ON public.employee_badges FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- REUNIOES 1:1
CREATE TABLE public.one_on_ones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  data date NOT NULL,
  hora text,
  assunto text,
  notas text,
  follow_up text,
  estado text NOT NULL DEFAULT 'agendada',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.one_on_ones TO authenticated;
GRANT ALL ON public.one_on_ones TO service_role;
ALTER TABLE public.one_on_ones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "one_on_ones read" ON public.one_on_ones FOR SELECT TO authenticated USING (true);
CREATE POLICY "one_on_ones insert admin" ON public.one_on_ones FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "one_on_ones update admin" ON public.one_on_ones FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "one_on_ones delete admin" ON public.one_on_ones FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- SEEDS
INSERT INTO public.checklist_items (tipo, texto, ordem) VALUES
 ('abertura','Abrir loja e desativar alarme',1),
 ('abertura','Ligar sistemas (PC, SGF, TPA)',2),
 ('abertura','Conferir fundo de caixa',3),
 ('abertura','Verificar montras e material promocional',4),
 ('abertura','Limpeza e arrumação do espaço',5),
 ('abertura','Conferir stock de SIMs e equipamentos',6),
 ('fecho','Fecho de caixa e conferência',1),
 ('fecho','Registar vendas do dia no PDS',2),
 ('fecho','Arrumar material e recolher expositores',3),
 ('fecho','Desligar sistemas e equipamentos',4),
 ('fecho','Ativar alarme e fechar loja',5);

INSERT INTO public.badges (codigo, nome, descricao, icone, cor, ordem) VALUES
 ('top-mes','Top do Mês','Mais pontos no mês','trophy','var(--neon-yellow)',1),
 ('nps-hero','Herói do NPS','Melhor NPS do mês','heart','var(--neon-pink)',2),
 ('zero-detratores','Zero Detratores','Mês sem detratores','shield','var(--neon-green)',3),
 ('recordista-dia','Recorde do Dia','Mais vendas num único dia','zap','var(--neon-blue)',4),
 ('tele-star','Estrela do Telemarketing','Mais horas de telemarketing','phone','var(--neon-violet)',5),
 ('sempre-presente','Sempre Presente','Mês sem faltas','calendar','var(--neon-green)',6);
-- ===== 20260828060724_a879fa43-6b2f-4570-a0fc-8ac00001517a.sql =====
ALTER TABLE public.announcements ADD COLUMN IF NOT EXISTS employee_id uuid REFERENCES public.employees(id) ON DELETE CASCADE;

CREATE OR REPLACE FUNCTION public.current_employee_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.id
  FROM public.employees e
  WHERE e.username_sgf IS NOT NULL
    AND lower(trim(e.username_sgf)) = split_part(lower(coalesce((auth.jwt() ->> 'email'), '')), '@', 1)
  LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION public.current_employee_id() TO authenticated;

DROP POLICY IF EXISTS "announcements read" ON public.announcements;
CREATE POLICY "announcements read" ON public.announcements
FOR SELECT TO authenticated
USING (
  employee_id IS NULL
  OR employee_id = public.current_employee_id()
  OR public.has_role(auth.uid(), 'admin')
);
-- ===== 20260828060739_b2ed5e42-10ce-4de1-8d48-af63f4c64909.sql =====
REVOKE EXECUTE ON FUNCTION public.current_employee_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_employee_id() TO authenticated;
-- ===== 20260831031820_19b0a450-03c2-4fd0-8643-a3127036dfa0.sql =====
DROP POLICY IF EXISTS "one_on_ones read" ON public.one_on_ones;
CREATE POLICY "one_on_ones read own or admin" ON public.one_on_ones FOR SELECT TO authenticated
USING (employee_id = public.current_employee_id() OR public.has_role(auth.uid(), 'admin'::app_role));
-- ===== 20260831125153_c16a7b3e-e4a0-4341-b249-abc692a7ec24.sql =====
REVOKE EXECUTE ON FUNCTION public.admin_get_employee_nifs() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_set_employee_nif(uuid, bigint) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.current_employee_id() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.match_employees_by_nifs(bigint[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_employee_categorias_by_nif(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_employee_nifs() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_employee_nif(uuid, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_employee_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.match_employees_by_nifs(bigint[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_employee_categorias_by_nif(jsonb) TO authenticated;
