
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
