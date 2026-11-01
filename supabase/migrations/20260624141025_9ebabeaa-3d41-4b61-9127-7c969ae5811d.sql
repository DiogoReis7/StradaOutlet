-- Add categoria column to employees (e.g. Móvel, Fixo, TVs, Energia)
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS categoria text;

-- Restrict NIF visibility to admins only.
-- Revoke the column-level SELECT previously granted to authenticated/anon.
REVOKE SELECT (nif) ON public.employees FROM authenticated;
DO $$ BEGIN
  EXECUTE 'REVOKE SELECT (nif) ON public.employees FROM anon';
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Admin-only RPC to fetch employee NIFs
CREATE OR REPLACE FUNCTION public.admin_get_employee_nifs()
RETURNS TABLE(id uuid, nif bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.id, e.nif::bigint
  FROM public.employees e
  WHERE public.has_role(auth.uid(), 'admin')
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_employee_nifs() TO authenticated;

-- Admin-only RPC to set an employee NIF (writes still allowed via column update,
-- but this gives a clean checked path the UI uses).
CREATE OR REPLACE FUNCTION public.admin_set_employee_nif(_id uuid, _nif bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  UPDATE public.employees SET nif = _nif WHERE id = _id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_set_employee_nif(uuid, bigint) TO authenticated;