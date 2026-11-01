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