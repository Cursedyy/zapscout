import { beforeEach, expect, it, vi } from "vitest";
import { configInicialAgente, finalizarResultadoAgente, pendenciaComercialAgente, respostaDeterministicaAgente } from "./mimo-agente";
const f = vi.hoisted(() => ({ fila: vi.fn(), ficha: vi.fn(), modelo: vi.fn(), perfil: vi.fn(), processar: vi.fn(), remetente: vi.fn(), enviarTexto: vi.fn(), envio: { etapa: 1, silencio_em: "" } as { etapa: number; silencio_em: string } | null }));
vi.mock("@/integrations/supabase/client.server", () => {
  const q: Record<string, unknown> = {};
  q.select = () => q; q.eq = () => q; q.maybeSingle = async () => ({ data: f.envio, error: null });
  return { supabaseAdmin: { storage: { from: () => ({}) }, from: () => q } };
});
vi.mock("./mimo-agente-db.server", () => ({ workerAgente: f.fila }));
vi.mock("./mimo-agente-revenda.server", () => ({ lerFichaRevendaAgente: f.ficha }));
vi.mock("./mimo-agente-modelo.server", () => ({ gerarRespostaAgente: f.modelo }));
vi.mock("./mimo-agente-aprendizado.server", () => ({ lerAprendizadoAgente: f.perfil }));
vi.mock("./mimo-agente-processador.server", () => ({ processarRespostaAgente: f.processar }));
vi.mock("./mimo-whatsapp-remetente.server", () => ({ obterRemetenteAgente: f.remetente }));
vi.mock("./uazapi.server", () => ({ uazSendText: f.enviarTexto, uazSendMedia: vi.fn(), uazPresence: vi.fn(), uazBuscarMensagemRecebida: vi.fn(), uazBaixarImagem: vi.fn() }));
import { executarAgenteMimo } from "./mimo-agente-worker.server";
const id = "00000000-0000-4000-8000-000000000001";
const c = configInicialAgente;
// Synthetic reproduction of the "Distribua MiMo! Procuramos distribuidores" ad conversation.
const base = [
  { role: "user" as const, content: "Olá! Vi o anúncio Distribua MiMo! Procuramos distribuidores" },
  { role: "assistant" as const, content: "Claro! Você quer saber mais sobre revenda, representação ou os produtos da MiMo?" },
  { role: "user" as const, content: "Revenda" },
  { role: "assistant" as const, content: "Ótimo! Em qual estado você pretende revender?" },
  { role: "user" as const, content: "Valores? Entrega? Tipos de produtos? Tempo de entrega?" },
];
const revenda = { revenda: { valor: "Revenda", evidencia: "Revenda" } };
beforeEach(() => vi.resetAllMocks());

it("perguntas comerciais preservam o motivo durante a coleta obrigatória", () => {
  const det = respostaDeterministicaAgente(c, base, revenda, false, true);
  expect(det).toMatchObject({ motivo: "condicao_comercial", encaminhar: false, estado: "agente" });
  // The server asks for all missing handoff fields.
  const r = finalizarResultadoAgente(c, base, revenda, { resposta: "Como você se chama?", dados: {}, encaminhar: false, motivo: "" }, new Date(), false, true);
  expect(r).toMatchObject({ motivo: "condicao_comercial", estado: "agente" });
  expect(r.resposta).toMatch(/nome.*estado.*ramo/);
  expect(r.resposta).not.toMatch(/R\$|\d+ dias/i);
  expect(r.dados.revenda?.valor).toBe("Revenda");
  expect(r.resumo).toMatch(/Assunto: revenda/);
});

it("tempo de entrega sozinho também não vira coleta genérica", () => {
  const r = finalizarResultadoAgente(c, [...base.slice(0, 4), { role: "user", content: "Qual o tempo de entrega?" }], revenda,
    { resposta: "Como você se chama?", dados: {}, encaminhar: false, motivo: "" }, new Date(), false, true);
  expect(r.motivo).toBe("condicao_comercial");
});

it("esclarece o produto quando a pergunta de preço vem em linguagem informal", () => {
  const perguntas = [{ role: "user" as const, content: "Sim" }, { role: "user" as const, content: "Quanto tá??" }];
  const r = respostaDeterministicaAgente(c, perguntas, revenda);
  expect(r?.resposta).toBe("De qual produto você gostaria de saber o preço?");
  expect(pendenciaComercialAgente(c, perguntas)).toBe(true);
  const produto = [...perguntas, { role: "assistant" as const, content: r!.resposta }, { role: "user" as const, content: "Barrinhas" }];
  expect(respostaDeterministicaAgente(c, produto, revenda)?.motivo).toBe("preco_produto_pendente");
});

const legado = [...base, { role: "assistant" as const, content: "Como você se chama?" }];
it.each([1, 2])("follow-up etapa %i é suprimido com pergunta comercial pendente, mesmo após triagem de nome", async (etapa) => {
  expect(pendenciaComercialAgente(c, legado)).toBe(true);
  f.fila.mockResolvedValue({ id, reserva: id, empresa: id, conversa: id, telefone: "5511900000000", vinculo: id, config: c, dados: revenda, mensagens: legado, followup: true, followupEtapa: etapa });
  f.processar.mockImplementation(async (d) => { expect(await d.gerar()).toBeNull(); });
  await executarAgenteMimo();
  expect(f.enviarTexto).not.toHaveBeenCalled();
});

it.each([1, 2])("follow-up de revenda etapa %i continua quando não há pendência", async (etapa) => {
  f.envio = { etapa, silencio_em: new Date(Date.now() - (etapa === 1 ? 61 : 181) * 60_000).toISOString() };
  const elegivel = [...base.slice(0, 3), { role: "assistant" as const, content: "Posso ajudar com a revenda MiMo." }];
  expect(pendenciaComercialAgente(c, elegivel)).toBe(false);
  f.fila.mockResolvedValue({ id, reserva: id, empresa: id, conversa: id, telefone: "5511900000000", vinculo: id, config: c, dados: revenda, mensagens: elegivel, followup: true, followupEtapa: etapa });
  f.processar.mockImplementation(async (d) => {
    const r = await d.gerar();
    expect(r).toMatchObject({ estado: "agente", encaminhar: false });
    expect(r.resposta).toMatch(/revenda/);
  });
  await executarAgenteMimo();
});

it.each([[1, 40], [1, 59], [2, 179]])("job legado etapa %i com %i min de silêncio não envia antecipado", async (etapa, minutos) => {
  f.envio = { etapa, silencio_em: new Date(Date.now() - minutos * 60_000).toISOString() };
  const elegivel = [...base.slice(0, 4)];
  f.fila.mockResolvedValue({ id, reserva: id, empresa: id, conversa: id, telefone: "5511900000000", vinculo: id, config: c, dados: revenda, mensagens: elegivel, followup: true, followupEtapa: etapa });
  f.processar.mockImplementation(async (d) => { expect(await d.gerar()).toBeNull(); });
  await executarAgenteMimo();
  expect(f.enviarTexto).not.toHaveBeenCalled();
});
it("lembrete sem registro de agendamento não envia", async () => {
  f.envio = null;
  f.fila.mockResolvedValue({ id, reserva: id, empresa: id, conversa: id, telefone: "5511900000000", vinculo: id, config: c, dados: revenda, mensagens: [...base.slice(0, 4)], followup: true, followupEtapa: 1 });
  f.processar.mockImplementation(async (d) => { expect(await d.gerar()).toBeNull(); });
  await executarAgenteMimo();
});
