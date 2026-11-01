INSERT INTO public.products (codigo, nome, categoria, peso, ordem, ativo)
VALUES ('migracoes-tv', 'Migração TV', 'fixo', 0.5, 6, true)
ON CONFLICT DO NOTHING;

UPDATE public.products SET ordem = ordem + 1 WHERE ordem >= 6 AND codigo <> 'migracoes-tv';