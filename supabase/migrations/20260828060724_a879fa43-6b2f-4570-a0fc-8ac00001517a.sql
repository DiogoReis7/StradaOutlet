ALTER TABLE public.announcements ADD COLUMN IF NOT EXISTS employee_id uuid REFERENCES public.employees(id) ON DELETE CASCADE;

CREATE OR REPLACE FUNCTION public.current_employee_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.id
  FROM public.employees e
  WHERE e.username_sgf IS NOT NULL
    AND lower(trim(e.username_sgf)) = split_part(lower(coalesce((auth.jwt() ->> 'email'), '')), '@', 1)
  LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION public.current_employee_id() TO authenticated;

DROP POLICY IF EXISTS "announcements read" ON public.announcements;
CREATE POLICY "announcements read" ON public.announcements
FOR SELECT TO authenticated
USING (
  employee_id IS NULL
  OR employee_id = public.current_employee_id()
  OR public.has_role(auth.uid(), 'admin')
);