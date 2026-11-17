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
  segmentos: ["emporios", "farma"],
  principais_clientes: "Empório Exemplo — Empórios; Farmácia Exemplo — Farma",
  marcas_atuais: "Marca sintética",
  core: "ativo",
  motivacao: "Quero ampliar o acesso a alimentos saudáveis na minha região.",
  consentimento: true,
};
it("normaliza contatos e preserva as respostas da seleção", () => {
  expect(inscricaoRepresentanteSchema.parse(dados)).toMatchObject({
    email: "teste@example.invalid",
    whatsapp: "11999991234",
    segmentos: ["emporios", "farma"],
    principais_clientes: "Empório Exemplo — Empórios; Farmácia Exemplo — Farma",
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
    { principais_clientes: " " },
    { principais_clientes: "a".repeat(2001) },
    { consentimento: false },
    { site: "spam" },
    { uf: "XX" },
  ])
    expect(inscricaoRepresentanteSchema.safeParse({ ...dados, ...patch }).success).toBe(false);
});
it("permite informar ausência de clientes ou CORE e protege o CSV contra fórmulas", () => {
  expect(
    inscricaoRepresentanteSchema.safeParse({
      ...dados,
      experiencia: "sem",
      core: "nao",
      principais_clientes: "Ainda não mantenho negócios nesses canais.",
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

it("exporta clientes e canais novos e mantém a leitura dos segmentos anteriores",()=>{
 const novo={...inscricaoRepresentanteSchema.parse(dados),carteira_clientes:null,disponibilidade:null,etapa:"Novo",created_at:"2026-11-17"} as Representante;
 const csv=csvRepresentantes([novo,{...novo,segmentos:["produtos_naturais"],principais_clientes:null,carteira_clientes:200,disponibilidade:"imediata"}]);
 expect(csv).toContain("Empórios, Farma");
 expect(csv).toContain("Empório Exemplo");
 expect(csv).toContain("Produtos naturais");
 expect(csv).not.toContain("undefined");
});
