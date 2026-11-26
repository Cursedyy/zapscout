import { expect, it, vi } from "vitest";
import {
  consultarPedidoFaturamentoOmieTeste,
  listarReferenciasOmieTeste,
} from "./mimo-omie-faturamento.server";

const chaves = { OMIE_TESTE_APP_KEY: "demo", OMIE_TESTE_APP_SECRET: "sintetico" };

it("consulta a referência de demonstração mesmo quando o item ainda não tem CFOP", async () => {
  const pedido = {
    cabecalho: { codigo_pedido: 4 },
    infoCadastro: { faturado: "N", cancelado: "N" },
    det: [{ produto: { codigo_produto: 33 } }],
  };
  await expect(
    consultarPedidoFaturamentoOmieTeste(chaves, 4, async () =>
      Response.json({ pedido_venda_produto: pedido }),
    ),
  ).resolves.toEqual(pedido);
  await expect(
    consultarPedidoFaturamentoOmieTeste(chaves, 5, async () => Response.json(pedido)),
  ).rejects.toThrow(/ler os campos/);
});

it("não segue redirecionamentos nem reenvia as credenciais", async () => {
  const responder = vi.fn(async (_url: string, init: RequestInit) => {
    expect(init.redirect).toBe("manual");
    return new Response(null, { status: 302, headers: { Location: "https://example.com" } });
  });
  await expect(listarReferenciasOmieTeste(chaves, responder as typeof fetch)).rejects.toThrow(
    "OMIE-REDIRECT-302",
  );
  expect(responder).toHaveBeenCalledTimes(1);
});

it("classifica falhas TLS sem repassar a mensagem do servidor", async () => {
  const responder = async () => {
    throw Error("TLS: segredo-sintético");
  };
  await expect(listarReferenciasOmieTeste(chaves, responder)).rejects.toThrow(/OMIE-TLS/);
});

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
          det: [
            { produto: { codigo_produto: "23", descricao: "Item de demonstração" } },
            { produto: { codigo_produto: 24, descricao: "Segundo produto" } },
          ],
        },
        { cabecalho: { codigo_pedido: 23 } },
      ],
    });
  await expect(listarReferenciasOmieTeste(chaves, responder)).resolves.toEqual([
    {
      id: 12,
      numero: "7",
      produtos: [
        { codigo: 23, nome: "Item de demonstração" },
        { codigo: 24, nome: "Segundo produto" },
      ],
    },
  ]);
});
