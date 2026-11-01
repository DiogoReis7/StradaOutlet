-- Restore SELECT on nif to authenticated (admin uses authenticated session in this app).
-- Anon (públicas) continuam sem acesso ao NIF.
GRANT SELECT (nif) ON public.employees TO authenticated;
