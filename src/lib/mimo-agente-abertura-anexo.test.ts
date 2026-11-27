import { expect, it } from "vitest";
import { configInicialAgente, memoriaClienteAgente, respostaDeterministicaAgente } from "./mimo-agente";

const config = { ...configInicialAgente, tamanho: 350 };
const a = (content: string) => ({ role: "assistant" as const, content });
const u = (content: string) => ({ role: "user" as const, content });
const COLETA = "Para encaminhar seu atendimento, preciso de seu nome, seu estado e seu ramo de atuação. Pode me informar?";

it.each([
  [[u("[anexo indisponivel]")]],
  [[u("Olá! Posso ter mais informações sobre isso?"), u("[anexo indisponivel]")]],
  [[u("[anexo indisponivel]"), u("Bom dia")]],
])("figurinha ou arquivo sem texto na abertura começa pelo nome (caso real)", (conversa) => {
  expect(respostaDeterministicaAgente(config, conversa, {})).toMatchObject({
    resposta: "Como você se chama?", estado: "agente", encaminhar: false, motivo: "",
  });
});

it("anexo com pedido de verdade na abertura continua indo para a equipe", () => {
  const r = respostaDeterministicaAgente(config, [u("[anexo indisponivel]"), u("Segue meu currículo para representação")], {});
  expect(r?.resposta).not.toBe("Como você se chama?");
});

it("guarda o nome respondido ao pedido de nome, estado e ramo e não pergunta de novo (caso real)", () => {
  const conversa = [u("[anexo indisponivel]"), a(COLETA), u("gigi")];
  expect(memoriaClienteAgente(conversa, {}).nome?.valor).toBe("gigi");
  const depois = [...conversa, a("O que melhor descreve você?"), u("Quero revender")];
  expect(memoriaClienteAgente(depois, {}).nome?.valor).toBe("gigi");
  const r = respostaDeterministicaAgente(config, depois, {});
  expect(r?.resposta).toBe("Em qual estado você pretende revender?");
  expect(r?.dados.nome?.valor ?? memoriaClienteAgente(depois, {}).nome?.valor).toBe("gigi");
});

it("no pedido de nome, estado e ramo, um ramo sozinho não vira nome", () => {
  expect(memoriaClienteAgente([a(COLETA), u("Padaria")], {}).nome).toBeUndefined();
  expect(memoriaClienteAgente([a(COLETA), u("SP")], {}).nome).toBeUndefined();
});

it("a resposta completa em três linhas continua sendo lida", () => {
  expect(memoriaClienteAgente([a(COLETA), u("Ana Souza\nSP\nEmpório")], {})).toMatchObject({
    nome: { valor: "Ana Souza" }, cidade_uf: { valor: "SP" }, estabelecimento: { valor: "Empório" },
  });
});
