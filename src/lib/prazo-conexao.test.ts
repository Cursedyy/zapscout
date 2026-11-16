import { afterEach, expect, it, vi } from "vitest";
import { comPrazoConexao, fetchAutenticacaoComPrazo, PrazoConexaoError } from "./prazo-conexao";
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it("encerra uma leitura presa e aborta seu transporte", async () => {
  vi.useFakeTimers();
  let signal: AbortSignal | undefined;
  const p = comPrazoConexao((s) => {
    signal = s;
    return new Promise(() => {});
  });
  const assertion = expect(p).rejects.toBeInstanceOf(PrazoConexaoError);
  await vi.advanceTimersByTimeAsync(8000);
  await assertion;
  expect(signal?.aborted).toBe(true);
});
it("uma resposta tardia não avança o fluxo que já expirou", async () => {
  vi.useFakeTimers();
  let liberar!: (v: boolean) => void;
  const continuar = vi.fn();
  const p = comPrazoConexao(
    () =>
      new Promise<boolean>((r) => {
        liberar = r;
      }),
    10,
  ).then(continuar);
  const assertion = expect(p).rejects.toBeInstanceOf(PrazoConexaoError);
  await vi.advanceTimersByTimeAsync(10);
  await assertion;
  liberar(true);
  await Promise.resolve();
  await Promise.resolve();
  expect(continuar).not.toHaveBeenCalled();
});
it("limpa o timer ao terminar e preserva o erro original", async () => {
  vi.useFakeTimers();
  await expect(comPrazoConexao(async () => 123)).resolves.toBe(123);
  await expect(
    comPrazoConexao(async () => {
      throw Error("erro-sintetico");
    }),
  ).rejects.toThrow("erro-sintetico");
  await Promise.resolve();
  expect(vi.getTimerCount()).toBe(0);
});
it("aborta uma requisição HTTP de autenticação após vinte segundos", async () => {
  vi.useFakeTimers();
  let sinal: AbortSignal | undefined;
  const mock = vi.fn((_input, init) => {
    sinal = init.signal;
    return new Promise<Response>(() => {});
  });
  vi.stubGlobal("fetch", mock);
  const p = fetchAutenticacaoComPrazo("https://auth.invalid/auth/v1/token", { method: "POST" });
  const assertion = expect(p).rejects.toBeInstanceOf(PrazoConexaoError);
  await vi.advanceTimersByTimeAsync(20000);
  await assertion;
  expect(sinal?.aborted).toBe(true);
  expect(mock).toHaveBeenCalledTimes(1);
});
it("não altera timeout, sinal ou corpo de operações comerciais", async () => {
  const resposta = Response.json({ ok: true });
  const mock = vi.fn(async () => resposta);
  vi.stubGlobal("fetch", mock);
  const init = { method: "POST", body: "pedido-sintetico", signal: new AbortController().signal };
  expect(
    await fetchAutenticacaoComPrazo("https://auth.invalid/rest/v1/rpc/salvar_pedido", init),
  ).toBe(resposta);
  expect(mock).toHaveBeenCalledWith("https://auth.invalid/rest/v1/rpc/salvar_pedido", init);
});
it("resposta de autenticação presa depois dos cabeçalhos também expira", async () => {
  vi.useFakeTimers();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(new ReadableStream())),
  );
  const p = fetchAutenticacaoComPrazo("https://auth.invalid/auth/v1/token");
  const assertion = expect(p).rejects.toBeInstanceOf(PrazoConexaoError);
  await vi.advanceTimersByTimeAsync(20000);
  await assertion;
});
it("preserva cancelamento solicitado pelo chamador", async () => {
  const caller = new AbortController();
  let recebido: AbortSignal | undefined;
  vi.stubGlobal(
    "fetch",
    vi.fn((_input, init) => {
      recebido = init.signal;
      return new Promise((_resolve, reject) =>
        init.signal.addEventListener("abort", () =>
          reject(new DOMException("aborted", "AbortError")),
        ),
      );
    }),
  );
  const p = fetchAutenticacaoComPrazo("https://auth.invalid/auth/v1/token", {
    signal: caller.signal,
  });
  const assertion = expect(p).rejects.toMatchObject({ name: "AbortError" });
  await Promise.resolve();
  caller.abort();
  await assertion;
  expect(recebido?.aborted).toBe(true);
});
