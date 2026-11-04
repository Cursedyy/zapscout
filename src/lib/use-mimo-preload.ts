import { useEffect } from "react";
import { useRouter } from "@tanstack/react-router";

/** Aquece somente o código das telas permitidas; não dispara seus relatórios/consultas. */
export function useMimoPreload(caminhos: readonly string[]) {
  const router = useRouter();
  const destinos = caminhos.join("|");
  useEffect(() => {
    const rede = (
      navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }
    ).connection;
    if (
      !destinos ||
      rede?.saveData ||
      rede?.effectiveType === "2g" ||
      rede?.effectiveType === "slow-2g"
    )
      return;
    let cancelado = false;
    let timer: ReturnType<typeof setTimeout>;
    const fila = destinos.split("|");
    const vistos = new Set<string>();
    async function proxima() {
      if (cancelado) return;
      const to = fila.shift();
      if (!to) return;
      try {
        for (const match of router.matchRoutes(to)) {
          if (cancelado) return;
          if (vistos.has(match.routeId)) continue;
          vistos.add(match.routeId);
          await router.loadRouteChunk(router.routesById[match.routeId]);
        }
      } catch {
        /* A navegação normal pode tentar novamente quando a tela for aberta. */
      }
      if (!cancelado) timer = setTimeout(() => void proxima(), 250);
    }
    timer = setTimeout(() => void proxima(), 1000);
    return () => {
      cancelado = true;
      clearTimeout(timer);
    };
  }, [router, destinos]);
}
