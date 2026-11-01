REVOKE EXECUTE ON FUNCTION public.current_employee_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_employee_id() TO authenticated;