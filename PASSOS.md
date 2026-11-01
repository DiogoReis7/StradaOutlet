# Strada Outlet — configuração completa

## 1. GitHub
Cria um repositório novo (público, sem README) e carrega TODO o conteúdo desta pasta para a raiz.

## 2. Supabase (projeto novo)
1. New project (região Frankfurt). Guarda a password da base de dados.
2. SQL Editor > New query: cola `stradaoutlet-schema-completo.sql` > Run.
3. Nova query: cola `stradaoutlet-produtos.sql` > Run (catálogo de produtos igual ao da Loures).
4. Authentication > Sign In / Providers > Email: desligar "Confirm email".
5. Authentication > Users > Add user > Create new user:
   email `gestor@stradaoutlet.local`, password à escolha, marcar "Auto Confirm User".
   O 1.º utilizador criado fica automaticamente admin. Login na app: username `gestor`.
6. Na app (página Gestão) o gestor cria os colaboradores.

## 3. Variáveis (Vercel > Settings > Environment Variables)
| Nome | Valor |
|---|---|
| SUPABASE_URL | https://<REF>.supabase.co |
| SUPABASE_PROJECT_ID | <REF> |
| SUPABASE_PUBLISHABLE_KEY | sb_publishable_... |
| VITE_SUPABASE_URL | igual a SUPABASE_URL |
| VITE_SUPABASE_PROJECT_ID | igual a SUPABASE_PROJECT_ID |
| VITE_SUPABASE_PUBLISHABLE_KEY | igual a SUPABASE_PUBLISHABLE_KEY |
| SUPABASE_SERVICE_ROLE_KEY | sb_secret_... (nunca com VITE_) |

## 4. Vercel
Add New > Project > importar o repositório > colar as 7 variáveis > Deploy.
Não adicionar integrações. Ao mudar variáveis: Redeploy sem cache.

## Notas
- Gestor de loja excluído das contas do PDS: `bmemartins` (src/lib/manager.ts).
- Metas do Quadro IOS (src/routes/_authenticated/quadro-ios.tsx) são as da Loures: ajustar à Strada. 
