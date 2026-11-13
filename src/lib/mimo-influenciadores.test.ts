import { describe, expect, it } from "vitest";
import {
  categoriaInfluenciador,
  ESTADOS_EUA,
  inscricaoInfluenciadorSchema,
  csvInfluenciadores,
  type Influenciador,
} from "./mimo-influenciadores";
import { podeAbrirPagina } from "./mimo-acesso";
export const inscricaoTeste = {
  nome: "Perfil de teste",
  whatsapp: "+55 (11) 99999-1234",
  rede: "Instagram",
  perfil: "https://www.instagram.com/Perfil_Teste/",
  cidade: "São Paulo",
  uf: "SP",
  seguidores: 15000,
  visualizacoes: "Mais de 1 mil até 5 mil",
  nicho: "Alimentação e receitas",
  parceria: "Ambas as opções",
  consentimento: true,
};
describe("seleção de influenciadores", () => {
  it("padroniza DDI, pontuação e o nono dígito antes de enviar", () => {
    for (const whatsapp of [
      "(11) 99999-1234",
      "+55 11 99999-1234",
      "0055 11 99999-1234",
      "1199991234",
    ])
      expect(inscricaoInfluenciadorSchema.parse({ ...inscricaoTeste, whatsapp }).whatsapp).toBe(
        "11999991234",
      );
  });
  it("normaliza contatos e links e exige aceite", () => {
    expect(inscricaoInfluenciadorSchema.parse(inscricaoTeste)).toMatchObject({
      whatsapp: "11999991234",
      perfil: "perfil_teste",
    });
    for (const mudanca of [
      { consentimento: false },
      { site: "spam" },
      { perfil: "javascript:alert(1)" },
      { seguidores: -1 },
      { uf: "XX" },
    ])
      expect(
        inscricaoInfluenciadorSchema.safeParse({ ...inscricaoTeste, ...mudanca }).success,
      ).toBe(false);
  });
  it.each([
    [999, "Abaixo de 1 mil"],
    [1000, "Nano"],
    [4999, "Nano"],
    [5000, "Micro"],
    [29999, "Micro"],
    [30000, "Média"],
    [100000, "Média"],
    [100001, "Acima de 100 mil"],
  ])("classifica %s sem sobrepor metas", (n, categoria) =>
    expect(categoriaInfluenciador(Number(n))).toBe(categoria),
  );
  it("limita a aba aos responsáveis pela seleção", () => {
    expect(podeAbrirPagina("marketing", "/mimo/influenciadores")).toBe(true);
    expect(podeAbrirPagina("vendedor", "/mimo/influenciadores")).toBe(false);
  });
  it("neutraliza fórmulas na exportação", () => {
    const i: Influenciador = {
      ...inscricaoInfluenciadorSchema.parse(inscricaoTeste),
      id: "teste",
      empresa_id: "teste",
      campanha: "lancamento-2026-11",
      notas: "",
      versao: 1,
      updated_at: "2026-11-11",
      nome: '=HYPERLINK("teste")',
      etapa: "Novo",
      created_at: "2026-11-11",
    };
    expect(csvInfluenciadores([i])).toContain('"\'=HYPERLINK(""teste"")"');
  });
});

it("aceita os 50 estados dos EUA e D.C. com identificação própria", () => {
  expect(ESTADOS_EUA).toHaveLength(51);
  for (const { uf } of ESTADOS_EUA) {
    expect(inscricaoInfluenciadorSchema.safeParse({ ...inscricaoTeste, uf }).success).toBe(true);
  }
  expect(inscricaoInfluenciadorSchema.safeParse({ ...inscricaoTeste, uf: "US-XX" }).success).toBe(
    false,
  );
});
