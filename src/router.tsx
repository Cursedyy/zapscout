import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { PageLoading } from "./components/page-loading";


export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Dados frescos por 5 min — corta refetches redundantes ao navegar entre páginas
        staleTime: 5 * 60_000,
        gcTime: 10 * 60_000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: "always",
        retry: 1,
      },
      mutations: { retry: 0 },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    // Pré-carrega a rota assim que o usuário passa o mouse / toca no link
    defaultPreload: "intent",
    // Deixa o React Query controlar o cache; o router não revalida em background
    defaultPreloadStaleTime: 0,
    defaultPreloadGcTime: 30_000,
  });

  return router;
};
