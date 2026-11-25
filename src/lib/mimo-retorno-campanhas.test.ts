import { expect, it } from "vitest";
import {
  calcularRetornoCampanhas,
  filtroRetornoSchema,
  type MetaRetorno,
  type LeadRetorno,
  type PedidoRetorno,
  type EventoRetorno,
} from "./mimo-retorno-campanhas";
const periodo = { inicio: "2026-11-01", fim: "2026-11-30" };
const meta: MetaRetorno = {
  id: "m1",
  empresa_id: "mimo",
  chave: "chave-m1",
  campanha_id: "1001",
  conjunto_id: "2001",
  anuncio_id: "3001",
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
const evento: EventoRetorno = { id: "e1", empresa_id: "mimo", lead_id: "l1", direcao: "recebida", contato_em: "2026-11-01T12:00:00Z", referencia_anuncio: { id: "3001", fonte: "metadado_whatsapp" } };
const calcular = (
  m: MetaRetorno[] = [meta],
  l: LeadRetorno[] = [lead],
  p: PedidoRetorno[] | null = [pedido],
  e: EventoRetorno[] = [],
) => calcularRetornoCampanhas("mimo", periodo, m, l, p, e);
it("nomes exatamente iguais não viram vínculo estável de receita", () => {
  const r = calcular();
  expect(r.campanhas[0]).toMatchObject({
    investimento: 1234,
    leadsMeta: 2,
    cplMeta: 617,
    leadsCrm: 0,
    pedidosFechados: 0,
    receitaAtribuida: 0,
    cac: null,
    roas: 0,
  });
  expect(r.naoAtribuidos).toMatchObject({
    leads: 1,
    pedidos: 1,
    clientes: 1,
    receitaFaturada: 12345,
  });
});
it("atribui Meta → lead → pedido apenas pelo ID exato autenticado", () => {
  const r = calcular([meta], [lead], [pedido], [evento, evento]);
  expect(r.campanhas[0]).toMatchObject({ campanhaId: "1001", leadsCrm: 1, pedidosFechados: 1, receitaAtribuida: 12345, cac: 1234, roas: 12345 / 1234 });
  expect(r.naoAtribuidos).toMatchObject({ leads: 0, pedidos: 0, receitaFaturada: 0, leadsAtribuidos: 1 });
});
it("não atribui sem chave, com chave não autenticada ou com múltiplas campanhas", () => {
  const outra = { ...meta, id: "m2", chave: "outra", campanha_id: "1002", campanha: "B", anuncio_id: "3002" };
  expect(calcular([meta], [lead], [pedido], [{ ...evento, referencia_anuncio: { id: "3001", fonte: "texto_livre" } }]).naoAtribuidos.leads).toBe(1);
  const r = calcular([meta, outra], [lead], [pedido], [evento, { ...evento, id: "e2", referencia_anuncio: { id: "3002", fonte: "metadado_whatsapp" } }]);
  expect(r.naoAtribuidos).toMatchObject({ leads: 1, leadsAtribuidos: 0, leadsAmbiguos: 1 });
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
    leadsAtribuidos: 0,
    leadsAmbiguos: 0,
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
it("mantém campanhas de IDs diferentes sem correspondência aproximada", () => {
  const r = calcular([meta, { ...meta, id: "m2", chave: "outra", campanha_id: "1002", campanha: "Campanha A - teste" }]);
  expect(r.campanhas).toHaveLength(2);
  expect(r.campanhas.every((c) => c.receitaAtribuida === 0)).toBe(true);
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
