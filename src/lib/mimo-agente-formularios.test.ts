import { expect, it } from "vitest";
import {
  configInicialAgente as c,
  respostaDeterministicaAgente,
  finalizarResultadoAgente,
  promptAgente,
} from "./mimo-agente";
const msg = (content: string) => [{ role: "user" as const, content }];
it.each([
  ["Quero ser representante", "representantes"],
  ["Sou representante e gostaria de trabalhar com vocês", "representantes"],
  ["Influencer", "influenciadores"],
  ["Sou influenciadora e quero uma parceria", "influenciadores"],
])("envia apenas o formulário aprovado para %s", (texto, path) => {
  const r = respostaDeterministicaAgente(c, msg(texto), {});
  expect(r?.resposta).toContain(`https://zapscout.com.br/${path}`);
  expect(r?.resposta.length).toBeLessThan(180);
  expect(r?.estado).toBe(path === "influenciadores" ? "pausada" : "agente");
});
it.each([
  "Não quero ser representante, quero revender",
  "Quero falar com meu representante",
  "Quero ser representante ou influencer, qual a diferença?",
  "Quero revender nossa marca",
])("não classifica por palavra isolada: %s", (texto) => {
  expect(respostaDeterministicaAgente(c, msg(texto), {})?.resposta ?? "").not.toContain("https://");
});
it("parada e atendimento humano prevalecem sobre o formulário", () => {
  expect(
    respostaDeterministicaAgente(c, msg("Sou influencer, não quero mais mensagens"), {})?.estado,
  ).toBe("bloqueada");
  expect(
    respostaDeterministicaAgente(c, msg("Quero ser representante e falar com uma pessoa"), {})
      ?.estado,
  ).toBe("agente");
});
it("formulário não desaparece quando os dados de revenda já foram coletados", () => {
  const dados = { nome: { valor: "Ana", evidencia: "Ana" } };
  const r = respostaDeterministicaAgente(
    { ...c, campos: ["nome"] },
    msg("Quero ser representante"),
    dados,
  );
  expect(r?.resposta).toContain("/representantes");
  expect(r?.estado).toBe("agente");
});
it("não permite que o modelo acrescente ou substitua URLs", () => {
  expect(() =>
    finalizarResultadoAgente(
      c,
      msg("Quero ser representante"),
      {},
      { resposta: "https://evil.invalid", dados: {}, encaminhar: false, motivo: "" },
    ),
  ).toThrow("nao_aprovada");
  expect(() =>
    finalizarResultadoAgente(
      c,
      msg("Quero revender"),
      {},
      {
        resposta: "https://zapscout.com.br/representantes",
        dados: {},
        encaminhar: false,
        motivo: "",
      },
    ),
  ).toThrow("nao_aprovada");
});
it("prompt usa o atendimento curto aprovado pelo responsável", () => {
  const p = promptAgente(c, {});
  expect(p).toContain("Me informe seu nome, estado e ramo de atuação");
  expect(p).toContain("até 180 caracteres");
  expect(p).toContain('Não use "Que ótimo seu interesse"');
});
it("abertura segue a mensagem curta aprovada e não apresenta a marca em um bloco", () => {
  const r = respostaDeterministicaAgente(c, msg("Bom dia tudo bem?"), {});
  expect(r?.resposta).toContain("Gostaria de revender nossa marca ou ser representante?");
  expect(r?.resposta).toContain("Me informe seu nome, estado e ramo de atuação, por favor!");
  expect(r?.resposta.length).toBeLessThan(180);
});
it("não pergunta o interesse novamente se o lead já disse que quer revender", () => {
  const r = respostaDeterministicaAgente(
    c,
    msg("Olá! Gostaria de saber mais sobre como ser um revendedor MiMo."),
    {},
  );
  expect(r?.resposta).toContain("Me informe seu nome");
  expect(r?.resposta).not.toContain("ou ser representante");
});
it("não repete abertura quando já houve resposta ou existem dados antecipados", () => {
  expect(
    respostaDeterministicaAgente(c, [{ role: "assistant", content: "Bom dia" }, ...msg("Olá")], {}),
  ).toBeNull();
  expect(
    respostaDeterministicaAgente(c, msg("Sou Ana, tenho um empório em SC e quero revender"), {}),
  ).toBeNull();
});
