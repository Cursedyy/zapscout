import { expect, it } from "vitest";
import {
  inscricaoRepresentanteSchema,
  csvRepresentantes,
  type Representante,
} from "./mimo-representantes";
const dados = {
  nome: "Representante sintético",
  email: "TESTE@EXAMPLE.INVALID",
  whatsapp: "+55 (11) 99999-1234",
  cidade: "São Paulo",
  uf: "SP",
  regiao_atuacao: "Grande São Paulo",
  experiencia: "mais3",
  segmentos: ["produtos_naturais", "farmacias"],
  carteira_clientes: 200,
  marcas_atuais: "Marca sintética",
  core: "ativo",
  disponibilidade: "imediata",
  motivacao: "Quero ampliar o acesso a alimentos saudáveis na minha região.",
  consentimento: true,
};
it("normaliza contatos e preserva as respostas da seleção", () => {
  expect(inscricaoRepresentanteSchema.parse(dados)).toMatchObject({
    email: "teste@example.invalid",
    whatsapp: "11999991234",
    segmentos: ["produtos_naturais", "farmacias"],
    carteira_clientes: 200,
  });
});
it("exige cada campo obrigatório e rejeita fraude de opções", () => {
  for (const key of Object.keys(dados).filter((k) => k !== "marcas_atuais")) {
    const v: Record<string, unknown> = { ...dados };
    delete v[key];
    expect(inscricaoRepresentanteSchema.safeParse(v).success, key).toBe(false);
  }
  for (const patch of [
    { segmentos: [] },
    { segmentos: ["invalido"] },
    { core: "sim" },
    { carteira_clientes: -1 },
    { consentimento: false },
    { site: "spam" },
    { uf: "XX" },
  ])
    expect(inscricaoRepresentanteSchema.safeParse({ ...dados, ...patch }).success).toBe(false);
});
it("permite começar sem carteira ou CORE e protege o CSV contra fórmulas", () => {
  expect(
    inscricaoRepresentanteSchema.safeParse({
      ...dados,
      experiencia: "sem",
      core: "nao",
      carteira_clientes: 0,
      marcas_atuais: "",
    }).success,
  ).toBe(true);
  const r = {
    ...inscricaoRepresentanteSchema.parse(dados),
    nome: "=123",
    etapa: "Novo",
    created_at: "2026-11-11",
  } as unknown as Representante;
  expect(csvRepresentantes([r])).toContain('"\'=123"');
});

it("exige motivação preenchida e limita o texto, preservando quebras de linha", () => {
  for (const motivacao of ["", "  ", "a".repeat(2001)])
    expect(inscricaoRepresentanteSchema.safeParse({ ...dados, motivacao }).success).toBe(false);
  expect(
    inscricaoRepresentanteSchema.parse({
      ...dados,
      motivacao: "  Interesse na marca\nAtuação regional  ",
    }).motivacao,
  ).toBe("Interesse na marca\nAtuação regional");
  expect(
    inscricaoRepresentanteSchema.safeParse({ ...dados, motivacao: "a".repeat(2000) }).success,
  ).toBe(true);
});
