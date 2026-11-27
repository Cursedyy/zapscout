import { expect, it } from "vitest";
import { formularioAgente, FORMULARIO_REPRESENTANTE_AGENTE } from "./mimo-agente-formularios";
import {
  configInicialAgente as c,
  respostaDeterministicaAgente,
  finalizarResultadoAgente,
  promptAgente,
  representacaoAgente,
} from "./mimo-agente";
const msg = (content: string) => [{ role: "user" as const, content }];
it("envia o formulário quando o lead esclarece que quer representar durante a coleta", () => {
  const mensagens = [
    ...msg("Bom dia, estou aguardando falar com responsável pelo representantes"),
    { role: "assistant" as const, content: "Para encaminhar seu atendimento, preciso de seu nome, seu estado e seu ramo de atuação. Pode me informar?" },
    ...msg("Sou Alex responsável pela empresa e vendas."),
    ...msg("Gostaria de representar vcs em minha cidade Rio de Janeiro capital e interior"),
  ];
  expect(respostaDeterministicaAgente(c, mensagens, {})).toMatchObject({
    estado: "pausada",
    motivo: "representacao",
    resposta: "Para ser representante, preencha nosso formulário: https://zapscout.com.br/representantes",
  });
});
it.each([
  ["Quero ser representante", "representantes"],
  ["Gostaria de representar vcs em minha cidade Rio de Janeiro capital e interior", "representantes"],
  ["Sou representante e gostaria de trabalhar com vocês", "representantes"],
  ["Influencer", "influenciadores"],
  ["Sou influenciadora e quero uma parceria", "influenciadores"],
])("envia apenas o formulário aprovado para %s", (texto, path) => {
  const r = respostaDeterministicaAgente(c, msg(texto), {});
  expect(r?.resposta).toContain(`https://zapscout.com.br/${path}`);
  expect(r?.resposta.length).toBeLessThan(180);
  expect(r?.estado).toBe("pausada");
});
it.each([
  "Não quero ser representante, quero revender",
  "Quero falar com meu representante",
  "Não quero representar vocês, quero revender",
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
  expect(r?.estado).toBe("pausada");
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
  expect(p).toContain("Faça uma pergunta por vez.");
  expect(p).toContain("até 180 caracteres");
  expect(p).toContain('Não use "Que ótimo seu interesse"');
});
it("abertura coleta o nome antes de perguntar o assunto", () => {
  const r = respostaDeterministicaAgente(c, msg("Bom dia tudo bem?"), {});
  expect(r?.resposta).toBe("Como você se chama?");
  expect(r?.resposta.length).toBeLessThan(180);
});
it("não pergunta o interesse novamente se o lead já disse que quer revender", () => {
  const r = respostaDeterministicaAgente(
    c,
    msg("Olá! Gostaria de saber mais sobre como ser um revendedor MiMo."),
    {},
  );
  expect(r?.resposta).toBe("Como você se chama?");
});
it("não repete abertura quando já houve resposta ou existem dados antecipados", () => {
  expect(
    respostaDeterministicaAgente(c, [{ role: "assistant", content: "Bom dia" }, ...msg("Olá")], {}),
  ).toBeNull();
  expect(
    respostaDeterministicaAgente(c, msg("Sou Ana, tenho um empório em SC e quero revender"), {}),
  ).toBeNull();
});
it.each(["Representá-los", "Quero representá-los no MA", "Gostaria de representá-las", "representa-los"])(
  "reconhece o interesse em representar a MiMo: %s",
  (texto) => {
    expect(formularioAgente(texto)).toBe(FORMULARIO_REPRESENTANTE_AGENTE);
  },
);
it("mantém a negação sem enviar formulário de representante", () => {
  expect(formularioAgente("Não quero representá-los no MA")).toBeNull();
});
it("envia o formulário quando o lead responde ao menu com 'Representá-los'", () => {
  const conversa = [
    { role: "user" as const, content: "Vou enviar nosso contato e currículo" },
    { role: "assistant" as const, content: "O que melhor descreve você?" },
    { role: "user" as const, content: "Representá-los" },
  ];
  expect(representacaoAgente(conversa, {})).toMatchObject({
    resposta: FORMULARIO_REPRESENTANTE_AGENTE, motivo: "representacao", estado: "pausada",
  });
});
