import { expect, it } from "vitest";
import {
  calcularRetornoCampanhas,
  type LeadRetorno,
  type MetaRetorno,
  type PedidoRetorno,
} from "./mimo-retorno-campanhas";
import type { DadosCodigosRetorno } from "./mimo-campanhas-codigos";

// Fixtures sintéticas: nenhum dado real da MiMo.
const periodo = { inicio: "2026-11-01", fim: "2026-11-30" };
const meta = (extra: Partial<MetaRetorno> = {}): MetaRetorno => ({
  id: "m1",
  empresa_id: "mimo",
  chave: "m1",
  campanha_id: "1001",
  conjunto_id: "2001",
  anuncio_id: "3001",
  campanha: "Campanha A",
  conjunto: "C",
  anuncio: "A",
  data_inicio: "2026-11-02",
  data_fim: "2026-11-02",
  investimento: 100,
  leads_meta: 4,
  ...extra,
});
const lead = (
  id: string,
  codigo: string | null,
  extra: Partial<LeadRetorno> = {},
): LeadRetorno => ({
  id,
  empresa_id: "mimo",
  entrada_em: "2026-11-05T12:00:00Z",
  campanha_codigo_id: codigo,
  campanha_codigo_origem: codigo ? "manual" : null,
  ...extra,
});
const pedido = (id: string, leadId: string, extra: Partial<PedidoRetorno> = {}): PedidoRetorno => ({
  id,
  empresa_id: "mimo",
  lead_id: leadId,
  status: "faturado",
  total: 50000,
  primeira_confirmacao: "2026-11-10T12:00:00Z",
  ...extra,
});
const dados = (extra: Partial<DadosCodigosRetorno> = {}): DadosCodigosRetorno => ({
  codigos: [
    { id: "k1", empresa_id: "mimo", codigo: "BF26", nome: "Black Friday", ativo: true },
    { id: "k2", empresa_id: "mimo", codigo: "FEIRA", nome: "Feira", ativo: false },
  ],
  vinculos: [{ empresa_id: "mimo", codigo_id: "k1", campanha_id: "1001" }],
  investimentos: [
    {
      id: "i1",
      empresa_id: "mimo",
      codigo_id: "k2",
      competencia: "2026-11-15",
      valor_centavos: 30000,
      anulado_em: null,
    },
  ],
  metaComIds: true,
  ...extra,
});
const calcular = (
  m: MetaRetorno[],
  l: LeadRetorno[],
  p: PedidoRetorno[] | null,
  d: DadosCodigosRetorno | null = dados(),
) => calcularRetornoCampanhas("mimo", periodo, m, l, p, [], d);
const codigo = (r: ReturnType<typeof calcular>, cod: string) =>
  r.porCodigo!.codigos.find((c) => c.codigo === cod)!;

it("soma investimento Meta pelo ID vinculado + manual e atribui leads/pedidos pelo código do lead", () => {
  const r = calcular(
    [
      meta(),
      meta({
        id: "m2",
        chave: "m2",
        campanha_id: "9999",
        campanha: "Outra",
        anuncio_id: "3999",
        investimento: 7,
      }),
    ],
    [
      lead("l1", "k1", { campanha_codigo_origem: "anuncio_meta" }),
      lead("l2", "k1"),
      lead("l3", "k2"),
      lead("l4", null),
    ],
    [pedido("p1", "l1"), pedido("p2", "l3", { total: 90000 }), pedido("p3", "l4", { total: 1000 })],
  );
  expect(codigo(r, "BF26")).toMatchObject({
    campanhasMeta: ["1001"],
    investimentoMeta: 10000,
    investimentoManual: 0,
    investimento: 10000,
    leadsMeta: 4,
    leadsCrm: 2,
    leadsAutomaticos: 1,
    cplCrm: 5000,
    pedidos: 1,
    receita: 50000,
    cac: 10000,
    roas: 5,
  });
  expect(codigo(r, "FEIRA")).toMatchObject({
    ativo: false,
    investimentoMeta: 0,
    investimentoManual: 30000,
    investimento: 30000,
    leadsCrm: 1,
    pedidos: 1,
    receita: 90000,
    roas: 3,
  });
  expect(r.porCodigo!.semCodigo).toEqual({
    leads: 1,
    pedidos: 1,
    receita: 1000,
    investimentoMeta: 700,
  });
});

it("nomes iguais, texto de campanha e UTMs não atribuem: só o ID vinculado", () => {
  const r = calcular(
    [meta({ campanha_id: "5555", campanha: "Black Friday" })],
    [lead("l1", null)],
    [pedido("p1", "l1")],
  );
  expect(codigo(r, "BF26")).toMatchObject({
    investimentoMeta: 0,
    leadsCrm: 0,
    pedidos: 0,
    receita: 0,
    roas: null,
    cac: null,
  });
  expect(r.porCodigo!.semCodigo).toMatchObject({
    leads: 1,
    pedidos: 1,
    receita: 50000,
    investimentoMeta: 10000,
  });
});

it("marketing: pedidos, faturamento, CAC e retorno ficam indisponíveis, não zero", () => {
  const r = calcular([meta()], [lead("l1", "k1")], null);
  expect(codigo(r, "BF26")).toMatchObject({
    investimento: 10000,
    leadsCrm: 1,
    pedidos: null,
    receita: null,
    cac: null,
    roas: null,
  });
  expect(r.porCodigo!.semCodigo).toMatchObject({ pedidos: null, receita: null });
});

it("ignora investimentos anulados, fora do período ou de outra empresa e códigos de outra empresa", () => {
  const r = calcular(
    [],
    [lead("l1", "k9"), lead("l2", "k1", { empresa_id: "outra" })],
    [],
    dados({
      codigos: [
        ...dados().codigos,
        { id: "k9", empresa_id: "outra", codigo: "X", nome: "X", ativo: true },
      ],
      investimentos: [
        {
          id: "a",
          empresa_id: "mimo",
          codigo_id: "k1",
          competencia: "2026-11-01",
          valor_centavos: 100,
          anulado_em: null,
        },
        {
          id: "b",
          empresa_id: "mimo",
          codigo_id: "k1",
          competencia: "2026-11-30",
          valor_centavos: 200,
          anulado_em: null,
        },
        {
          id: "c",
          empresa_id: "mimo",
          codigo_id: "k1",
          competencia: "2026-12-01",
          valor_centavos: 400,
          anulado_em: null,
        },
        {
          id: "d",
          empresa_id: "mimo",
          codigo_id: "k1",
          competencia: "2026-11-10",
          valor_centavos: 800,
          anulado_em: "2026-11-11T00:00:00Z",
        },
        {
          id: "e",
          empresa_id: "outra",
          codigo_id: "k1",
          competencia: "2026-11-10",
          valor_centavos: 1600,
          anulado_em: null,
        },
      ],
    }),
  );
  expect(r.porCodigo!.codigos.map((c) => c.codigo)).toEqual(["BF26", "FEIRA"]);
  expect(codigo(r, "BF26").investimentoManual).toBe(300);
  expect(codigo(r, "BF26").leadsCrm).toBe(0);
  expect(r.porCodigo!.semCodigo.leads).toBe(1);
});

it("pedido herda o código só pelo lead exato da coorte; cancelado e fora do período não contam", () => {
  const r = calcular(
    [],
    [lead("l1", "k1"), lead("antigo", "k1", { entrada_em: "2026-10-01T12:00:00Z" })],
    [
      pedido("p1", "l1", { status: "confirmado" }),
      pedido("p2", "l1", { status: "cancelado" }),
      pedido("p3", "l1", { primeira_confirmacao: "2026-12-02T12:00:00Z" }),
      pedido("p4", "antigo"),
    ],
  );
  expect(codigo(r, "BF26")).toMatchObject({ leadsCrm: 1, pedidos: 1, receita: 0 });
  expect(r.naoAtribuidos.pedidosForaCoorte).toBe(1);
});

it("investimento Meta sobreposto, sem valor ou sem IDs no esquema fica indisponível", () => {
  const mensal = meta({
    id: "mensal",
    chave: "mensal",
    data_inicio: "2026-11-01",
    data_fim: "2026-11-30",
  });
  expect(codigo(calcular([meta(), mensal], [], []), "BF26")).toMatchObject({
    investimentoMeta: null,
    investimento: null,
    cac: null,
    roas: null,
  });
  expect(codigo(calcular([meta({ investimento: null })], [], []), "BF26").investimento).toBeNull();
  const legado = calcular(
    [meta({ campanha_id: "" })],
    [lead("l1", "k1")],
    [pedido("p1", "l1")],
    dados({ metaComIds: false }),
  );
  expect(codigo(legado, "BF26")).toMatchObject({
    investimentoMeta: null,
    investimento: null,
    receita: 50000,
    roas: null,
  });
  // Código sem campanha Meta vinculada continua com o investimento manual mesmo sem IDs no esquema.
  expect(codigo(legado, "FEIRA")).toMatchObject({ investimentoMeta: 0, investimento: 30000 });
});

it("distingue zero conhecido de indisponível e recusa vínculo Meta conflitante", () => {
  const r = calcular([], [], []);
  expect(codigo(r, "BF26")).toMatchObject({
    investimento: 0,
    leadsCrm: 0,
    cplCrm: null,
    cac: null,
    roas: null,
    pedidos: 0,
    receita: 0,
  });
  expect(() =>
    calcular(
      [],
      [],
      [],
      dados({
        vinculos: [
          { empresa_id: "mimo", codigo_id: "k1", campanha_id: "1001" },
          { empresa_id: "mimo", codigo_id: "k2", campanha_id: "1001" },
        ],
      }),
    ),
  ).toThrow(/mais de um código/);
});

it("sem migração de códigos a seção fica ausente e o restante do retorno não muda", () => {
  const com = calcular([meta()], [lead("l1", "k1")], [pedido("p1", "l1")]);
  const sem = calcular([meta()], [lead("l1", "k1")], [pedido("p1", "l1")], null);
  expect(sem.porCodigo).toBeNull();
  const { porCodigo: _a, ...restoCom } = com;
  const { porCodigo: _b, ...restoSem } = sem;
  expect(restoSem).toEqual(restoCom);
});
