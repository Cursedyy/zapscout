import { describe, expect, it } from "vitest";
import { podeAbrirPagina, resolverAcessoMimo } from "./mimo-acesso";

const mimo = { id: "1", nome: "MiMo", ativa: true };

describe("acesso MiMo", () => {
  it("vendedor acessa representantes e não acessa o agente de atendimento", () => {
    expect(podeAbrirPagina("vendedor", "/mimo/representantes")).toBe(true);
    expect(podeAbrirPagina("vendedor", "/mimo/agente")).toBe(false);
    expect(podeAbrirPagina("vendedor", "/mimo/influenciadores")).toBe(false);
    for (const papel of ["administrador", "gestor"] as const) {
      expect(podeAbrirPagina(papel, "/mimo/representantes")).toBe(true);
      expect(podeAbrirPagina(papel, "/mimo/agente")).toBe(true);
    }
  });
  it.each(["administrador", "gestor", "vendedor"])("libera papel %s ativo", (papel) => {
    expect(resolverAcessoMimo(mimo, { papel, ativo: true }, "Ana")).toEqual({
      autorizado: true,
      empresa: "MiMo",
      nome: "Ana",
      papel,
    });
  });

  it("nega usuário sem vínculo", () => {
    expect(resolverAcessoMimo(mimo, null, "Ana")).toEqual({ autorizado: false });
  });

  it("nega vínculo inativo", () => {
    expect(resolverAcessoMimo(mimo, { papel: "gestor", ativo: false }, "Ana")).toEqual({ autorizado: false });
  });

  it("nega empresa inativa", () => {
    expect(resolverAcessoMimo({ ...mimo, ativa: false }, { papel: "gestor", ativo: true }, "Ana")).toEqual({
      autorizado: false,
    });
  });
});
