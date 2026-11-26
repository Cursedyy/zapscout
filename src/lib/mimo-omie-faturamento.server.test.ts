import { expect, it, vi } from "vitest";
import { listarReferenciasOmieTeste } from "./mimo-omie-faturamento.server";

const chaves = { OMIE_TESTE_APP_KEY: "demo", OMIE_TESTE_APP_SECRET: "sintetico" };

it("preserva o contexto do fetch nativo do servidor", async () => {
  vi.stubGlobal("fetch", function (this: typeof globalThis) {
    if (this !== globalThis) throw TypeError("Illegal invocation");
    return Promise.resolve(Response.json({ total_de_registros: 0 }));
  });
  try {
    await expect(listarReferenciasOmieTeste(chaves)).resolves.toEqual([]);
  } finally {
    vi.unstubAllGlobals();
  }
});

it("reconhece a resposta do Omie quando a página está vazia", async () => {
  const responder = async () =>
    Response.json({ faultstring: "Não existem registros para a página" }, { status: 500 });
  await expect(listarReferenciasOmieTeste(chaves, responder)).resolves.toEqual([]);
});

it("distingue recusa de acesso sem repassar o conteúdo da resposta", async () => {
  const responder = async () =>
    Response.json({ faultstring: "App Key inválida: segredo-sintético" }, { status: 500 });
  const consulta = listarReferenciasOmieTeste(chaves, responder);
  await expect(consulta).rejects.toThrow(/recusou o acesso/);
  await expect(consulta).rejects.not.toThrow(/segredo-sintético/);
});

it("retorna referências válidas mesmo se outro registro vier incompleto", async () => {
  const responder = async () =>
    Response.json({
      pedido_venda_produto: [
        {
          cabecalho: { codigo_pedido: 12, numero_pedido: "7" },
          det: [{ produto: { descricao: "Item de demonstração" } }],
        },
        { cabecalho: { codigo_pedido: 23 } },
      ],
    });
  await expect(listarReferenciasOmieTeste(chaves, responder)).resolves.toEqual([
    { id: 12, numero: "7", produto: "Item de demonstração" },
  ]);
});
