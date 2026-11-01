-- Restringir coluna nif a admins: revogar SELECT direto; leitura continua via RPC admin_get_employee_nifs
REVOKE SELECT (nif) ON public.employees FROM authenticated;
REVOKE SELECT (nif) ON public.employees FROM anon;