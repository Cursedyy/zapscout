import { describe, expect, it } from "vitest";
import { resolverAcessoMimo } from "./mimo-acesso";

const mimo = { id: "1", nome: "MiMo", ativa: true };

describe("acesso MiMo", () => {
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