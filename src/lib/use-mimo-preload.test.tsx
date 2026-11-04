// @vitest-environment happy-dom
import { renderHook, act, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
type FakeRouter = {
  routesById: Record<string, { id: string }>;
  matchRoutes: (to: string) => { routeId: string }[];
  loadRouteChunk: ReturnType<typeof vi.fn>;
};
const s = vi.hoisted(() => ({
  load: vi.fn(),
  dados: vi.fn(),
  router: {} as FakeRouter,
  qc: { isFetching: vi.fn() },
}));
vi.mock("@tanstack/react-router", () => ({ useRouter: () => s.router }));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => s.qc }));
vi.mock("./mimo-preload-dados", () => ({ preloadDadosMimo: s.dados }));
import { useMimoPreload } from "./use-mimo-preload";
beforeEach(() => {
  vi.useFakeTimers();
  s.load.mockReset().mockResolvedValue(undefined);
  s.dados.mockReset().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "connection", { configurable: true, value: undefined });
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  Object.defineProperty(window, "requestIdleCallback", {
    configurable: true,
    writable: true,
    value: undefined,
  });
  Object.defineProperty(window, "cancelIdleCallback", {
    configurable: true,
    writable: true,
    value: undefined,
  });
  s.qc.isFetching.mockReset().mockReturnValue(0);
  s.router = {
    routesById: Object.fromEntries(
      ["root", "/mimo/leads", "/mimo/carteira", "/mimo/tira-pedido", "/mimo/relatorios"].map(
        (id) => [id, { id }],
      ),
    ),
    matchRoutes: (to: string) => [{ routeId: "root" }, { routeId: to }],
    loadRouteChunk: s.load,
  };
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
describe("preload MiMo", () => {
  it("limita o trabalho automático a dois módulos e não inicia consultas pesadas", async () => {
    renderHook(() =>
      useMimoPreload(["/mimo/leads", "/mimo/carteira", "/mimo/tira-pedido", "/mimo/relatorios"]),
    );
    await act(() => vi.advanceTimersByTimeAsync(4000));
    expect(s.load.mock.calls.map(([r]) => r.id)).toEqual(["root", "/mimo/leads", "/mimo/carteira"]);
    expect(s.dados).not.toHaveBeenCalled();
  });
  it("prioriza o destino apontado e não permite aquecer uma página fora do cargo", async () => {
    const h = renderHook(() => useMimoPreload(["/mimo/leads", "/mimo/carteira"]));
    await act(async () => {
      h.result.current("/mimo/carteira");
      h.result.current("/mimo/equipe");
    });
    expect(s.dados).toHaveBeenCalledWith("/mimo/carteira", s.qc);
    expect(s.dados).not.toHaveBeenCalledWith("/mimo/equipe", s.qc);
  });
  it("economia de dados impede transferências automáticas", async () => {
    Object.defineProperty(navigator, "connection", {
      configurable: true,
      value: { saveData: true },
    });
    renderHook(() => useMimoPreload(["/mimo/leads"]));
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(s.load).not.toHaveBeenCalled();
    expect(s.dados).not.toHaveBeenCalled();
  });
  it("sair do painel cancela a fila que ainda não começou", async () => {
    const h = renderHook(() => useMimoPreload(["/mimo/leads"]));
    h.unmount();
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(s.load).not.toHaveBeenCalled();
  });
  it("falha de um módulo permite nova tentativa no destino", async () => {
    s.load.mockRejectedValueOnce(new Error("rede"));
    const h = renderHook(() => useMimoPreload(["/mimo/leads"]));
    await act(async () => {
      h.result.current("/mimo/leads");
    });
    await act(async () => {
      h.result.current("/mimo/leads");
    });
    expect(s.dados).toHaveBeenCalledWith("/mimo/leads", s.qc);
  });
  it("não disputa a rede enquanto a tela atual consulta dados", async () => {
    s.qc.isFetching.mockReturnValue(1);
    renderHook(() => useMimoPreload(["/mimo/leads"]));
    await act(() => vi.advanceTimersByTimeAsync(1800));
    expect(s.load).not.toHaveBeenCalled();
    s.qc.isFetching.mockReturnValue(0);
    await act(() => vi.advanceTimersByTimeAsync(600));
    expect(s.load).toHaveBeenCalled();
  });
  it("eventos repetidos de hover/foco/toque compartilham o mesmo trabalho", async () => {
    let resolver!: () => void;
    s.dados.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolver = resolve;
      }),
    );
    const h = renderHook(() => useMimoPreload(["/mimo/leads"]));
    await act(async () => {
      h.result.current("/mimo/leads");
      h.result.current("/mimo/leads");
    });
    expect(s.dados).toHaveBeenCalledTimes(1);
    resolver();
  });
  it("pausa em aba oculta e retoma quando a aba fica visível", async () => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    renderHook(() => useMimoPreload(["/mimo/leads"]));
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(s.load).not.toHaveBeenCalled();
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await vi.advanceTimersByTimeAsync(600);
    });
    expect(s.load).toHaveBeenCalled();
  });
  it("cancelamento explícito impede leituras pendentes durante logout", async () => {
    let resolver!: () => void;
    s.load.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolver = resolve;
      }),
    );
    const h = renderHook(() => useMimoPreload(["/mimo/leads"]));
    await act(async () => {
      h.result.current("/mimo/leads");
    });
    h.result.current.cancelar();
    await act(async () => {
      resolver();
    });
    await act(() => vi.advanceTimersByTimeAsync(2000));
    expect(s.dados).not.toHaveBeenCalled();
  });
  it("usa a ociosidade do navegador quando disponível", async () => {
    let executar!: IdleRequestCallback;
    const idle = vi.fn((callback: IdleRequestCallback) => {
      executar = callback;
      return 1;
    });
    window.requestIdleCallback = idle;
    window.cancelIdleCallback = vi.fn();
    const h = renderHook(() => useMimoPreload(["/mimo/leads"]));
    expect(s.load).not.toHaveBeenCalled();
    expect(idle).toHaveBeenCalledWith(expect.any(Function), { timeout: 2000 });
    await act(async () => executar({ didTimeout: false, timeRemaining: () => 20 }));
    expect(s.load).toHaveBeenCalled();
    h.unmount();
  });
  it("não antecipa novamente a própria página aberta", async () => {
    renderHook(() => useMimoPreload(["/mimo/leads", "/mimo/carteira"], "/mimo/leads"));
    await act(() => vi.advanceTimersByTimeAsync(2000));
    expect(s.load.mock.calls.map(([r]) => r.id)).toEqual(["root", "/mimo/carteira"]);
  });
  it("não inicia dados quando a aba fica oculta durante o download do módulo", async () => {
    let resolver!: () => void;
    s.load.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolver = resolve;
      }),
    );
    const h = renderHook(() => useMimoPreload(["/mimo/leads"]));
    await act(async () => h.result.current("/mimo/leads"));
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    await act(async () => resolver());
    expect(s.dados).not.toHaveBeenCalled();
  });
  it("aguarda reconexão antes do trabalho automático", async () => {
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    renderHook(() => useMimoPreload(["/mimo/leads"]));
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(s.load).not.toHaveBeenCalled();
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
    await act(async () => {
      window.dispatchEvent(new Event("online"));
      await vi.advanceTimersByTimeAsync(600);
    });
    expect(s.load).toHaveBeenCalled();
  });
  it.each(["2g", "slow-2g"])("não antecipa módulos nem dados em rede %s", async (effectiveType) => {
    Object.defineProperty(navigator, "connection", {
      configurable: true,
      value: { effectiveType },
    });
    const h = renderHook(() => useMimoPreload(["/mimo/leads"]));
    await act(async () => {
      h.result.current("/mimo/leads");
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(s.load).not.toHaveBeenCalled();
    expect(s.dados).not.toHaveBeenCalled();
  });
});
