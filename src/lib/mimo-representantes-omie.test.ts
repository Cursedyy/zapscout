import { describe, expect, it } from "vitest";
import {
  atribuirClienteOmie,
  calcularDesempenhoOmie,
  csvDesempenhoOmie,
  documentoNormalizado,
  manuaisPorDocumento,
  normalizarClienteOmie,
  normalizarNotasOmie,
  reaisOmieParaCentavos,
  type ClienteOmieRep,
  type ResultadoFaturamentoOmie,
} from "./mimo-representantes-omie";
import {
  PERIODO_OMIE,
  R_INATIVO,
  R_SEC,
  R_SP,
  R_SUL,
  baseSintetica,
  notaSintetica,
} from "./mimo-representantes-omie.fixtures";

const CNPJ_MANUAL = "11222333000181";

describe("documentos e valores", () => {
  it.each([
    ["11.222.333/0001-81", "11222333000181"],
    ["123.456.789-09", "12345678909"],
    ["1222333000181", "01222333000181"], // zero à esquerda perdido
    ["", ""],
    ["123", ""],
    [null, ""],
  ])("%s → %s", (v, esperado) => expect(documentoNormalizado(v)).toBe(esperado));

  it.each([
    [1234.56, 123456],
    [0.29, 29],
    [19.99, 1999],
    ["10.5", 1050],
    [0, 0],
    [-1, null],
    ["1,50", null],
    [Number.NaN, null],
  ])("%s → %s centavos", (v, c) => expect(reaisOmieParaCentavos(v)).toBe(c));
});

describe("notas fiscais do Omie", () => {
  it("inclui só NF-e de saída normais, autorizadas e emitidas no período", () => {
    const r = normalizarNotasOmie(
      [
        notaSintetica({ id: 1, cliente: 10, valor: 100 }),
        notaSintetica({ id: 2, cliente: 10, valor: 200, dCan: "12/11/2026" }),
        notaSintetica({ id: 3, cliente: 10, valor: 300, cDeneg: "S" }),
        notaSintetica({ id: 4, cliente: 10, valor: 400, dInut: "12/11/2026" }),
        notaSintetica({ id: 5, cliente: 10, valor: 500, tpNF: "0" }),
        notaSintetica({ id: 6, cliente: 10, valor: 600, finNFe: "4" }),
        notaSintetica({ id: 7, cliente: 10, valor: 700, finNFe: "2" }),
        notaSintetica({ id: 8, cliente: 10, valor: 800, finNFe: "3" }),
        notaSintetica({ id: 9, cliente: 10, valor: 900, tpAmb: "2" }),
        notaSintetica({ id: 10, cliente: 10, valor: 1000, emissao: "31/10/2026" }),
        notaSintetica({
          id: 11,
          cliente: 11,
          valor: "12.34",
          emissao: "27/11/2026",
          doc: "11.222.333/0001-81",
        }),
        notaSintetica({ id: 1, cliente: 10, valor: 100 }), // duplicada
        { compl: { nIdNF: 12 }, ide: { dEmi: "10/11/2026" } }, // sem cliente/valor
        notaSintetica({ id: 13, cliente: 10, valor: 1, emissao: "31/02/2026" }), // data inexistente
      ],
      PERIODO_OMIE,
    );
    expect(r.notas.map((n) => [n.id, n.valor, n.emissao])).toEqual([
      [1, 10000, "2026-11-10"],
      [11, 1234, "2026-11-27"],
    ]);
    expect(r.notas[1].documento).toBe(CNPJ_MANUAL);
    expect(r.duplicadas).toBe(1);
    expect(r.invalidas).toBe(2);
    expect(r.excluidas.cancelada).toEqual({ quantidade: 1, valor: 20000 });
    expect(r.excluidas.denegada.quantidade).toBe(1);
    expect(r.excluidas.inutilizada.quantidade).toBe(1);
    expect(r.excluidas.entrada.quantidade).toBe(1);
    expect(r.excluidas.devolucao).toEqual({ quantidade: 1, valor: 60000 });
    expect(r.excluidas.complementar_ajuste.quantidade).toBe(2);
    expect(r.excluidas.homologacao.quantidade).toBe(1);
    expect(r.excluidas.fora_periodo.quantidade).toBe(1);
  });

  it("aceita tipos numéricos nos campos de texto do Omie", () => {
    const n = notaSintetica({ id: 1, cliente: 10, valor: 50 }) as Record<string, unknown>;
    n.ide = { ...(n.ide as object), tpNF: 1, finNFe: 1 };
    expect(normalizarNotasOmie([n], PERIODO_OMIE).notas).toHaveLength(1);
  });
});

describe("clientes do Omie", () => {
  it("lê UF e documento; UF vazia ou exterior fica nula", () => {
    expect(normalizarClienteOmie({ codigo_cliente_omie: 5, estado: "pr", cnpj_cpf: "1" })).toEqual({
      codigo: 5,
      uf: "PR",
      documento: "",
    });
    expect(normalizarClienteOmie({ codigo_cliente_omie: "6", estado: "EX" })?.uf).toBeNull();
    expect(normalizarClienteOmie({ codigo_cliente_omie: 0, estado: "SP" })).toBeNull();
    expect(normalizarClienteOmie("x")).toBeNull();
  });
});

describe("atribuição do cliente do Omie", () => {
  const b = baseSintetica();
  const principais = new Map([
    ["PR", R_SUL],
    ["SP", R_SP],
  ]);
  const manuais = manuaisPorDocumento(b.clientes, b.unidadesManuais);
  const validos = new Set([R_SUL, R_SEC, R_SP, R_INATIVO]);
  const cli = (uf: string | null, documento = ""): ClienteOmieRep => ({
    codigo: 1,
    uf,
    documento,
  });

  it("atribuição manual da unidade vence a UF quando o CNPJ casa", () => {
    expect(atribuirClienteOmie(CNPJ_MANUAL, cli("SP"), principais, manuais, validos)).toEqual({
      representanteId: R_SEC,
      origem: "manual",
    });
    // CNPJ só no cadastro do cliente (nota sem documento) também casa; sem consultar UF.
    expect(atribuirClienteOmie("", cli("SP", CNPJ_MANUAL), principais, manuais, validos)).toEqual({
      representanteId: R_SEC,
      origem: "manual",
    });
    expect(atribuirClienteOmie(CNPJ_MANUAL, undefined, principais, manuais, validos)).toEqual({
      representanteId: R_SEC,
      origem: "manual",
    });
  });

  it("sem atribuição manual usa o principal ativo da UF do Omie", () => {
    expect(atribuirClienteOmie("99999999000199", cli("PR"), principais, manuais, validos)).toEqual({
      representanteId: R_SUL,
      origem: "uf",
    });
  });

  it.each([
    ["cliente_nao_consultado", undefined],
    ["cliente_sem_uf", cli(null)],
    ["uf_sem_principal", cli("BA")],
  ] as const)("Sem representante: %s", (motivo, c) => {
    expect(atribuirClienteOmie("", c, principais, manuais, validos)).toEqual({
      representanteId: null,
      origem: null,
      motivo,
    });
  });

  it("documento ligado a unidades com representantes manuais diferentes não é dividido", () => {
    const m = manuaisPorDocumento(
      [
        { unidade_id: "u1", representante_id: R_SUL },
        { unidade_id: "u2", representante_id: R_SP },
        { unidade_id: "u3", representante_id: null }, // automático: ignorada
      ],
      [
        { unidade_id: "u1", cnpj: CNPJ_MANUAL },
        { unidade_id: "u2", cnpj: "11.222.333/0001-81" },
        { unidade_id: "u3", cnpj: CNPJ_MANUAL },
      ],
    );
    expect(m.get(CNPJ_MANUAL)).toBeNull();
    expect(atribuirClienteOmie(CNPJ_MANUAL, cli("PR"), principais, m, validos)).toMatchObject({
      motivo: "atribuicoes_divergentes",
    });
  });
});

describe("desempenho pelo Omie", () => {
  function calcular() {
    const b = baseSintetica();
    const { notas } = normalizarNotasOmie(
      [
        // Cliente 10 (PR, sem manual) → principal PR: 1.000,01 + 234,56
        notaSintetica({ id: 1, cliente: 10, valor: 1000.01, doc: "99.999.999/0001-99" }),
        notaSintetica({ id: 2, cliente: 10, valor: 234.56, doc: "99.999.999/0001-99" }),
        // Cliente 20 casa com a unidade manual (secundário), apesar de UF SP no Omie.
        notaSintetica({ id: 3, cliente: 20, valor: 0.1, doc: CNPJ_MANUAL }),
        // Cliente 30 SP → R_SP.
        notaSintetica({ id: 4, cliente: 30, valor: 99.99 }),
        // Cliente 40 RJ: principal inativo → Sem representante.
        notaSintetica({ id: 5, cliente: 40, valor: 50 }),
        // Cliente 50 não consultado.
        notaSintetica({ id: 6, cliente: 50, valor: 7 }),
        // Cancelada: não entra em nada.
        notaSintetica({ id: 7, cliente: 10, valor: 5000, dCan: "11/11/2026" }),
      ],
      PERIODO_OMIE,
    );
    const clientesOmie = new Map<number, ClienteOmieRep>([
      [10, { codigo: 10, uf: "PR", documento: "99999999000199" }],
      [20, { codigo: 20, uf: "SP", documento: CNPJ_MANUAL }],
      [30, { codigo: 30, uf: "SP", documento: "" }],
      [40, { codigo: 40, uf: "RJ", documento: "" }],
    ]);
    return calcularDesempenhoOmie({ ...b, notas, clientesOmie });
  }

  it("soma notas por representante e calcula a comissão sobre o total do período", () => {
    const d = calcular();
    const sul = d.linhas.find((l) => l.representanteId === R_SUL)!;
    expect(sul).toMatchObject({ pedidos: 2, faturamento: 123457, clientesFaturados: 1 });
    // 1.234,57 × 5% = 61,7285 → 61,73 (uma vez sobre o total, não por nota).
    expect(sul.comissao).toBe(6173);
    // Carteira como hoje: U_PR automática; U_MANUAL manual do secundário.
    expect(sul.clientes).toBe(1);
    const sec = d.linhas.find((l) => l.representanteId === R_SEC)!;
    expect(sec).toMatchObject({
      pedidos: 1,
      faturamento: 10,
      comissao: 0, // 0,10 × 3,5% = 0,0035 → 0
      clientes: 1,
      clientesManuais: 1,
    });
    const sp = d.linhas.find((l) => l.representanteId === R_SP)!;
    expect(sp).toMatchObject({ faturamento: 9999, comissao: 425 }); // 99,99 × 4,25% = 4,2496 → 4,25
    expect(d.semRepresentante).toMatchObject({
      notas: 2,
      faturamento: 5700,
      clientesFaturados: 2,
      clientes: 1, // U_SEM_UF
      motivosClientes: { sem_uf: 1, uf_sem_principal: 0 },
    });
    expect(d.semRepresentante.motivosNotas.uf_sem_principal).toEqual({
      notas: 1,
      faturamento: 5000,
    });
    expect(d.semRepresentante.motivosNotas.cliente_nao_consultado).toEqual({
      notas: 1,
      faturamento: 700,
    });
    expect(d.total).toEqual({
      clientes: 3,
      notas: 6,
      faturamento: 123457 + 10 + 9999 + 5700,
      comissao: 6173 + 0 + 425 + 0,
    });
    // Inativo continua listado, sem faturamento automático.
    expect(d.linhas.find((l) => l.representanteId === R_INATIVO)?.faturamento).toBe(0);
  });

  it("exporta CSV com fonte, Sem representante, total e proteção contra fórmulas", () => {
    const d = calcular();
    d.linhas[0].nome = "=HYPERLINK()";
    const r: ResultadoFaturamentoOmie = {
      ...d,
      periodo: PERIODO_OMIE,
      geradoEm: "2026-11-27T12:00:00.000Z",
      notasLidas: 7,
      notasConsideradas: 6,
      invalidas: 0,
      duplicadas: 0,
      excluidas: normalizarNotasOmie([], PERIODO_OMIE).excluidas,
      clientesOmie: { consultados: 4, naoConsultados: 1 },
      avisos: [],
    };
    const csv = csvDesempenhoOmie(r);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain('"Omie (NF-e de saída)"');
    expect(csv).toContain(`"'=HYPERLINK()"`);
    expect(csv).toMatch(/"Sem representante".*"57,00"/);
    expect(csv).toMatch(/"Total".*"1391,66";"65,98"/);
  });
});
