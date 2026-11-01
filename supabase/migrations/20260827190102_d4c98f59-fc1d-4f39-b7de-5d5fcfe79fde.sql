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