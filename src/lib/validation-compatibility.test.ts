import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { inscricaoInfluenciadorSchema } from "./mimo-influenciadores";
import { inscricaoRepresentanteSchema } from "./mimo-representantes";
import { cotacaoSchema, novoPedido, pedidoSchema } from "./mimo-pedido";
import { rascunhoSchema } from "./mimo-rascunho";

describe("compatibilidade das validações após atualização de segurança", () => {
  it("recusa coleção acima do limite antes de validar cada elemento", () => {
    const validarItem = vi.fn(() => false);
    const schema = z.array(z.string().refine(validarItem)).max(2);
    const resultado = schema.safeParse(["a", "b", "c"]);
    expect(resultado.success).toBe(false);
    expect(validarItem).not.toHaveBeenCalled();
    if (!resultado.success) expect(resultado.error.issues).toHaveLength(1);
  });

  it.each([
    [
      inscricaoInfluenciadorSchema.shape.consentimento,
      "É necessário aceitar o contato para participar.",
    ],
    [
      inscricaoRepresentanteSchema.shape.consentimento,
      "Aceite o contato sobre esta seleção para participar.",
    ],
  ])("preserva mensagem e exigência de consentimento", (schema, mensagem) => {
    expect(schema.safeParse(true).success).toBe(true);
    const resultado = schema.safeParse(false);
    expect(resultado.success).toBe(false);
    if (!resultado.success) expect(resultado.error.issues[0].message).toBe(mensagem);
  });

  it("preserva o mapa de frete por volume com centavos inteiros", () => {
    const schema = cotacaoSchema.shape.valoresVolumes;
    expect(schema.parse({ "volume-1": 1234, "volume-2": 0 })).toEqual({
      "volume-1": 1234,
      "volume-2": 0,
    });
    expect(schema.safeParse({ "volume-1": "1234" }).success).toBe(false);
    expect(schema.safeParse({ "volume-1": 1.5 }).success).toBe(false);
    expect(schema.safeParse({ "volume-1": -1 }).success).toBe(false);
  });

  it("mantém CEP incompleto apenas no rascunho, sem afrouxar o pedido", () => {
    const documento = { ...novoPedido(), origemCep: "01", destinoCep: "02" };
    expect(rascunhoSchema.shape.documento.safeParse(documento).success).toBe(true);
    expect(pedidoSchema.safeParse(documento).success).toBe(false);
    expect(
      rascunhoSchema.shape.documento.safeParse({ ...documento, origemCep: "abc" }).success,
    ).toBe(false);
  });
});
