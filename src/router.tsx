import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { PageLoading } from "./components/page-loading";

function DefaultErrorComponent({ error }: { error: Error }) {
  console.error("[route-error]", error);
  return (
    <div className="m-4 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-foreground">
      <div className="font-medium text-destructive">Não foi possível carregar esta seção.</div>
      <div className="mt-1 text-muted-foreground">
        Atualize a página ou tente novamente em instantes.
      </div>
      <button
        onClick={() => window.location.reload()}
        className="mt-3 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
      >
        Tentar novamente
      </button>
    </div>
  );
}

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
        throwOnError: false,
      },
      mutations: { retry: 0 },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPendingComponent: PageLoading,
    defaultErrorComponent: DefaultErrorComponent,
    // Pré-carrega a rota assim que o usuário passa o mouse / toca no link
    defaultPreload: false,
    // Deixa o React Query controlar o cache; o router não revalida em background
    defaultPreloadStaleTime: 30_000,
    defaultPreloadGcTime: 30_000,
  });

  return router;
};
