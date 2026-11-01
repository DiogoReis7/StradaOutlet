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