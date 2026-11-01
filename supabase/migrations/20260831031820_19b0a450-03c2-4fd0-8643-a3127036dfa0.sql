DROP POLICY IF EXISTS "one_on_ones read" ON public.one_on_ones;
CREATE POLICY "one_on_ones read own or admin" ON public.one_on_ones FOR SELECT TO authenticated
USING (employee_id = public.current_employee_id() OR public.has_role(auth.uid(), 'admin'::app_role));