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