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