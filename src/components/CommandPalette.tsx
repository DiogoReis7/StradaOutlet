import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator,
} from "@/components/ui/command";
import {
  BarChart3, UserCircle, Calculator, Ticket, CalendarClock, ClipboardList,
  Search, Trophy, HeartHandshake, Users, Package, Home, Activity, Coffee,
} from "lucide-react";

const PAGES = [
  { to: "/", label: "Início", icon: Home },
  { to: "/pds", label: "PDS", icon: BarChart3 },
  { to: "/individual", label: "Individuais", icon: UserCircle },
  { to: "/nps", label: "NPS", icon: HeartHandshake },
  { to: "/pesquisa", label: "Pesquisa", icon: Search },
  { to: "/contador", label: "Contador", icon: Calculator },
  { to: "/sgf", label: "SGF", icon: Ticket },
  { to: "/horarios", label: "Horários", icon: CalendarClock },
  { to: "/quadro-ios", label: "Quadro IOS", icon: ClipboardList },
  { to: "/colaboradores", label: "Vendedores", icon: Users },
  { to: "/produtos", label: "Produtos", icon: Package },
];

/** Global Cmd/Ctrl+K palette. */
export function CommandPalette({
  open, onOpenChange,
}: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const navigate = useNavigate();

  const empsQ = useQuery({
    queryKey: ["employees"],
    queryFn: async () =>
      (await supabase
        .from("employees")
        .select("id,nome,slug,username_sgf,categoria,ativo,ordem")
        .eq("ativo", true)
        .order("ordem")).data ?? [],
    enabled: open,
    staleTime: 60_000,
  });

  const emps = useMemo(() => empsQ.data ?? [], [empsQ.data]);

  function go(fn: () => void) {
    onOpenChange(false);
    setTimeout(fn, 0);
  }

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Pesquisar páginas ou vendedores…" />
      <CommandList>
        <CommandEmpty>Sem resultados.</CommandEmpty>
        <CommandGroup heading="Páginas">
          {PAGES.map((p) => {
            const Icon = p.icon;
            return (
              <CommandItem key={p.to} value={`pagina ${p.label}`} onSelect={() => go(() => navigate({ to: p.to }))}>
                <Icon className="mr-2 h-4 w-4" />
                {p.label}
              </CommandItem>
            );
          })}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Vendedores">
          {emps.map((e: any) => (
            <CommandItem
              key={e.id}
              value={`vendedor ${e.nome} ${e.username_sgf ?? ""} ${e.categoria ?? ""}`}
              onSelect={() => go(() => navigate({ to: "/individual/$slug", params: { slug: e.slug } }))}
            >
              <UserCircle className="mr-2 h-4 w-4" />
              <span className="truncate">{e.nome}</span>
              {e.categoria && <span className="ml-auto text-[11px] text-muted-foreground">{e.categoria}</span>}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}

/** Hook that wires the Cmd/Ctrl+K shortcut. */
export function useCommandPalette() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key?.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return { open, setOpen };
}
