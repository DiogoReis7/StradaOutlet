import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

/** Devolve o colaborador associado à conta com sessão iniciada (via username SGF). */
export function useMyEmployee() {
  const { user } = useAuth();
  const username = (user?.email ?? "").split("@")[0]?.trim().toLowerCase() ?? "";

  const q = useQuery({
    queryKey: ["my-employee", username],
    enabled: !!username,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("id,nome,slug,username_sgf")
        .not("username_sgf", "is", null);
      if (error) throw error;
      const found = (data ?? []).find(
        (e) => (e.username_sgf ?? "").trim().toLowerCase() === username,
      );
      return found ?? null;
    },
  });

  return { employee: q.data ?? null, employeeId: q.data?.id ?? null, loading: q.isLoading };
}
