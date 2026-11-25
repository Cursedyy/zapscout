import { expect, it } from "vitest";
import {
  calcularRetornoCampanhas,
  filtroRetornoSchema,
  type MetaRetorno,
  type LeadRetorno,
  type PedidoRetorno,
} from "./mimo-retorno-campanhas";
const periodo = { inicio: "2026-11-01", fim: "2026-11-30" };
const meta: MetaRetorno = {
  id: "m1",
  empresa_id: "mimo",
  chave: "chave-m1",
  campanha: "Campanha A",
  conjunto: "Conjunto",
  anuncio: "Anúncio",
  data_inicio: "2026-11-01",
  data_fim: "2026-11-01",
  investimento: 12.34,
  leads_meta: 2,
};
const lead: LeadRetorno & { campanha_origem: string; anuncio_origem: string } = {
  id: "l1",
  empresa_id: "mimo",
  entrada_em: "2026-11-01T03:00:00Z",
  campanha_origem: "Campanha A",
  anuncio_origem: "Anúncio",
};
const pedido: PedidoRetorno = {
  id: "p1",
  empresa_id: "mimo",
  lead_id: "l1",
  total: 12345,
  status: "faturado",
  primeira_confirmacao: "2026-11-03T12:00:00Z",
};
const calcular = (
  m: MetaRetorno[] = [meta],
  l: LeadRetorno[] = [lead],
  p: PedidoRetorno[] | null = [pedido],
) => calcularRetornoCampanhas("mimo", periodo, m, l, p);
it("nomes exatamente iguais não viram vínculo estável de receita", () => {
  const r = calcular();
  expect(r.campanhas[0]).toMatchObject({
    investimento: 1234,
    leadsMeta: 2,
    cplMeta: 617,
    leadsCrm: null,
    pedidosFechados: null,
    receitaAtribuida: null,
    cac: null,
    roas: null,
  });
  expect(r.naoAtribuidos).toMatchObject({
    leads: 1,
    pedidos: 1,
    clientes: 1,
    receitaFaturada: 12345,
  });
});
it("deduplica por IDs e só liga pedidos ao lead exato, nunca ao nome", () => {
  const r = calcular(
    [meta, meta],
    [lead, lead],
    [pedido, pedido, { ...pedido, id: "p2" }, { ...pedido, id: "p3", lead_id: "outro-id" }],
  );
  expect(r.campanhas[0].investimento).toBe(1234);
  expect(r.naoAtribuidos).toEqual({
    leads: 1,
    pedidos: 2,
    clientes: 1,
    receitaFaturada: 24690,
    pedidosForaCoorte: 1,
    receitaForaCoorte: 12345,
  });
});
it("distingue ausência, zero e denominador zero", () => {
  expect(calcular([], [], []).avisos.semMeta).toBe(true);
  expect(calcular([], [], []).naoAtribuidos.receitaFaturada).toBe(0);
  expect(calcular([meta], [lead], null).naoAtribuidos.receitaFaturada).toBeNull();
  expect(calcular([{ ...meta, investimento: 0 }]).campanhas[0].cplMeta).toBe(0);
  expect(calcular([{ ...meta, leads_meta: 0 }]).campanhas[0].cplMeta).toBeNull();
  expect(calcular([{ ...meta, investimento: null }]).campanhas[0].investimento).toBeNull();
  expect(
    calcular([meta, { ...meta, id: "m2", chave: "chave2", anuncio: "Outro", investimento: null }])
      .campanhas[0].investimento,
  ).toBeNull();
});
it("mantém coorte e confirmação no período local e exclui Meta parcial", () => {
  const r = calcular(
    [meta, { ...meta, id: "parcial", chave: "parcial", data_inicio: "2026-10-31" }],
    [lead, { ...lead, id: "fora", entrada_em: "2026-11-01T02:59:59Z" }],
    [
      pedido,
      { ...pedido, id: "final", primeira_confirmacao: "2026-12-01T02:59:59Z" },
      { ...pedido, id: "depois", primeira_confirmacao: "2026-12-01T03:00:00Z" },
    ],
  );
  expect(r.avisos.parciais).toBe(1);
  expect(r.campanhas[0].investimento).toBe(1234);
  expect(r.naoAtribuidos.leads).toBe(1);
  expect(r.naoAtribuidos.pedidos).toBe(2);
});
it("não mistura empresa ou soma cancelamentos, rascunhos e legado", () => {
  const r = calcular(
    [meta, { ...meta, id: "m2", empresa_id: "outra" }],
    [lead, { ...lead, id: "l2", empresa_id: "outra" }],
    [
      pedido,
      { ...pedido, id: "p2", empresa_id: "outra" },
      { ...pedido, id: "cancelado", status: "cancelado" },
      { ...pedido, id: "rascunho", status: "rascunho" },
      { ...pedido, id: "confirmado", status: "confirmado" },
    ],
  );
  expect(r.naoAtribuidos).toMatchObject({ leads: 1, pedidos: 2, receitaFaturada: 12345 });
  expect(r.campanhas[0].investimento).toBe(1234);
});
it("recusa totais sobrepostos do mesmo anúncio e de agregado com detalhe", () => {
  const mensal = {
    ...meta,
    id: "mensal",
    chave: "mensal",
    data_fim: "2026-11-30",
    investimento: 50,
  };
  expect(calcular([meta, mensal]).campanhas[0]).toMatchObject({
    sobreposto: true,
    investimento: null,
    cplMeta: null,
  });
  expect(
    calcular([meta, { ...mensal, conjunto: "", anuncio: "" }]).campanhas[0].investimento,
  ).toBeNull();
  expect(
    calcular([
      meta,
      { ...meta, id: "outro", chave: "outra", anuncio: "Outro anúncio", investimento: 0.01 },
    ]).campanhas[0].investimento,
  ).toBe(1235);
});
it("recusa snapshot conflitante e repetição da chave canônica", () => {
  expect(() => calcular([meta, { ...meta, investimento: 99 }])).toThrow(/mudaram/);
  expect(() => calcular([meta, { ...meta, id: "duplicado" }])).toThrow(/duplicadas/);
});
it("mantém nomes de campanhas diferentes sem correspondência aproximada", () => {
  const r = calcular([meta, { ...meta, id: "m2", chave: "outra", campanha: "Campanha A - teste" }]);
  expect(r.campanhas).toHaveLength(2);
  expect(r.campanhas.every((c) => c.receitaAtribuida === null)).toBe(true);
});
it("recusa datas inválidas, período invertido e intervalo superior a um ano", () => {
  expect(filtroRetornoSchema.safeParse({ inicio: "2026-02-30", fim: "2026-03-01" }).success).toBe(
    false,
  );
  expect(filtroRetornoSchema.safeParse({ inicio: "2026-12-01", fim: "2026-11-01" }).success).toBe(
    false,
  );
  expect(filtroRetornoSchema.safeParse({ inicio: "2024-01-01", fim: "2026-11-01" }).success).toBe(
    false,
  );
});
