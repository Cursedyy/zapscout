import { describe, expect, it } from "vitest";
import {
  assuntoAtendimentoAgente,
  configInicialAgente,
  memoriaClienteAgente,
  respostaContingenciaAgente,
  respostaDeterministicaAgente,
} from "./mimo-agente";
import { estadoDeclaradoNaRespostaAgente } from "./mimo-agente-politica";

const config = { ...configInicialAgente, tamanho: 350 };
const a = (content: string) => ({ role: "assistant" as const, content });
const u = (content: string) => ({ role: "user" as const, content });
const inicioRevenda = (nome: string) => [
  u("Olá! Posso ter mais informações sobre isso?"),
  a("Como você se chama?"),
  u(nome),
  a("O que melhor descreve você?"),
  u("Quero revender"),
  a("Em qual estado você pretende revender?"),
];

describe("estado informado junto com a cidade", () => {
  it.each([
    ["SP Indaiatuba", "SP Indaiatuba"],
    ["Indaiatuba SP", "Indaiatuba SP"],
    ["Indaiatuba/SP", "Indaiatuba/SP"],
    ["Indaiatuba - SP", "Indaiatuba - SP"],
    ["Campo Grande MS", "Campo Grande MS"],
    ["Mato Grosso do Sul Campo Grande", "Mato Grosso do Sul Campo Grande"],
    ["Niterói Rio de Janeiro", "Niterói Rio de Janeiro"],
    ["moro em Recife PE", "Recife PE"],
  ])("reconhece %s", (texto, valor) => {
    expect(estadoDeclaradoNaRespostaAgente(texto)).toEqual({ valor, evidencia: texto });
  });

  it.each(["Saox VT ctz qu", "quero revender em SP", "SP ou RJ", "Santa Catarina Paraná", "não sei ainda SP"])(
    "não inventa estado em %s",
    (texto) => expect(estadoDeclaradoNaRespostaAgente(texto)).toBeNull(),
  );

  it("mantém o estado sozinho como antes", () => {
    expect(estadoDeclaradoNaRespostaAgente("Pernambuco")).toEqual({ valor: "Pernambuco", evidencia: "Pernambuco" });
    expect(estadoDeclaradoNaRespostaAgente("SP")).toEqual({ valor: "SP", evidencia: "SP" });
  });

  it("conclui a pré-qualificação de quem respondeu 'SP Indaiatuba' (caso real)", () => {
    const conversa = [...inicioRevenda("Tamires"), u("SP Indaiatuba")];
    expect(memoriaClienteAgente(conversa, {}).cidade_uf?.valor).toBe("SP Indaiatuba");
    const completa = [...conversa, a("Qual é o seu ramo de atuação?"), u("Mercado")];
    expect(respostaDeterministicaAgente(config, completa, {})).toMatchObject({
      estado: "humano",
      motivo: "pre_qualificacao_pendente_revisao",
      dados: { nome: { valor: "Tamires" }, cidade_uf: { valor: "SP Indaiatuba" }, estabelecimento: { valor: "Mercado" } },
    });
  });
});

describe("estado ilegível", () => {
  it("pergunta o estado de novo em vez de pular para o ramo (caso real)", () => {
    const conversa = [...inicioRevenda("Maria Clara"), u("Saox VT ctz qu")];
    const r = respostaContingenciaAgente(config, conversa, {});
    expect(r).toMatchObject({ estado: "agente", motivo: "" });
    expect(r.resposta).toBe("Não consegui identificar o estado. Me diga onde vai vender. Pode ser só a sigla do estado.");
    // The answer to the clarification is read as the state.
    const depois = [...conversa, a(r.resposta), u("BA")];
    expect(memoriaClienteAgente(depois, {}).cidade_uf?.valor).toBe("BA");
    expect(respostaContingenciaAgente(config, depois, {}).resposta).toBe("Qual é o seu ramo de atuação?");
  });

  it("só esclarece uma vez; depois segue para o ramo", () => {
    const conversa = [...inicioRevenda("Maria Clara"), u("Saox VT ctz qu"),
      a("Não consegui identificar o estado. Me diga onde vai vender. Pode ser só a sigla do estado."), u("xx")];
    expect(respostaContingenciaAgente(config, conversa, {}).resposta).toBe("Qual é o seu ramo de atuação?");
  });
});

describe("revenda junto com consumo próprio", () => {
  const monalisa = "Oi me chamo Monalisa e sou mãe de gêmeos um casal uma menina e um menino eu gostaria de revender seus produtos além de utilizá-los né também comprar para mim também";

  it("trata como revenda quem quer revender e também consumir (caso real)", () => {
    expect(assuntoAtendimentoAgente(monalisa)).toBe("revenda");
    const conversa = [u("Olá! Posso ter mais informações sobre isso?"), a("Como você se chama?"), u(monalisa)];
    const r = respostaDeterministicaAgente(config, conversa, {});
    expect(r).toMatchObject({ estado: "agente", resposta: "Em qual estado você pretende revender?" });
    expect(r?.dados.nome?.valor).toBe("Monalisa");
  });

  it("continua consumo próprio quando não há revenda ou quando a revenda é negada", () => {
    expect(assuntoAtendimentoAgente("Quero comprar para mim")).toBe("consumo");
    expect(assuntoAtendimentoAgente("Não quero revender, é para consumo próprio")).toBe("consumo");
  });

  it("captura o nome seguido de 'e sou' sem levar o resto da frase", () => {
    expect(memoriaClienteAgente([a("Como você se chama?"), u("Oi, me chamo João Pedro e sou de Curitiba")], {}).nome?.valor)
      .toBe("João Pedro");
  });
});
