import { expect, it } from "vitest";
import { listarReferenciasOmieTeste } from "./mimo-omie-faturamento.server";

const chaves = { OMIE_TESTE_APP_KEY: "demo", OMIE_TESTE_APP_SECRET: "sintetico" };

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
