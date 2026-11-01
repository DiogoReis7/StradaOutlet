
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS nif bigint;
CREATE UNIQUE INDEX IF NOT EXISTS employees_nif_uniq ON public.employees(nif) WHERE nif IS NOT NULL;

ALTER TABLE public.shift_days ADD COLUMN IF NOT EXISTS descricao text;
CREATE UNIQUE INDEX IF NOT EXISTS shift_days_emp_data_uniq ON public.shift_days(employee_id, data);
