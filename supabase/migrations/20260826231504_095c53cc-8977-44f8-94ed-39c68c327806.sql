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