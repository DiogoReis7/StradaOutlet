import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { enableOfflineCache } from "./lib/offline-cache";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Mantém as últimas leituras em memória/disco durante 24h para consulta offline
        gcTime: 1000 * 60 * 60 * 24,
        staleTime: 1000 * 30,
        retry: 1,
        refetchOnReconnect: true,
      },
    },
  });

  enableOfflineCache(queryClient);

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
