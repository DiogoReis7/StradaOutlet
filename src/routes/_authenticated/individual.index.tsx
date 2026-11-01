import { createFileRoute, Link } from "@tanstack/react-router";
import { RouteError, RouteNotFound, pageHead } from "@/components/RouteBoundary";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/AppShell";
import { MONTHS_PT } from "@/lib/domain";
import { ChevronRight } from "lucide-react";
import { NeonBadge } from "@/lib/product-icons";
import { withoutManagers } from "@/lib/manager";

export const Route = createFileRoute("/_authenticated/individual/")({
  head: pageHead("Individual · PDS Strada Outlet", "Escolhe um colaborador para ver o desempenho individual."),
  errorComponent: ({ error, reset }) => <RouteError error={error} reset={reset} />,
  notFoundComponent: () => <RouteNotFound />,
  component: IndividualIndex,
});

function IndividualIndex() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const empsQ = useQuery({
    queryKey: ["employees", "ops"],
    queryFn: async () => {
      const { data } = await supabase.from("employees").select("id,nome,slug,username_sgf,nome_sgf,ativo,ordem,categoria").eq("ativo", true).order("ordem");
      return withoutManagers((data ?? []) as any[]);
    },
  });

  const items = empsQ.data ?? [];

  return (
    <div>
      <PageHeader
        title="Folhas individuais"
        subtitle="Vê e edita o mapa de cada vendedor"
        actions={
          <>
            <select value={month} onChange={(e) => setMonth(Number(e.target.value))}
              className="rounded-md border bg-background px-2 py-1.5 text-sm">
              {MONTHS_PT.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </select>
            <select value={year} onChange={(e) => setYear(Number(e.target.value))}
              className="rounded-md border bg-background px-2 py-1.5 text-sm">
              {[2024, 2025, 2026, 2027, 2028].map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </>
        }
      />
      <div className="p-2 md:p-6">
        <div className="grid grid-cols-2 sm:grid-cols-2 xl:grid-cols-3 gap-1.5 md:gap-3">
          {items.map((e: any) => {
            const initials = e.nome.split(" ").map((p: string) => p[0]).slice(0, 2).join("").toUpperCase();
            return (
              <Link
                key={e.id}
                to="/individual/$slug"
                params={{ slug: e.slug }}
                className="group relative rounded-xl border bg-card p-2 md:p-4 transition hover:border-[var(--neon-blue)]/70 hover:bg-[color-mix(in_oklab,var(--neon-blue)_8%,transparent)] hover:shadow-[0_0_18px_color-mix(in_oklab,var(--neon-blue)_30%,transparent)] focus-neon overflow-hidden"
              >
                <div className="flex items-center gap-2 md:gap-3">
                  <div className="grid h-9 w-9 md:h-12 md:w-12 shrink-0 place-items-center rounded-lg md:rounded-xl bg-gradient-to-br from-[var(--brand-orange)]/25 to-[var(--brand-blue)]/25 text-foreground text-xs md:text-base font-bold ring-1 ring-border">
                    {initials}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <div className="truncate text-xs md:text-base font-semibold">{e.nome}</div>
                      {e.categoria && <NeonBadge label={e.categoria} />}
                    </div>
                    <div className="text-[10px] md:text-xs text-muted-foreground truncate">@{e.username_sgf ?? "—"}</div>
                  </div>
                  <ChevronRight className="hidden md:block h-4 w-4 text-muted-foreground transition group-hover:text-[var(--neon-blue)]" />
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}


