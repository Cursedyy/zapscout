import { describe, it, expect } from "vitest";
import seed from "@/lib/__fixtures__/mimo-pricing.json";
import { podeAbrirPagina } from "./mimo-acesso";
import {
  linhaSchema,
  documentoSchema,
  calcular,
  agregar,
  aplicarPoliticas,
  revisar,
  type Linha,
  type Politica,
} from "./mimo-pricing";
const base = (): Linha => ({
  ...linhaSchema.parse(seed.linhas[0]),
  preco: "10",
  custo: "2",
  impostos: "0.1",
  despesas: [],
  quantidade: "10",
  bonus: "0",
  fixas: "0",
  meta: "0.2",
  varejista: { modo: "margem", taxa: "0.5" },
});
describe("Árvore Comercial", () => {
  it("protege a navegação por cargo e exige volume para ratear despesas por operação", () => {
    for (const papel of ["vendedor", "marketing", "administrativo"] as const)
      expect(podeAbrirPagina(papel, "/mimo/arvore-comercial")).toBe(false);
    for (const papel of ["administrador", "gestor"] as const)
      expect(podeAbrirPagina(papel, "/mimo/arvore-comercial")).toBe(true);
    expect(
      calcular(
        {
          ...base(),
          quantidade: null,
          despesas: [{ nome: "Frete", base: "operacao", valor: "5" }],
        },
        true,
      ).contribuicao,
    ).toBeNull();
  });
  it("calcula 114 registros fictícios, 19 SKUs e seis canais", () => {
    expect(seed.linhas).toHaveLength(114);
    expect(new Set(seed.linhas.map((l) => l.codigo)).size).toBe(19);
    for (const raw of seed.linhas) {
      const l = linhaSchema.parse(raw);
      const r = calcular({ ...l, quantidade: "1" });
      const esperado =
        Number(l.preco) *
          (1 - Number(l.impostos) - l.despesas.reduce((s, e) => s + Number(e.valor), 0)) -
        Number(l.custo);
      expect(Number(r.contribuicao)).toBeCloseTo(esperado, 9);
    }
    expect(revisar(seed.linhas.map((l) => linhaSchema.parse(l))).avisos).toContain(
      "Revisar custos diferentes entre canais: M001",
    );
  });
  it("distingue margem de markup sem arredondamento cumulativo", () => {
    const l = base();
    expect(Number(calcular(l).pdv)).toBe(20);
    expect(Number(calcular({ ...l, varejista: { modo: "markup", taxa: "0.5" } }).pdv)).toBe(15);
    expect(linhaSchema.safeParse({ ...l, varejista: { modo: "margem", taxa: "1" } }).success).toBe(
      false,
    );
  });
  it("desconto reduz receita; bônus custa sem receita; operação cobrada uma vez", () => {
    const r = calcular({
      ...base(),
      desconto: "0.1",
      bonus: "2",
      despesas: [
        { nome: "Frete", base: "operacao", valor: "5" },
        { nome: "Entrega", base: "unidade", valor: "1" },
        { nome: "Comissão", base: "faturamento", valor: "0.1" },
      ],
    });
    expect(Number(r.receita)).toBe(90);
    expect(Number(r.bruta)).toBe(57);
    expect(Number(r.contribuicao)).toBe(31);
    expect(Number(r.liquido)).toBe(31);
  });
  it("rateio ausente mantém líquido pendente e zero explícito é válido", () => {
    expect(calcular({ ...base(), fixas: null }).liquido).toBeNull();
    expect(Number(calcular({ ...base(), fixas: "0.2" }).liquido)).toBe(50);
    expect(Number(calcular(base()).liquido)).toBe(70);
  });
  it("sem receita percentuais indisponíveis; custo/preço ausente nunca vira zero", () => {
    expect(calcular({ ...base(), quantidade: "0" }).percentual).toBeNull();
    expect(calcular({ ...base(), custo: null }).contribuicao).toBeNull();
    expect(calcular({ ...base(), quantidade: null }).receita).toBeNull();
  });
  it("resolve preço mínimo com desconto, bonificações, despesas e meta", () => {
    const l = {
      ...base(),
      desconto: "0.1",
      bonus: "2",
      despesas: [{ nome: "Operação", base: "operacao" as const, valor: "3" }],
    };
    const r = calcular(l);
    expect(r.minimo).not.toBeNull();
    expect(Number(calcular({ ...l, preco: r.minimo! }).percentual)).toBeCloseTo(0.2, 9);
    expect(calcular({ ...base(), meta: "0.95" }).minimo).toBeNull();
    expect(calcular({ ...base(), desconto: "1" }).minimo).toBeNull();
  });
  it("Broker remunera comissão sem etapa de compra/revenda", () => {
    const r = calcular({
      ...base(),
      canal: "Broker",
      despesas: [{ nome: "Broker", base: "faturamento", valor: "0.1" }],
    });
    expect(r.etapas).toHaveLength(1);
    expect(r.etapas[0].nome).toBe("varejista");
    expect(Number(r.contribuicao)).toBe(60);
    for (const canal of ["E-commerce", "Marketplace"] as const)
      expect(calcular({ ...base(), canal }).etapas).toHaveLength(0);
    expect(
      calcular({ ...base(), canal: "Distribuidor", distribuidor: { modo: "markup", taxa: "0.5" } })
        .etapas,
    ).toHaveLength(2);
  });
  it("políticas aplicam exceção por UF e cliente apenas na combinação exata", () => {
    const p: Politica = {
      canal: "Venda Direta",
      uf: "SP",
      cliente: null,
      impostos: "0.2",
      fixas: null,
      meta: null,
      varejista: null,
      distribuidor: null,
    };
    const c = { ...p, cliente: "00000000-0000-4000-8000-000000000001", impostos: "0" };
    expect(aplicarPoliticas(base(), [p, c], c.cliente, "SP").impostos).toBe("0");
    expect(aplicarPoliticas(base(), [p, c], null, "SP").impostos).toBe("0.2");
    expect(aplicarPoliticas(base(), [p, c], c.cliente, "RJ").impostos).toBe("0.1");
  });
  it("agrega com ponderação por receita somente volumes previstos", () => {
    const a = base(),
      b = { ...base(), quantidade: "100", custo: "8" };
    const r = agregar([a, b, { ...base(), quantidade: null }]);
    expect(r.volumes).toBe(2);
    expect(Number(r.receita)).toBe(1100);
    expect(Number(r.contribuicao)).toBe(170);
    expect(Number(r.percentual)).toBeCloseTo(170 / 1100, 10);
  });
  it("rejeita duplicidades e preserva dados ausentes na importação", () => {
    const l = base();
    expect(revisar([l, l]).erros).toHaveLength(1);
    expect(
      documentoSchema.safeParse({
        nome: "Teste",
        cliente: null,
        uf: "",
        linhas: [l, l],
        politicas: [],
      }).success,
    ).toBe(false);
    expect(revisar([{ ...l, custo: null }]).avisos.length).toBeGreaterThan(0);
  });
});
