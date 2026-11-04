import { useEffect, useMemo, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";

type Rede = EventTarget & { saveData?: boolean; effectiveType?: string };
const PRIORIDADES = ["/mimo/leads", "/mimo/carteira", "/mimo/tira-pedido"];

/** Código na ociosidade; dados somente quando há intenção de abrir a tela. */
export function useMimoPreload(caminhos: readonly string[], caminhoAtual?: string) {
  const router = useRouter();
  const qc = useQueryClient();
  const iniciar = useRef<(to: string) => void>(() => {});
  const parar = useRef<() => void>(() => {});
  const destinos = caminhos.join("|");
  useEffect(() => {
    const rede = (navigator as Navigator & { connection?: Rede }).connection;
    const visivel = () => document.visibilityState !== "hidden";
    const podeTransferir = () =>
      navigator.onLine !== false &&
      !rede?.saveData &&
      rede?.effectiveType !== "2g" &&
      rede?.effectiveType !== "slow-2g";
    const permitidos = new Set(destinos ? destinos.split("|") : []);
    const fila = PRIORIDADES.filter((to) => permitidos.has(to) && to !== caminhoAtual).slice(0, 2);
    let cancelado = false;
    let executando = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let idle: number | undefined;
    const modulos = new Map<string, Promise<void>>();
    const intencoes = new Map<string, Promise<void>>();
    function cancelarAgendamento() {
      if (timer !== undefined) clearTimeout(timer);
      if (idle !== undefined) window.cancelIdleCallback?.(idle);
      timer = undefined;
      idle = undefined;
    }
    async function codigo(to: string) {
      for (const match of router.matchRoutes(to)) {
        if (cancelado || !podeTransferir() || document.visibilityState === "hidden") return;
        let tarefa = modulos.get(match.routeId);
        if (!tarefa) {
          tarefa = Promise.resolve().then(() => {
            if (cancelado || !podeTransferir() || document.visibilityState === "hidden")
              throw new Error("preload_paused");
            return router.loadRouteChunk(router.routesById[match.routeId]);
          });
          modulos.set(match.routeId, tarefa);
          void tarefa.catch(() => modulos.delete(match.routeId));
        }
        await tarefa;
      }
    }
    async function dados(to: string) {
      if (cancelado || !podeTransferir() || document.visibilityState === "hidden") return;
      const { preloadDadosMimo } = await import("./mimo-preload-dados");
      if (!cancelado && podeTransferir() && visivel()) await preloadDadosMimo(to, qc);
    }
    iniciar.current = (to) => {
      if (
        cancelado ||
        !permitidos.has(to) ||
        !podeTransferir() ||
        document.visibilityState === "hidden" ||
        intencoes.has(to)
      )
        return;
      const indice = fila.indexOf(to);
      if (indice >= 0) fila.splice(indice, 1);
      const tarefa = codigo(to)
        .then(() => dados(to))
        .catch(() => {})
        .finally(() => intencoes.delete(to));
      intencoes.set(to, tarefa);
    };
    function agendar() {
      if (
        cancelado ||
        executando ||
        timer !== undefined ||
        idle !== undefined ||
        !fila.length ||
        !podeTransferir() ||
        document.visibilityState === "hidden"
      )
        return;
      if (typeof window.requestIdleCallback === "function") {
        idle = window.requestIdleCallback(() => void proxima(), { timeout: 2000 });
      } else {
        timer = setTimeout(() => void proxima(), 600);
      }
    }
    async function proxima() {
      timer = undefined;
      idle = undefined;
      if (cancelado || !podeTransferir() || document.visibilityState === "hidden") return;
      if (qc.isFetching() > 0) {
        timer = setTimeout(() => void proxima(), 600);
        return;
      }
      const to = fila.shift();
      if (!to) return;
      executando = true;
      try {
        await codigo(to);
      } catch {
        /* A navegação normal pode tentar novamente quando a tela for aberta. */
      } finally {
        executando = false;
        agendar();
      }
    }
    function atualizar() {
      if (!podeTransferir() || document.visibilityState === "hidden") cancelarAgendamento();
      else agendar();
    }
    parar.current = () => {
      cancelado = true;
      iniciar.current = () => {};
      cancelarAgendamento();
    };
    document.addEventListener("visibilitychange", atualizar);
    window.addEventListener("online", atualizar);
    window.addEventListener("offline", atualizar);
    rede?.addEventListener?.("change", atualizar);
    agendar();
    return () => {
      parar.current();
      document.removeEventListener("visibilitychange", atualizar);
      window.removeEventListener("online", atualizar);
      window.removeEventListener("offline", atualizar);
      rede?.removeEventListener?.("change", atualizar);
    };
  }, [router, qc, destinos, caminhoAtual]);
  return useMemo(
    () =>
      Object.assign((to: string) => iniciar.current(to), {
        cancelar: () => parar.current(),
      }),
    [],
  );
}
