// @vitest-environment happy-dom
import { webcrypto } from "node:crypto";
import { useState } from "react";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { novoPedido } from "./mimo-pedido";
import { chaveLocalRascunho, type RascunhoPedido } from "./mimo-rascunho";
import { limparRascunhosMemoria } from "./mimo-rascunho-memoria";
import { useMimoRascunho } from "./use-mimo-rascunho";

vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("./mimo-rascunho.functions", () => ({
  prepararChaveRascunhoMimo: async () => ({
    chave: Buffer.alloc(32, 7).toString("base64"),
    empresaId: "empresa",
    usuarioId: "usuario",
    papel: "vendedor",
  }),
}));
const escopo = { empresaId: "empresa", usuarioId: "usuario", papel: "vendedor", pedidoRef: null };
const storageKey = chaveLocalRascunho(escopo);
function inicial(): RascunhoPedido {
  return {
    pedidoId: "11111111-1111-4111-8111-111111111111",
    documento: novoPedido(),
    tela: { tab: "itens", modelo: "", produto: "", brinde: "", manual: "", brindeReutilizavel: "", buscaCliente: "" },
  };
}
function montar() {
  return renderHook(() => {
    const [valor, setValor] = useState(inicial);
    const rascunho = useMimoRascunho({
      escopo, valor, base: JSON.stringify(inicial()), versaoBase: 0, editavel: true, restaurar: setValor,
    });
    return { ...rascunho, valor, setValor };
  });
}
beforeEach(() => {
  vi.stubGlobal("crypto", webcrypto);
  const dados = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => dados.get(key) ?? null,
    setItem: (key: string, value: string) => { dados.set(key, value); },
    removeItem: (key: string) => { dados.delete(key); },
    clear: () => dados.clear(),
  });
  limparRascunhosMemoria();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("rascunho após sair e reabrir o tira-pedido", () => {
  it("recupera dados e aba pelo armazenamento persistente, sem depender da memória", async () => {
    const h = montar();
    await waitFor(() => expect(h.result.current.status).toBe("pronto"));
    act(() => h.result.current.setValor(v => ({
      ...v, documento: { ...v.documento, observacoes: "Proposta pendente" }, tela: { ...v.tela, tab: "frete" },
    })));
    await waitFor(() => expect(h.result.current.status).toBe("salvo"));
    expect(localStorage.getItem(storageKey)).not.toContain("Proposta pendente");
    h.unmount();
    limparRascunhosMemoria();
    const reaberto = montar();
    await waitFor(() => expect(reaberto.result.current.valor.documento.observacoes).toBe("Proposta pendente"));
    expect(reaberto.result.current.valor.tela.tab).toBe("frete");
  });

  it("não restaura alterações desfeitas até o estado inicial", async () => {
    const h = montar();
    await waitFor(() => expect(h.result.current.status).toBe("pronto"));
    act(() => h.result.current.setValor(v => ({ ...v, documento: { ...v.documento, cliente: "Cliente removido" } })));
    await waitFor(() => expect(h.result.current.status).toBe("salvo"));
    act(() => h.result.current.setValor(inicial()));
    await waitFor(() => expect(localStorage.getItem(storageKey)).toBeNull());
    h.unmount();
    const reaberto = montar();
    await waitFor(() => expect(reaberto.result.current.status).toBe("pronto"));
    expect(reaberto.result.current.valor.documento.cliente).toBe("");
  });

  it("descartar impede que uma gravação pendente recrie o rascunho", async () => {
    const h = montar();
    await waitFor(() => expect(h.result.current.status).toBe("pronto"));
    act(() => h.result.current.setValor(v => ({ ...v, documento: { ...v.documento, cliente: "Descartar" } })));
    act(() => h.result.current.limpar());
    h.unmount();
    const reaberto = montar();
    await waitFor(() => expect(reaberto.result.current.status).toBe("pronto"));
    expect(reaberto.result.current.valor.documento.cliente).toBe("");
    expect(localStorage.getItem(storageKey)).toBeNull();
  });
});
