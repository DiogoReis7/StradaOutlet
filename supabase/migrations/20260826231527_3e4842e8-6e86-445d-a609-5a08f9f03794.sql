REVOKE ALL ON FUNCTION public.log_activity() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.match_employees_by_nifs(p_nifs bigint[])
 RETURNS TABLE(nif bigint, id uuid, nome text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT e.nif::bigint, e.id, e.nome
  FROM public.employees e
  WHERE e.nif = ANY(p_nifs) AND public.has_role(auth.uid(), 'admin')
$function$;
REVOKE ALL ON FUNCTION public.match_employees_by_nifs(bigint[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.match_employees_by_nifs(bigint[]) TO authenticated;
REVOKE ALL ON FUNCTION public.admin_get_employee_nifs() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_employee_nifs() TO authenticated;
REVOKE ALL ON FUNCTION public.admin_set_employee_nif(uuid, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_employee_nif(uuid, bigint) TO authenticated;
REVOKE ALL ON FUNCTION public.set_employee_categorias_by_nif(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_employee_categorias_by_nif(jsonb) TO authenticated;