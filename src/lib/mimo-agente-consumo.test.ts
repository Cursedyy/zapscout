import { beforeEach, expect, it, vi } from "vitest";
import {
  configAgenteSchema, configInicialAgente, consumoProprioAgente, finalizarResultadoAgente,
  respostaContingenciaAgente, respostaDeterministicaAgente, RETORNO_VAREJO_AGENTE,
} from "./mimo-agente";
const f = vi.hoisted(() => ({ fila: vi.fn(), processar: vi.fn(), envio: { etapa: 1, silencio_em: new Date(0).toISOString() } }));
vi.mock("@/integrations/supabase/client.server", () => {
  const q: Record<string, unknown> = {};
  q.select = () => q; q.eq = () => q; q.maybeSingle = async () => ({ data: f.envio, error: null });
  return { supabaseAdmin: { storage: { from: () => ({}) }, from: () => q } };
});
vi.mock("./mimo-agente-db.server", () => ({ workerAgente: f.fila }));
vi.mock("./mimo-agente-revenda.server", () => ({ lerFichaRevendaAgente: vi.fn() }));
vi.mock("./mimo-agente-modelo.server", () => ({ gerarRespostaAgente: vi.fn() }));
vi.mock("./mimo-agente-aprendizado.server", () => ({ lerAprendizadoAgente: vi.fn() }));
vi.mock("./mimo-agente-processador.server", () => ({ processarRespostaAgente: f.processar }));
vi.mock("./mimo-whatsapp-remetente.server", () => ({ obterRemetenteAgente: vi.fn() }));
vi.mock("./uazapi.server", () => ({ uazSendText: vi.fn(), uazSendMedia: vi.fn(), uazPresence: vi.fn(), uazBuscarMensagemRecebida: vi.fn(), uazBaixarImagem: vi.fn() }));
import { executarAgenteMimo } from "./mimo-agente-worker.server";
import { PERGUNTA_ASSUNTO_AGENTE } from "./mimo-agente-opcoes";
import { conteudoRecebidoMimo } from "./mimo-whatsapp";

// Synthetic offer values (never real store data).
const URL = "https://loja.exemplo.test/mimo";
const comCupom = configAgenteSchema.parse({ varejo: { url: URL, cupom: "TESTE10", revisado: true } });
const autoaplicado = configAgenteSchema.parse({ varejo: { url: `${URL}?desconto=auto`, cupomAutoaplicado: true, revisado: true } });
const naoRevisado = configAgenteSchema.parse({ varejo: { url: URL, cupom: "TESTE10" } });
const semCupom = configAgenteSchema.parse({ varejo: { url: URL, revisado: true } });
const u = (content: string) => ({ role: "user" as const, content });
const a = (content: string) => ({ role: "assistant" as const, content });
const ex = [u("Quero comprar para mim msm")];
beforeEach(() => vi.resetAllMocks());

it("consumo próprio selecionado no menu vai direto para o site e cupom", () => {
  const r = respostaDeterministicaAgente(comCupom, [
    u("Oi"), a("Como você se chama?"), u("Ana"), a(PERGUNTA_ASSUNTO_AGENTE),
    u(conteudoRecebidoMimo({buttonOrListid:"mimo_consumo"},"")),
  ], {});
  expect(r?.resposta).toContain(URL);
  expect(r?.resposta).toContain("TESTE10");
  expect(r?.resposta).not.toMatch(/pedido mínimo|\?/);
});

it("configurações antigas continuam válidas sem oferta de varejo", () => {
  expect(configAgenteSchema.parse({}).varejo).toBeNull();
});
it("exemplo real recebe link e cupom configurados, sem pedir cadastro", () => {
  const r = respostaDeterministicaAgente(comCupom, ex, {});
  expect(r?.resposta).toContain(URL);
  expect(r?.resposta).toContain("TESTE10");
  expect(r?.estado).toBe("agente");
  expect(r?.encaminhar).toBe(false);
  expect(r?.resposta).not.toMatch(/nome|estado|ramo|profiss/i);
});
it.each(["Pra mim", "É para mim"])("reconhece a resposta curta sobre o objetivo: %s", (texto) => {
  const r = respostaDeterministicaAgente(comCupom, [a("Revenda ou consumo próprio?"), u(texto)], {});
  expect(r?.resposta).toContain("TESTE10");
});
it("link com desconto autoaplicado dispensa cupom", () => {
  const r = respostaDeterministicaAgente(autoaplicado, ex, {});
  expect(r?.resposta).toContain(`${URL}?desconto=auto`);
  expect(r?.resposta).not.toMatch(/cupom/i);
});
it.each([["sem oferta", configInicialAgente], ["não revisada", naoRevisado], ["sem cupom nem autoaplicado", semCupom]])(
  "oferta %s vai à equipe sem prometer desconto", (_n, cfg) => {
    const r = respostaDeterministicaAgente(cfg, ex, {});
    expect(r?.motivo).toBe("consumo_proprio");
    expect(r).toMatchObject({ estado: "humano", encaminhar: true });
    expect(r?.resposta).not.toMatch(/desconto|cupom|https?:|seu nome|seu estado|ramo de atua/i);
  });
it("explícito vence o anúncio de revenda", () => {
  const r = respostaDeterministicaAgente(comCupom, ex, {}, false, false, false, "revenda");
  expect(r?.resposta).toContain("TESTE10");
});
it("envia oferta para consumo de agora mesmo com revenda futura no mesmo texto", () => {
  const mensagens = [a("Sua dúvida é sobre revenda, representação ou compra para consumo próprio?"),
    u("Gostaria de saber como é composição o que tem\nA princípio seria para consumo próprio e depois as vezes para revenda na escola")];
  expect(respostaDeterministicaAgente(comCupom, mensagens, {}, false, true, false, "revenda"))
    .toMatchObject({ estado: "agente", encaminhar: false, resposta: expect.stringContaining("TESTE10") });
});
it("aplica a oferta autorizada quando a versão ativa é anterior à configuração de varejo", async () => {
  const id = "00000000-0000-4000-8000-000000000001";
  f.fila.mockResolvedValue({ id, reserva: id, empresa: id, conversa: id, telefone: "5511900000000", vinculo: id, config: {}, dados: {},
    mensagens: ex });
  f.processar.mockImplementation(async d => {
    const r = respostaDeterministicaAgente(d.config, ex, {});
    expect(r?.resposta).toContain("https://www.mimoessepode.com.br/");
    expect(r?.resposta).toContain("MIMOCONSULTOR");
  });
  await executarAgenteMimo();
  expect(f.processar).toHaveBeenCalledOnce();
});
it("cidade e profissão depois do objetivo mantêm consumo, sem revenda", () => {
  const conversa = [...ex, a(respostaDeterministicaAgente(comCupom, ex, {})!.resposta), u("Sou de Curitiba/PR, sou professora")];
  const r = respostaDeterministicaAgente(comCupom, conversa, {});
  expect(r?.resposta).toBe(RETORNO_VAREJO_AGENTE);
  expect(r?.dados.revenda).toBeUndefined();
  const modelo = finalizarResultadoAgente(comCupom, conversa, {}, { resposta: "Qual é o seu ramo de atuação?", dados: {}, encaminhar: false, motivo: "" });
  expect(modelo.resposta).toBe(RETORNO_VAREJO_AGENTE);
  expect(modelo.motivo).toBe("");
});
it("fallback do modelo também envia a oferta", () => {
  const r = respostaContingenciaAgente(comCupom, ex, {});
  expect(r.resposta).toContain("TESTE10");
});
it.each(["Manda o catálogo pra mim", "Não é para consumo próprio, quero revender", "Quero revender na minha loja"])(
  "evita falso positivo: %s", (texto) => {
    expect(consumoProprioAgente(texto)).toBe(false);
    expect(respostaDeterministicaAgente(comCupom, [u(texto)], {})?.resposta ?? "").not.toContain("TESTE10");
  });
it.each([["Quero comprar pra mim, mas quero falar com um atendente", "atendimento_humano"], ["É pra mim msm, pare de mandar mensagens", "parar"], ["Comprei pra mim e meu pedido não chegou", "suporte"]])(
  "preserva humano, opt-out e suporte: %s", (texto, motivo) => {
    expect(respostaDeterministicaAgente(comCupom, [u(texto)], {})?.motivo).toBe(motivo);
  });
it.each([1, 2])("worker suprime lembrete de revenda da etapa %i", async (etapa) => {
  const id = "00000000-0000-4000-8000-000000000001";
  f.fila.mockResolvedValue({ id, reserva: id, empresa: id, conversa: id, telefone: "5511900000000", vinculo: id, config: comCupom, dados: {},
    mensagens: [...ex, a(respostaDeterministicaAgente(comCupom, ex, {})!.resposta)], followup: true, followupEtapa: etapa });
  f.processar.mockImplementation(async (d) => { expect(await d.gerar()).toBeNull(); });
  await executarAgenteMimo();
  expect(f.processar).toHaveBeenCalledOnce();
});
