
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
