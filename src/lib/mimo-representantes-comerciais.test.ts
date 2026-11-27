import { describe, expect, it } from "vitest";
import {
  calcularComissaoCentavos,
  calcularDesempenho,
  chaveNome,
  comissaoParaBps,
  csvDesempenho,
  formatarBps,
  lerTextoTabela,
  periodoPadrao,
  periodoRepresentantesSchema,
  podeGerenciarRepresentantesComerciais,
  prepararPlanilhaRepresentantes,
  type RepresentanteComercial,
  type TerritorioRepresentante,
} from "./mimo-representantes-comerciais";
import { PAPEIS_MIMO, podeAbrirPagina } from "./mimo-acesso";

// Fixtures sintéticas; nenhum dado real da planilha de representantes.
const CAB = ["REGIÃO", "ESTADO", "UF", "REPRESENTANTE(S)", "COMISSÕES %", "CONTAR UF"];

describe("comissão em pontos-base", () => {
  it.each([
    [0.035, "planilha", 350],
    [0.05, "planilha", 500],
    ["0,035", "planilha", 350],
    ["3,5%", "planilha", 350],
    [3.5, "planilha", 350],
    [0.035000000000000003, "planilha", 350],
    ["3,5", "percentual", 350],
    ["4.25", "percentual", 425],
    ["0", "percentual", 0],
  ] as const)("%s (%s) → %s", (v, modo, bps) => expect(comissaoParaBps(v, modo)).toBe(bps));
  it.each([["abc"], ["-1"], ["101"], [0.12345], ["3,555%"], [null], [Number.NaN]])(
    "recusa %s",
    (v) => expect(comissaoParaBps(v, "planilha")).toBeNull(),
  );
  it("formata e calcula sem ponto flutuante", () => {
    expect(formatarBps(350)).toBe("3,5%");
    expect(formatarBps(500)).toBe("5%");
    expect(formatarBps(425)).toBe("4,25%");
    expect(calcularComissaoCentavos(100_00, 350)).toBe(3_50);
    // 0,5 centavo arredonda para cima; 0,49 para baixo.
    expect(calcularComissaoCentavos(10, 500)).toBe(1); // 0,5 centavo
    expect(calcularComissaoCentavos(14, 350)).toBe(0); // 0,49
    expect(calcularComissaoCentavos(9_007_199_254_740_991, 10000)).toBe(9_007_199_254_740_991);
    expect(() => calcularComissaoCentavos(1.5, 350)).toThrow();
  });
});

describe("planilha", () => {
  it("lê PR/SC com dois representantes usando CONTAR UF", () => {
    const r = prepararPlanilhaRepresentantes([
      ["Tabela de representantes"],
      CAB,
      ["Sul", "Paraná", "PR", "Rep Alfa", 0.05, 1],
      ["Sul", "Paraná", "PR", "Rep Beta", 0.035, 0],
      ["Sul", "Santa Catarina", "SC", "Rep Beta", 0.035, 1],
      ["Sul", "Santa Catarina", "SC", "Rep Alfa", 0.05, 0],
      ["Sudeste", "São Paulo", "SP", "Rep Alfa", 0.05, 1],
      [null, null, null, null, null, null],
    ]);
    expect(r.erros).toEqual([]);
    expect(r.payload?.representantes).toEqual([
      { nome: "Rep Alfa", comissao_bps: 500 },
      { nome: "Rep Beta", comissao_bps: 350 },
    ]);
    expect(
      r.payload?.territorios.filter((t) => t.principal).map((t) => `${t.uf}:${t.nome}`),
    ).toEqual(["PR:Rep Alfa", "SC:Rep Beta", "SP:Rep Alfa"]);
  });
  it("aponta comissão divergente, UF inválida, dois principais e falta de CONTAR UF", () => {
    expect(
      prepararPlanilhaRepresentantes([
        CAB,
        ["", "", "PR", "Rep A", 0.05, 1],
        ["", "", "SC", "Rep A", 0.035, 1],
      ]).erros[0].mensagem,
    ).toMatch(/comissão diferente/);
    expect(
      prepararPlanilhaRepresentantes([CAB, ["", "", "XX", "Rep A", 0.05, 1]]).erros[0].mensagem,
    ).toMatch(/UF inválida/);
    expect(
      prepararPlanilhaRepresentantes([
        CAB,
        ["", "", "PR", "Rep A", 0.05, 1],
        ["", "", "PR", "Rep B", 0.05, 1],
      ]).erros[0].mensagem,
    ).toMatch(/mais de um representante principal/);
    const semContar = [
      ["UF", "REPRESENTANTE", "COMISSAO"],
      ["PR", "Rep A", "5%"],
      ["PR", "Rep B", "5%"],
      ["SP", "Rep A", "5%"],
    ];
    const r = prepararPlanilhaRepresentantes(semContar);
    expect(r.erros).toHaveLength(1);
    expect(r.erros[0].mensagem).toMatch(/PR tem mais de um representante/);
    expect(
      prepararPlanilhaRepresentantes([semContar[0], semContar[3]]).payload?.territorios[0]
        .principal,
    ).toBe(true);
    expect(prepararPlanilhaRepresentantes([["Nome", "CNPJ"]]).erros[0].mensagem).toMatch(
      /Cabeçalho/,
    );
  });
  it("avisa UF sem principal e ignora UF sem representante", () => {
    const r = prepararPlanilhaRepresentantes([
      CAB,
      ["", "", "AM", "", "", ""],
      ["", "", "PA", "Rep A", 0.05, 0],
    ]);
    expect(r.erros).toEqual([]);
    expect(r.avisos.join(" ")).toMatch(/AM sem representante/);
    expect(r.avisos.join(" ")).toMatch(/PA não tem representante principal/);
  });
  it("aceita texto colado do Excel e CSV", () => {
    const colado = `${CAB.join("\t")}\r\nSul\tParaná\tPR\tRep A\t0,05\t1\r\n`;
    expect(prepararPlanilhaRepresentantes(lerTextoTabela(colado)).payload?.representantes).toEqual([
      { nome: "Rep A", comissao_bps: 500 },
    ]);
    const csv = `\uFEFF${CAB.join(";")}\n"Sul";"Paraná";"PR";"Rep ""A""";"5%";"1"`;
    expect(
      prepararPlanilhaRepresentantes(lerTextoTabela(csv)).payload?.representantes[0].nome,
    ).toBe('Rep "A"');
  });
  it("chave igual à do banco ignora acento, caixa e espaços", () => {
    expect(chaveNome("  José   Conceição ")).toBe(chaveNome("jose conceicao"));
  });
});

const rep = (id: string, nome: string, bps: number, ativo = true) =>
  ({ id, nome, comissao_bps: bps, ativo }) as RepresentanteComercial;
const ter = (uf: string, representante_id: string, principal: boolean) =>
  ({ uf, representante_id, principal }) as TerritorioRepresentante;

describe("desempenho", () => {
  const base = {
    representantes: [
      rep("A", "Rep Alfa", 500),
      rep("B", "Rep Beta", 350),
      rep("C", "Rep Inativo", 500, false),
    ],
    territorios: [
      ter("PR", "A", true),
      ter("PR", "B", false),
      ter("SC", "B", true),
      ter("SC", "A", false),
      ter("RS", "C", true),
    ],
    clientes: [
      { unidade_id: "u3", representante_id: "B" },
      { unidade_id: "u2", representante_id: null },
    ],
    unidades: [
      { id: "u1", uf: "PR" },
      { id: "u2", uf: "pr " },
      { id: "u3", uf: "PR" },
      { id: "u4", uf: "SC" },
      { id: "u5", uf: "" },
      { id: "u6", uf: "RS" },
      { id: "u7", uf: "AM" },
    ],
    negociacoes: [
      { unidade_id: "u1", lead_id: "L1" },
      { unidade_id: "u3", lead_id: "L3" },
      { unidade_id: "u4", lead_id: "L4" },
      { unidade_id: "u1", lead_id: "L14" },
      { unidade_id: "u4", lead_id: "L14" },
      { unidade_id: "u5", lead_id: "L5" },
    ],
    pedidos: [
      { id: "p1", lead_id: "L1", status: "faturado", total: 100_000, faturado_em: "2026-11-02" },
      { id: "p1", lead_id: "L1", status: "faturado", total: 100_000, faturado_em: "2026-11-02" },
      { id: "p2", lead_id: "L1", status: "entregue", total: 3_33, faturado_em: "2026-11-03" },
      { id: "p3", lead_id: "L3", status: "enviado", total: 20_000, faturado_em: "2026-11-04" },
      { id: "p4", lead_id: "L4", status: "faturado", total: 50_000, faturado_em: "2026-11-05" },
      { id: "p5", lead_id: "L14", status: "faturado", total: 7_000, faturado_em: "2026-11-05" },
      { id: "p6", lead_id: "L5", status: "faturado", total: 1_000, faturado_em: "2026-11-05" },
      { id: "p7", lead_id: "Lx", status: "faturado", total: 900, faturado_em: "2026-11-05" },
      { id: "p8", lead_id: "L1", status: "cancelado", total: 999_999, faturado_em: "2026-11-05" },
    ],
  };
  const d = calcularDesempenho(base);
  const porNome = Object.fromEntries(d.linhas.map((l) => [l.nome, l]));

  it("principal da UF recebe automaticamente; manual vence; secundário/inativo não recebem", () => {
    expect(porNome["Rep Alfa"]).toMatchObject({
      clientes: 2, // u1 e u2 (PR); u3 foi atribuído manualmente ao Beta
      clientesManuais: 0,
      pedidos: 2,
      faturamento: 100_333,
      comissao: 5_017, // 100.333 × 5% = 5.016,65 → 5.017
      ufsPrincipais: ["PR"],
      ufsSecundarias: ["SC"],
    });
    expect(porNome["Rep Beta"]).toMatchObject({
      clientes: 2,
      clientesManuais: 1,
      pedidos: 2,
      faturamento: 70_000,
      comissao: 2_450,
    });
    expect(porNome["Rep Inativo"]).toMatchObject({ clientes: 0, pedidos: 0, faturamento: 0 });
  });
  it("Sem representante separa motivos sem duplicar nem dividir pedidos", () => {
    expect(d.semRepresentante).toMatchObject({
      clientes: 3,
      motivosClientes: { sem_uf: 1, uf_sem_principal: 2 },
      pedidos: 3,
      faturamento: 8_900,
      motivosPedidos: {
        unidades_divergentes: { pedidos: 1, faturamento: 7_000 },
        unidade_sem_representante: { pedidos: 1, faturamento: 1_000 },
        pedido_sem_unidade: { pedidos: 1, faturamento: 900 },
      },
    });
    expect(d.total).toEqual({ clientes: 7, pedidos: 7, faturamento: 179_233, comissao: 7_467 });
  });
  it("exporta CSV com ; e protege contra fórmulas", () => {
    const x = calcularDesempenho({ ...base, representantes: [rep("A", "=HYPERLINK(1)", 500)] });
    const csv = csvDesempenho(x, { de: "2026-11-01", ate: "2026-11-30" });
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain(`"'=HYPERLINK(1)"`);
    expect(csv).toContain(`"1003,33"`);
    expect(csv).toContain(`"Sem representante"`);
  });
});

describe("acesso", () => {
  it("somente administrador e gestor abrem a página e gerenciam", () => {
    for (const p of PAPEIS_MIMO) {
      const gestao = p === "administrador" || p === "gestor";
      expect(podeAbrirPagina(p, "/mimo/representantes-comerciais")).toBe(gestao);
      expect(podeGerenciarRepresentantesComerciais(p)).toBe(gestao);
    }
  });
});

describe("período", () => {
  it("valida intervalo de até um ano e usa a data de São Paulo", () => {
    expect(
      periodoRepresentantesSchema.safeParse({ de: "2026-11-01", ate: "2026-11-30" }).success,
    ).toBe(true);
    expect(
      periodoRepresentantesSchema.safeParse({ de: "2026-12-01", ate: "2026-11-30" }).success,
    ).toBe(false);
    expect(
      periodoRepresentantesSchema.safeParse({ de: "2025-01-01", ate: "2026-11-30" }).success,
    ).toBe(false);
    expect(
      periodoRepresentantesSchema.safeParse({ de: "2026-02-30", ate: "2026-03-01" }).success,
    ).toBe(false);
    expect(periodoPadrao(new Date("2026-12-01T02:00:00Z"))).toEqual({
      de: "2026-11-01",
      ate: "2026-11-30",
    });
  });
});
