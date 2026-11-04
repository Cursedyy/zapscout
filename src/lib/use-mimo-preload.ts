import { useCallback, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";

/** Aquece módulos e leituras iniciais das telas permitidas sem bloquear a tela atual. */
export function useMimoPreload(caminhos: readonly string[]) {
  const router = useRouter();
  const qc = useQueryClient();
  const iniciar = useRef<(to: string) => void>(() => {});
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
    const modulos = new Map<string, Promise<void>>();
    const permitidos = new Set(fila);
    let filaDados = Promise.resolve();
    async function codigo(to: string) {
      for (const match of router.matchRoutes(to)) {
        if (cancelado) return;
        let tarefa = modulos.get(match.routeId);
        if (!tarefa) {
          tarefa = Promise.resolve().then(() => router.loadRouteChunk(router.routesById[match.routeId]));
          modulos.set(match.routeId, tarefa);
          tarefa.catch(() => modulos.delete(match.routeId));
        }
        await tarefa;
      }
    }
    async function dados(to: string) {
      if (cancelado) return;
      const { preloadDadosMimo } = await import('./mimo-preload-dados');
      if (!cancelado) await preloadDadosMimo(to, qc);
    }
    iniciar.current = to => {
      if (!cancelado && permitidos.has(to)) void codigo(to).then(() => dados(to)).catch(() => {});
    };
    async function proxima() {
      if (cancelado) return;
      const to = fila.shift();
      if (!to) return;
      try {
        await codigo(to);
        // Uma fila de leituras independente mantém o download dos módulos fluido.
        filaDados = filaDados.then(() => dados(to)).catch(() => {});
      } catch {
        /* A navegação normal pode tentar novamente quando a tela for aberta. */
      }
      if (!cancelado) timer = setTimeout(() => void proxima(), 50);
    }
    timer = setTimeout(() => void proxima(), 100);
    return () => {
      cancelado = true;
      iniciar.current = () => {};
      clearTimeout(timer);
    };
  }, [router, qc, destinos]);
  return useCallback((to: string) => iniciar.current(to), []);
}
