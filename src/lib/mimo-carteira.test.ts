import { describe, it, expect } from "vitest";
import { unidadeSchema, atividadeSchema } from "./mimo-carteira";
describe("carteira MiMo", () => {
  it("mant?m unidades não classificadas e não abordadas por padrão", () => {
    const u = unidadeSchema.parse({ nome: "Unidade Centro" });
    expect(u.classe).toBe("");
    expect(u.situacao).toBe("Não abordado");
    expect(u.responsavel_id).toBeNull();
  });
  it("não aceita situa??o comercial ou classe fora do cat?logo", () => {
    expect(unidadeSchema.safeParse({ nome: "Unidade", classe: "D" }).success).toBe(false);
    expect(unidadeSchema.safeParse({ nome: "Unidade", situacao: "Pago" }).success).toBe(false);
  });
  it("exige unidade identificada e prazo v?lido para atividade", () => {
    expect(
      atividadeSchema.safeParse({
        unidade_id: "qualquer",
        tipo: "WhatsApp",
        prazo: "amanhã",
        descricao: "Retornar",
      }).success,
    ).toBe(false);
  });
});
