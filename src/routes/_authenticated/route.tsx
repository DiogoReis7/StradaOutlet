import { createFileRoute, Outlet, useRouter, redirect } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";

// Acesso restrito: só sessões válidas entram no dashboard, vendas e senhas.
export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/auth", search: { redirect: location.href } });
    }
    return { user: data.user };
  },
  component: AppLayout,
  errorComponent: ({ error, reset }) => {
    const router = useRouter();
    return (
      <div className="grid min-h-screen place-items-center p-6 text-center">
        <div>
          <p className="text-sm text-destructive">{error.message || "Erro"}</p>
          <button
            onClick={() => { router.invalidate(); reset(); }}
            className="mt-3 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground"
          >Tentar de novo</button>
        </div>
      </div>
    );
  },
  notFoundComponent: () => (
    <div className="grid min-h-screen place-items-center p-6">
      <p className="text-sm text-muted-foreground">Página não encontrada.</p>
    </div>
  ),
});

function AppLayout() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
