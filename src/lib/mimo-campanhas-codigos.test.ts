import { expect, it } from "vitest";
import {
  analisarIdsMeta,
  codigoCampanhaSchema,
  investimentoManualSchema,
  podeGerirCodigos,
  podePreencherHistoricoCodigos,
  reaisParaCentavos,
} from "./mimo-campanhas-codigos";
import { faltaMigracaoCodigos } from "./mimo-campanhas-codigos-db";
import { leadMimoSchema } from "./mimo-leads";

const base = {
  id: null,
  versao: null,
  codigo: " bf-26 ",
  nome: "Black Friday",
  descricao: "",
  ativo: true,
  campanhasMeta: ["123"],
};

it("normaliza e valida o código, exigindo versão ao editar", () => {
  expect(codigoCampanhaSchema.parse(base).codigo).toBe("BF-26");
  expect(codigoCampanhaSchema.safeParse({ ...base, codigo: "-x" }).success).toBe(false);
  expect(codigoCampanhaSchema.safeParse({ ...base, codigo: "a b" }).success).toBe(false);
  expect(codigoCampanhaSchema.safeParse({ ...base, campanhasMeta: ["12a"] }).success).toBe(false);
  expect(
    codigoCampanhaSchema.safeParse({ ...base, id: "00000000-0000-4000-8000-000000000001" }).success,
  ).toBe(false);
  expect(
    codigoCampanhaSchema.safeParse({
      ...base,
      id: "00000000-0000-4000-8000-000000000001",
      versao: 2,
    }).success,
  ).toBe(true);
  expect(codigoCampanhaSchema.safeParse({ ...base, extra: 1 }).success).toBe(false);
});

it("separa IDs Meta válidos e inválidos sem duplicar", () => {
  expect(analisarIdsMeta("120000001, 120000001\n12x;5")).toEqual({
    ids: ["120000001", "5"],
    invalidos: ["12x"],
  });
});

it("converte reais em centavos inteiros sem ponto flutuante", () => {
  expect(reaisParaCentavos("1.234,56")).toBe(123456);
  expect(reaisParaCentavos("R$ 0,1")).toBe(10);
  expect(reaisParaCentavos("19.99")).toBe(1999);
  expect(reaisParaCentavos("1,234")).toBeNull();
  expect(reaisParaCentavos("-5")).toBeNull();
  expect(reaisParaCentavos("")).toBeNull();
});

it("valida investimento manual em centavos e data real", () => {
  const ok = {
    codigoId: "00000000-0000-4000-8000-000000000001",
    competencia: "2026-11-10",
    valorCentavos: 100,
    descricao: "Evento",
  };
  expect(investimentoManualSchema.safeParse(ok).success).toBe(true);
  expect(investimentoManualSchema.safeParse({ ...ok, competencia: "2026-02-30" }).success).toBe(
    false,
  );
  expect(investimentoManualSchema.safeParse({ ...ok, valorCentavos: 1.5 }).success).toBe(false);
  expect(investimentoManualSchema.safeParse({ ...ok, valorCentavos: -1 }).success).toBe(false);
});

it("gestão de códigos inclui marketing e líder de marketing; histórico só administração/gestão", () => {
  expect(["administrador", "gestor", "marketing", "lider_marketing"].every(podeGerirCodigos)).toBe(
    true,
  );
  expect(["vendedor", "administrativo"].some(podeGerirCodigos)).toBe(false);
  expect(["administrador", "gestor"].every(podePreencherHistoricoCodigos)).toBe(true);
  expect(["marketing", "lider_marketing", "vendedor"].some(podePreencherHistoricoCodigos)).toBe(
    false,
  );
});

it("reconhece só a ausência da migração de códigos, não outras falhas", () => {
  expect(faltaMigracaoCodigos({ code: "42P01", message: "relation does not exist" })).toBe(true);
  expect(faltaMigracaoCodigos({ code: "PGRST205", message: "" })).toBe(true);
  expect(
    faltaMigracaoCodigos({
      code: "42703",
      message: "column mimo_leads.campanha_codigo_id does not exist",
    }),
  ).toBe(true);
  expect(
    faltaMigracaoCodigos({ code: "42703", message: "column investimento does not exist" }),
  ).toBe(false);
  expect(faltaMigracaoCodigos({ code: "42501", message: "permission denied" })).toBe(false);
  expect(faltaMigracaoCodigos(null)).toBe(false);
});

it("lead aceita código opcional: omitido não altera, null remove, valor precisa ser UUID", () => {
  const lead = {
    nome_empresa: "Empório",
    nome_contato: "",
    telefone: "",
    perfil: "outro",
    origem: "outra",
    campanha_origem: "",
    anuncio_origem: "",
    entrada_em: "2026-11-01T12:00:00.000Z",
    etapa: "novo",
    qualificacao: "pendente",
    responsavel_id: null,
    valor_pedido: null,
    conversao_em: null,
    motivo_perda: "",
    observacoes: "",
  };
  expect("campanha_codigo_id" in leadMimoSchema.parse(lead)).toBe(false);
  expect(leadMimoSchema.parse({ ...lead, campanha_codigo_id: null }).campanha_codigo_id).toBeNull();
  expect(leadMimoSchema.safeParse({ ...lead, campanha_codigo_id: "BF26" }).success).toBe(false);
});
