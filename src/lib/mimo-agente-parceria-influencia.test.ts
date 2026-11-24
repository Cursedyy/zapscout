import { beforeEach, expect, it, vi } from "vitest";
import { PERGUNTA_MARKETING_AGENTE, configInicialAgente, esclarecimentoMarketingPendenteAgente, parceriaInfluenciaAgente, respostaDeterministicaAgente } from "./mimo-agente";
import { FORMULARIO_INFLUENCER_AGENTE } from "./mimo-agente-formularios";
const f = vi.hoisted(() => ({
  fila: vi.fn(), ficha: vi.fn(), modelo: vi.fn(), perfil: vi.fn(), processar: vi.fn(),
  remetente: vi.fn(), enviarTexto: vi.fn(), enviarMedia: vi.fn(),
}));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { storage: { from: () => ({}) } } }));
vi.mock("./mimo-agente-db.server", () => ({ workerAgente: f.fila }));
vi.mock("./mimo-agente-revenda.server", () => ({ lerFichaRevendaAgente: f.ficha }));
vi.mock("./mimo-agente-modelo.server", () => ({ gerarRespostaAgente: f.modelo }));
vi.mock("./mimo-agente-aprendizado.server", () => ({ lerAprendizadoAgente: f.perfil }));
vi.mock("./mimo-agente-processador.server", () => ({ processarRespostaAgente: f.processar }));
vi.mock("./mimo-whatsapp-remetente.server", () => ({ obterRemetenteAgente: f.remetente }));
vi.mock("./uazapi.server", () => ({
  uazSendText: f.enviarTexto, uazSendMedia: f.enviarMedia, uazPresence: vi.fn(),
  uazBuscarMensagemRecebida: vi.fn(), uazBaixarImagem: vi.fn(),
}));
import { executarAgenteMimo } from "./mimo-agente-worker.server";
const id = "00000000-0000-4000-8000-000000000001";
// Synthetic reproduction of the resale-ad conversation; no real contact data.
const conversa = [
  { role: "user" as const, content: "Olá bom dia" },
  { role: "assistant" as const, content: "Bom dia, tudo bem?\nGostaria de revender nossa marca ou ser representante?\nMe informe seu nome, estado e ramo de atuação, por favor!" },
  { role: "user" as const, content: "Gostaria de falar no setor de marketing" },
];
const confirmada = [...conversa, { role: "assistant" as const, content: PERGUNTA_MARKETING_AGENTE }, { role: "user" as const, content: "Sim, parceria" }];
const tarefa = { id, reserva: id, empresa: id, conversa: id, telefone: "5511900000000", vinculo: id, config: configInicialAgente, dados: {}, mensagens: conversa, encerramentoRevenda: true };
beforeEach(() => { vi.resetAllMocks(); });

it("o formulário reutilizado é o oficial já publicado", () => {
  expect(FORMULARIO_INFLUENCER_AGENTE).toBe("Para parceria como influencer, preencha nosso formulário: https://zapscout.com.br/influenciadores");
});

it.each([
  "Gostaria de falar no setor de marketing",
  "Gostaria de falar com a pessoa que organiza o marketing",
  "Quero falar com o marketing 🙏",
  "Bom dia!\nVocês têm alguém do marketing?",
])("marketing genérico só pergunta o assunto, sem desqualificar: %s", (content) => {
  const m = [...conversa.slice(0, 2), { role: "user" as const, content }];
  expect(parceriaInfluenciaAgente(m, {})).toBeNull();
  const r = respostaDeterministicaAgente(configInicialAgente, m, {});
  expect(r).toMatchObject({ resposta: PERGUNTA_MARKETING_AGENTE, estado: "agente", encaminhar: false, motivo: "" });
});

it("marketing genérico prevalece sobre o criativo de revenda", () => {
  const r = respostaDeterministicaAgente(configInicialAgente, conversa, {}, false, true, false, "revenda");
  expect(r?.resposta).toBe(PERGUNTA_MARKETING_AGENTE);
});

it.each(["Sim, parceria", "Isso", "sim", "Sou influenciadora, quero divulgar"])("confirmação de parceria envia o formulário e desqualifica: %s", (content) => {
  const m = [...conversa, { role: "assistant" as const, content: PERGUNTA_MARKETING_AGENTE }, { role: "user" as const, content }];
  expect(respostaDeterministicaAgente(configInicialAgente, m, {})).toMatchObject({ motivo: "parceria_influencia", estado: "pausada", resposta: FORMULARIO_INFLUENCER_AGENTE });
});

it.each(["Quero falar com o marketing sobre parceria como influenciadora", "Sou influencer e quero fazer parceria com vocês"])("parceria explícita aplica o fluxo direto: %s", (content) => {
  expect(parceriaInfluenciaAgente([{ role: "user", content }], {})).toMatchObject({ motivo: "parceria_influencia" });
});

it.each(["Não, é outro assunto", "Não sou influenciadora", "É sobre uma vaga", "Quero saber o preço para revender", "Sou influenciadora mas também quero revender"])("outra intenção ou mistura após a pergunta não desqualifica: %s", (content) => {
  const m = [...conversa, { role: "assistant" as const, content: PERGUNTA_MARKETING_AGENTE }, { role: "user" as const, content }];
  expect(parceriaInfluenciaAgente(m, {})).toBeNull();
  expect(respostaDeterministicaAgente(configInicialAgente, m, {})?.motivo ?? "").not.toBe("parceria_influencia");
});

it("mistura de influência com revenda na mesma mensagem preserva a intenção comercial", () => {
  expect(parceriaInfluenciaAgente([{ role: "user", content: "Sou influencer e quero revender seus produtos" }], {})).toBeNull();
});

it("silêncio após a pergunta mantém triagem e suspende lembretes de revenda", async () => {
  const m = [...conversa, { role: "assistant" as const, content: PERGUNTA_MARKETING_AGENTE }];
  expect(esclarecimentoMarketingPendenteAgente(m)).toBe(true);
  expect(parceriaInfluenciaAgente(m, {})).toBeNull();
  f.fila.mockResolvedValue({ ...tarefa, mensagens: m, followup: true, followupEtapa: 1 });
  f.processar.mockImplementation(async (d) => { expect(await d.gerar()).toBeNull(); });
  await executarAgenteMimo();
  expect(f.enviarTexto).not.toHaveBeenCalled();
});

it("worker pergunta o assunto ao marketing genérico sem modelo e sem desqualificar", async () => {
  f.fila.mockResolvedValue({ ...tarefa, parceriaInfluencia: true });
  f.processar.mockImplementation(async (d) => {
    expect(await d.gerar()).toMatchObject({ resposta: PERGUNTA_MARKETING_AGENTE, estado: "agente", motivo: "" });
  });
  await executarAgenteMimo();
  expect(f.modelo).not.toHaveBeenCalled();
});

it.each([
  ["Quero falar com o marketing sobre revender", null],
  ["Preciso falar com o marketing sobre meu pedido atrasado", "suporte"],
  ["Sou de uma agência e quero oferecer serviços de marketing", null],
  ["Tem vaga no setor de marketing?", null],
  ["Quero falar com uma pessoa", "atendimento_humano"],
  ["Gostaria de falar no setor de marketing. Não me envie mais mensagens.", "parar"],
] as const)("preserva intenção específica fora de influência: %s", (content, motivo) => {
  expect(parceriaInfluenciaAgente([{ role: "user", content }], {})).toBeNull();
  const r = respostaDeterministicaAgente(configInicialAgente, [{ role: "assistant", content: "Olá" }, { role: "user", content }], {});
  expect(r?.motivo ?? null).not.toBe("parceria_influencia");
  if (motivo) expect(r?.motivo).toBe(motivo);
});

it("worker envia o formulário após confirmação quando o banco suporta", async () => {
  f.fila.mockImplementation(async (acao) => acao === "reservar" ? { ...tarefa, mensagens: confirmada, parceriaInfluencia: true } : true);
  f.remetente.mockResolvedValue("token-sintetico");
  f.enviarTexto.mockResolvedValue({ id: "parceria" });
  f.processar.mockImplementation(async (d) => {
    const r = await d.gerar();
    expect(r).toMatchObject({ motivo: "parceria_influencia", estado: "pausada", encaminhar: false });
    expect(await d.remetente()).toBe(true);
    expect(await d.autorizar(r)).toBe(true);
    await d.enviar(r.resposta);
  });
  await executarAgenteMimo();
  expect(f.modelo).not.toHaveBeenCalled();
  expect(f.ficha).not.toHaveBeenCalled();
  expect(f.fila).toHaveBeenCalledWith("autorizar", expect.objectContaining({ resultado: expect.objectContaining({ motivo: "parceria_influencia" }) }));
  // Synthetic mock only: no real WhatsApp is sent in tests.
  expect(f.enviarTexto).toHaveBeenCalledExactlyOnceWith("token-sintetico", tarefa.telefone, FORMULARIO_INFLUENCER_AGENTE);
});

it("sem a migração aplicada a confirmação não envia nada nem cai em revenda/handoff", async () => {
  f.fila.mockResolvedValue({ ...tarefa, mensagens: confirmada });
  f.processar.mockImplementation(async (d) => { expect(await d.gerar()).toBeNull(); });
  await executarAgenteMimo();
  expect(f.modelo).not.toHaveBeenCalled();
});

it("não aceita parceria sugerida pelo modelo", async () => {
  f.fila.mockResolvedValue({ ...tarefa, parceriaInfluencia: true, mensagens: [{ role: "user", content: "Quero revender" }] });
  f.ficha.mockResolvedValue(null);
  f.modelo.mockResolvedValue({ resposta: FORMULARIO_INFLUENCER_AGENTE, motivo: "parceria_influencia", estado: "pausada", encaminhar: false });
  f.processar.mockImplementation(async (d) => { expect(await d.gerar()).toBeNull(); });
  await executarAgenteMimo();
});
