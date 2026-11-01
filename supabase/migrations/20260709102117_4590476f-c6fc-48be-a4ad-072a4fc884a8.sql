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