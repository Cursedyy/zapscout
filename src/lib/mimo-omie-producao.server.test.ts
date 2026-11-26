import { expect, it, vi } from "vitest";
import { consultarAutorizacaoOmie, solicitarEmissaoOmie } from "./mimo-omie-producao.server";
import type { ConfigOmie } from "./mimo-omie.server";

const cfg: ConfigOmie = {
  appKey: "demo",
  secret: "sintetico",
  empresaId: "10000000-0000-4000-8000-000000000001",
  modo: "simulacao",
};
const pedido = { codigo: 14, integracao: "MIMO-9", assinatura: "a".repeat(64) };
const chave = "1".repeat(44);
const status = {
  codigo_pedido: pedido.codigo,
  codigo_pedido_integracao: pedido.integracao,
  cancelada: "N",
  faturada: "S",
  ambiente: "P",
  ListaNfe: [{ tipo: "S", chave_nfe: chave }],
};
const faturamento = {
  cAutorizado: "S",
  cDenegado: "N",
  cFaturado: "S",
  cAmbiente: "P",
  cChaveNFE: chave,
  cNumNFE: "87",
  dDtFat: "26/11/2026",
};
const etapas = (alteracoes: object = {}) => ({
  nTotPaginas: 1,
  etapasPedido: [
    {
      nCodPed: pedido.codigo,
      cCodIntPed: pedido.integracao,
      cancelamento: { cCancelado: "N" },
      faturamento: { ...faturamento, ...alteracoes },
    },
  ],
});

it("concilia uma única nota de saída autorizada no mesmo pedido de produção", async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json(status))
    .mockResolvedValueOnce(Response.json(etapas()));
  await expect(consultarAutorizacaoOmie(cfg, pedido, fetcher)).resolves.toEqual({
    estado: "autorizado",
    nfe: { chave, numero: "87", data: "2026-11-26" },
  });
  expect(fetcher.mock.calls.map(([, r]) => JSON.parse(String(r?.body)).call)).toEqual([
    "StatusPedido",
    "ListarEtapasPedido",
  ]);
});

it.each([{ cAutorizado: "N" }, { cAmbiente: "H" }, { cChaveNFE: "2".repeat(44) }])(
  "não confirma uma nota com retorno ambíguo ou de outro ambiente (%o)",
  async (alteracoes) => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(status))
      .mockResolvedValueOnce(Response.json(etapas(alteracoes)));
    await expect(consultarAutorizacaoOmie(cfg, pedido, fetcher)).resolves.toEqual({
      estado: "aguardando",
    });
  },
);

it("diferencia um pedido aberto de uma nota em processamento e valida o recibo do pedido", async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json({ ...status, faturada: "N", ListaNfe: [] }))
    .mockResolvedValueOnce(Response.json({ nCodPed: 29, cCodStatus: "0" }));
  await expect(consultarAutorizacaoOmie(cfg, pedido, fetcher)).resolves.toEqual({
    estado: "aberto",
    producao: true,
  });
  await expect(solicitarEmissaoOmie(cfg, pedido.codigo, fetcher)).rejects.toThrow();
});
