CREATE OR REPLACE FUNCTION public.set_employee_categorias_by_nif(p_pairs jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r jsonb;
  updated int := 0;
  rc int;
BEGIN
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
$$;

GRANT EXECUTE ON FUNCTION public.set_employee_categorias_by_nif(jsonb) TO anon, authenticated;