import { describe, expect, it, vi } from "vitest";

// The model is mocked with a generic, field-less reply: capture must come from the server rules.
const modelo = vi.hoisted(() => ({ resposta: '{"resposta":"Entendi! Pode me contar mais?","dados":{},"encaminhar":false}' }));
vi.mock("./gemini.server", () => ({ chamarGemini: async () => modelo.resposta }));

import { gerarRespostaAgente } from "./mimo-agente-modelo.server";
import {
  cidadeSemEstadoAgente,
  configInicialAgente,
  exigirDadosEncaminhamentoAgente,
  memoriaClienteAgente,
  respostaContingenciaAgente,
  revisaoRespostaAgente,
  type DadosAgente,
  type MensagemAgente,
  type ResultadoAgente,
} from "./mimo-agente";

const config = configInicialAgente;
const a = (content: string) => ({ role: "assistant" as const, content });
const u = (content: string) => ({ role: "user" as const, content });

/** Same post-processing as the worker: review, contingency, then the review handoff. */
async function turno(mensagens: MensagemAgente[], dados: DadosAgente): Promise<ResultadoAgente> {
  let r = await gerarRespostaAgente(config, mensagens, dados);
  if (revisaoRespostaAgente(mensagens, r)) {
    r = respostaContingenciaAgente(config, mensagens, r.dados);
    if (revisaoRespostaAgente(mensagens, r))
      return { ...r, estado: "humano", encaminhar: true, motivo: "resposta_requer_revisao" };
  }
  return exigirDadosEncaminhamentoAgente(r, mensagens);
}

async function conversar(falas: string[]) {
  const mensagens: MensagemAgente[] = [];
  let dados: DadosAgente = {};
  let ultimo: ResultadoAgente | undefined;
  for (const fala of falas) {
    mensagens.push(u(fala));
    ultimo = await turno(mensagens, dados);
    dados = ultimo.dados;
    mensagens.push(a(ultimo.resposta));
    if (ultimo.estado !== "agente") break;
  }
  return { ultimo: ultimo!, mensagens };
}

describe("lead de revenda completo chega à pré-qualificação", () => {
  it.each([
    [["Oi", "Ana", "Quero revender", "SP Indaiatuba", "Mercado"], "SP Indaiatuba", "Mercado"],
    [["Oi", "Bruna", "Quero revender", "Anápolis goias", "Perfumes maquiagem"], "Anápolis goias", "Perfumes maquiagem"],
    [["Oi", "Carla", "Quero revender", "Jequiá da praia", "AL", "Mercado"], "Jequiá da praia - AL", "Mercado"],
    [["Oi", "Dora", "Quero revender", "Cachoeiras de Macacu", "Cachoeiras de Macacu", "vendo roupas bolachas"],
      "Cachoeiras de Macacu (estado não informado)", "vendo roupas bolachas"],
    [["Olá, quero revender", "Eva", "Goiás", "Distribuição"], "Goiás", "Distribuição"],
  ])("%j", async (falas, local, ramo) => {
    const { ultimo } = await conversar(falas);
    expect(ultimo).toMatchObject({
      estado: "humano",
      motivo: "pre_qualificacao_pendente_revisao",
      dados: { cidade_uf: { valor: local }, estabelecimento: { valor: ramo } },
    });
    expect(ultimo.dados.nome).toBeDefined();
    expect(ultimo.dados.revenda).toBeDefined();
  });
});

it("a escolha do lead no menu de perfil segue no fluxo do agente", async () => {
  const mensagens = [u("Oi"), a("Como você se chama?"), u("Ana"), a("O que melhor descreve você?"), u("Quero revender")];
  expect(await turno(mensagens, { nome: { valor: "Ana", evidencia: "Ana" } })).toMatchObject({
    estado: "agente",
    motivo: "",
    resposta: "Em qual estado você pretende revender?",
  });
});

describe("cidade sem estado", () => {
  it("pede o estado uma vez citando a cidade, sem gravar a cidade como estado", async () => {
    const { ultimo, mensagens } = await conversar(["Oi", "Ana", "Quero revender", "Jequiá da praia"]);
    expect(ultimo.resposta).toBe("Não identifiquei o estado de Jequiá da praia. Pode me dizer a sigla do estado?");
    expect(ultimo.estado).toBe("agente");
    expect(memoriaClienteAgente(mensagens, {}).cidade_uf).toBeUndefined();
  });

  it("não trata texto ilegível, ramo ou frase como cidade", () => {
    for (const texto of ["Saox VT ctz qu", "xx", "Mercado", "Quero revender", "Todo o Brasil", "Sim", "Revendedora"])
      expect(cidadeSemEstadoAgente(texto)).toBe(false);
    for (const texto of ["Jequiá da praia", "Cachoeiras de Macacu", "Uberaba"])
      expect(cidadeSemEstadoAgente(texto)).toBe(true);
  });

  it("depois do esclarecimento, uma resposta ilegível continua sem local", () => {
    const conversa = [a("Em qual estado você pretende revender?"), u("Jequiá da praia"),
      a("Não identifiquei o estado de Jequiá da praia. Pode me dizer a sigla do estado?"), u("xx")];
    expect(memoriaClienteAgente(conversa, {}).cidade_uf).toBeUndefined();
  });
});

describe("ramo em texto livre", () => {
  it.each(["Perfumes maquiagem", "vendo roupas bolachas", "Mercado", "Empório", "Distribuição"])(
    "%s vira o ramo", (resposta) => {
      expect(memoriaClienteAgente([a("Qual é o seu ramo de atuação?"), u(resposta)], {}).estabelecimento?.valor).toBe(resposta);
    },
  );
  it.each(["Como assim?", "Não sei ainda", "Quero o catálogo", "Bom dia", "SP", "pela internet"])(
    "%s não vira ramo", (resposta) => {
      expect(memoriaClienteAgente([a("Qual é o seu ramo de atuação?"), u(resposta)], {}).estabelecimento).toBeUndefined();
    },
  );
});
