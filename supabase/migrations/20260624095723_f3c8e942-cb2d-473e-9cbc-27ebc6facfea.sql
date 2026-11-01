
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
