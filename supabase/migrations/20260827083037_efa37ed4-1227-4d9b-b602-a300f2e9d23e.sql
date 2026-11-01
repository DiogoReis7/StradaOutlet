DROP POLICY IF EXISTS "sales_entries insert authenticated" ON public.sales_entries;
DROP POLICY IF EXISTS "sales_entries update authenticated" ON public.sales_entries;
DROP POLICY IF EXISTS "sales_entries delete authenticated" ON public.sales_entries;
DROP POLICY IF EXISTS "sales rw auth" ON public.sales_entries;

CREATE POLICY "sales_entries insert available or admin"
ON public.sales_entries
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR NOT EXISTS (
    SELECT 1
    FROM public.shift_days sd
    WHERE sd.employee_id = sales_entries.employee_id
      AND sd.data = sales_entries.data
      AND lower(coalesce(sd.estado, '') || ' ' || coalesce(sd.descricao, '')) LIKE '%baixa%'
  )
);

CREATE POLICY "sales_entries update available or admin"
ON public.sales_entries
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR NOT EXISTS (
    SELECT 1
    FROM public.shift_days sd
    WHERE sd.employee_id = sales_entries.employee_id
      AND sd.data = sales_entries.data
      AND lower(coalesce(sd.estado, '') || ' ' || coalesce(sd.descricao, '')) LIKE '%baixa%'
  )
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR NOT EXISTS (
    SELECT 1
    FROM public.shift_days sd
    WHERE sd.employee_id = sales_entries.employee_id
      AND sd.data = sales_entries.data
      AND lower(coalesce(sd.estado, '') || ' ' || coalesce(sd.descricao, '')) LIKE '%baixa%'
  )
);

CREATE POLICY "sales_entries delete available or admin"
ON public.sales_entries
FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR NOT EXISTS (
    SELECT 1
    FROM public.shift_days sd
    WHERE sd.employee_id = sales_entries.employee_id
      AND sd.data = sales_entries.data
      AND lower(coalesce(sd.estado, '') || ' ' || coalesce(sd.descricao, '')) LIKE '%baixa%'
  )
);