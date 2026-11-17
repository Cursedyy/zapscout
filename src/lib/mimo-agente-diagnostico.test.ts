import { expect, it } from "vitest";
import { codigoFalhaAgente, descricaoFalhaAgente, ErroIAAgente } from "./mimo-agente-diagnostico";

it.each([
  [402, "ia_creditos_esgotados"],
  [429, "ia_limite_uso"],
  [401, "ia_acesso_negado"],
  [403, "ia_acesso_negado"],
  [404, "ia_modelo_indisponivel"],
])("classifica HTTP %i sem persistir a resposta do provedor", (statusCode, codigo) => {
  const erro = Object.assign(Error("cliente privado; token secreto"), {
    statusCode,
    responseBody: "segredo",
  });
  expect(codigoFalhaAgente(erro)).toBe(codigo);
  expect(descricaoFalhaAgente(String(codigo))).not.toMatch(/privado|secreto|segredo/);
});
it.each(["SyntaxError", "ZodError", "AI_NoObjectGeneratedError", "AI_NoOutputGeneratedError"])(
  "identifica formato inválido: %s",
  (name) => {
    expect(codigoFalhaAgente({ name, message: "dados privados" })).toBe("ia_resposta_invalida");
  },
);
it("identifica timeout, identidade do remetente e falhas desconhecidas sem revelar detalhes", () => {
  expect(codigoFalhaAgente({ name: "TimeoutError" })).toBe("ia_tempo_esgotado");
  expect(codigoFalhaAgente(Error("agente_remetente_divergente"))).toBe("remetente_indisponivel");
  expect(codigoFalhaAgente(Error("UAZAPI /message/presence [503]: http"))).toBe(
    "whatsapp_indisponivel",
  );
  expect(codigoFalhaAgente({ message: "cliente privado" })).toBe("processamento_falhou");
  expect(codigoFalhaAgente(null)).toBe("processamento_falhou");
  expect(codigoFalhaAgente(new ErroIAAgente("ia_sem_credencial"))).toBe("ia_sem_credencial");
  expect(descricaoFalhaAgente("__proto__")).toContain("sem causa detalhada");
});
