import { beforeEach, expect, it, vi } from "vitest";
import {
  assuntoAtendimentoAgente, configInicialAgente, memoriaClienteAgente, pendenciaComercialAgente,
  respostaContingenciaAgente, type MensagemAgente,
} from "./mimo-agente";
import { gerarRespostaAgente } from "./mimo-agente-modelo.server";

const gateway = vi.hoisted(() => vi.fn());
vi.mock("./gemini.server", () => ({ chamarGemini: gateway }));
beforeEach(() => gateway.mockReset());
const config = { ...configInicialAgente, conhecimentoRevisado: true, conhecimento: "A MiMo aceita revenda sem loja física." };
const cliente = (content: string): MensagemAgente => ({ role: "user", content });
const agente = (content: string): MensagemAgente => ({ role: "assistant", content });
const pedido = "Quais os quesitos necessários pra ser revenderem da marca?";
const canal = "Queria ser revendedora porém n tenho loja física";
const produtos = "As barrinhas, geleia, misturinha mágica";
const historico = [
  cliente(pedido), agente("Você quer revender ou comprar para consumo próprio?"), cliente(canal),
  agente("Como você se chama?"), cliente("Helena"),
  agente("Você busca informações sobre algum produto específico da marca?"), cliente(produtos),
];

it.each([pedido, canal, "Como faço pra revender?", "O que preciso para ser uma revendedora?"])(
  "responde à dúvida sobre a adesão antes de pedir o primeiro dado (%s)", async texto => {
    const r = await gerarRespostaAgente(config, [cliente(texto)], {});
    expect(r).toMatchObject({ estado: "agente", dados: { revenda: { evidencia: texto } } });
    expect(r.resposta).toMatch(/sem loja física\.\s+Como você se chama\?/);
    expect(gateway).not.toHaveBeenCalled();
  },
);

it("retoma requisitos e produtos após respostas genéricas e aproveita nome, estado e ramo até o encaminhamento", async () => {
  const r = await gerarRespostaAgente(config, historico, {});
  expect(r).toMatchObject({ estado: "agente", dados: { nome: { valor: "Helena" } } });
  expect(r.resposta).toMatch(/barrinhas, geleia e misturinha mágica/);
  expect(r.resposta).toMatch(/sem loja física\.\s+Em qual estado você pretende revender\?/);
  expect(respostaContingenciaAgente(config, historico, {}).resposta).toBe(r.resposta);
  const comEstado = [...historico, agente(r.resposta), cliente("Paraná")];
  const estado = await gerarRespostaAgente(config, comEstado, r.dados);
  expect(estado.resposta).toBe("Qual é o seu ramo de atuação?");
  const final = await gerarRespostaAgente(config, [...comEstado, agente(estado.resposta), cliente("Confeitaria")], estado.dados);
  expect(final).toMatchObject({ estado: "humano", motivo: "pre_qualificacao_pendente_revisao" });
  expect(final.resumo).toContain("barrinhas, geleia, misturinha mágica");
  expect(gateway).not.toHaveBeenCalled();
});

it("aproveita cidade com UF minúscula e profissão em resposta aos dois campos de encaminhamento", async () => {
  const r = await gerarRespostaAgente(config, [
    ...historico, agente("Para encaminhar seu atendimento, preciso de seu estado e seu ramo de atuação. Pode me informar?"),
    cliente("Curitiba pr\nSou fotógrafa e estudo nutrição, também gravo vídeos"),
  ], {});
  expect(r).toMatchObject({ estado: "humano", encaminhar: true, dados: {
    nome: { valor: "Helena" }, cidade_uf: { valor: "pr" }, estabelecimento: { valor: "fotógrafa" },
  } });
  expect(r.resposta).toMatch(/sem loja física/);
  expect(gateway).not.toHaveBeenCalled();
});

it("suspende lembretes enquanto uma triagem antiga encobriu a pergunta", async () => {
  expect(pendenciaComercialAgente(config, [...historico, agente("Como posso ajudar?")])).toBe(true);
  const r = await gerarRespostaAgente(config, historico, {});
  expect(pendenciaComercialAgente(config, [...historico, agente(r.resposta)])).toBe(false);
});

it("não afirma uma condição sem autorização revisada e compatível", async () => {
  for (const alteracao of [{ conhecimentoRevisado: false }, { conhecimento: "" },
    { conhecimento: "A MiMo aceita revenda sem loja física. Loja física obrigatória para novas adesões." }]) {
    const r = await gerarRespostaAgente({ ...config, ...alteracao }, [cliente(pedido)], {});
    expect(r.resposta).toContain("confirmar os requisitos");
    expect(r.resposta).not.toContain("sem loja física");
  }
});

it("uma finalidade pessoal exige evidência de compra ou consumo", () => {
  expect(assuntoAtendimentoAgente("O anúncio apareceu pra mim quando eu estudava")).toBe("indefinido");
  expect(assuntoAtendimentoAgente("Quero comprar pra mim")).toBe("consumo");
  expect(memoriaClienteAgente([cliente("Não queria ser revendedora")], {})).toEqual({});
  expect(memoriaClienteAgente([cliente(canal), cliente("Não quero revender")], {}).revenda).toBeUndefined();
});

it("prioriza mudança de assunto, pedido humano e encerramento sobre o histórico de produtos", async () => {
  for (const [texto, motivo] of [["Tenho alergia ao leite", "duvida_produto"], ["Quero falar com uma pessoa", "atendimento_humano"],
    ["Pare de mandar mensagens", "parar"], ["Não tenho mais interesse em revender", "falta_interesse"]]) {
    const r = respostaContingenciaAgente(config, [...historico, agente("Tudo bem."), cliente(texto)], {});
    expect(r.motivo).toBe(motivo);
    expect(r.resposta).not.toMatch(/sem loja física|geleia/);
  }
});
