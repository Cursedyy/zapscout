import { expect, it } from "vitest";
import { avaliarAfinidadeMimo } from "./prospeccao-mimo";

it.each(["Loja de produtos naturais", "Empório", "Supermercado", "Health food store"])("reconhece a categoria %s, mesmo com nome genérico", (categoriaMaps) => {
  const r = avaliarAfinidadeMimo({ nome: "Empresa Exemplo", categoriaMaps });
  expect(r.nivel).toBe("Perfil indicado");
  expect(r.motivo).toContain("Categoria no Maps");
});
it("reconhece acentos no nome quando a categoria não está disponível", () => {
  expect(avaliarAfinidadeMimo({ nome: "EMPÓRIO EXEMPLO" }).prioridade).toBe(1);
});
it.each(["Clínica de Nutrição", "Autopeças Exemplo", "Naturalidade Tecnologia", "Nutricionista Exemplo"])("não confirma revenda para %s", (nome) => {
  expect(avaliarAfinidadeMimo({ nome }).prioridade).toBe(0);
});
it("não trata o termo de busca como evidência de compatibilidade", () => {
  const lead = { nome: "Empresa Exemplo", nicho: "Loja de produtos naturais" };
  expect(avaliarAfinidadeMimo(lead).nivel).toBe("Avaliar perfil");
});
