import { beforeEach, expect, it, vi } from "vitest";
import { configInicialAgente, encerramentoRevendaAgente, respostaDeterministicaAgente } from "./mimo-agente";
import { revendaSchema, mensagemRevenda } from "./mimo-revenda";
const f = vi.hoisted(() => ({
  fila: vi.fn(), ficha: vi.fn(), modelo: vi.fn(), perfil: vi.fn(), processar: vi.fn(),
  remetente: vi.fn(), link: vi.fn(), enviarMedia: vi.fn(), enviarTexto: vi.fn(),
  buscarMensagem: vi.fn(), baixarImagem: vi.fn(),
}));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { storage: { from: () => ({ createSignedUrl: f.link }) } },
}));
vi.mock("./mimo-agente-db.server", () => ({ workerAgente: f.fila }));
vi.mock("./mimo-agente-revenda.server", () => ({ lerFichaRevendaAgente: f.ficha }));
vi.mock("./mimo-agente-modelo.server", () => ({ gerarRespostaAgente: f.modelo }));
vi.mock("./mimo-agente-aprendizado.server", () => ({ lerAprendizadoAgente: f.perfil }));
vi.mock("./mimo-agente-processador.server", () => ({ processarRespostaAgente: f.processar }));
vi.mock("./mimo-whatsapp-remetente.server", () => ({ obterRemetenteAgente: f.remetente }));
vi.mock("./uazapi.server", () => ({
  uazSendText: f.enviarTexto, uazSendMedia: f.enviarMedia, uazPresence: vi.fn(),
  uazBuscarMensagemRecebida: f.buscarMensagem, uazBaixarImagem: f.baixarImagem,
}));
import { executarAgenteMimo } from "./mimo-agente-worker.server";
const id = "00000000-0000-4000-8000-000000000001";
const respostas = revendaSchema.parse({ envio_id: id, interesse: "revenda", canal: "internet", cidade: "Teste", uf: "SP", investimento: "sim", prazo: "agora", nome: "Cliente Teste", whatsapp: "11988887777", consentimento: true });
const tarefa = { id, reserva: id, empresa: id, conversa: id, telefone: "5511988887777", vinculo: id, config: configInicialAgente, dados: {}, mensagens: [{ role: "user", content: mensagemRevenda(respostas) }] };
beforeEach(() => { vi.resetAllMocks(); f.fila.mockResolvedValue(tarefa); f.ficha.mockResolvedValue({ id, preenchidoEm: new Date().toISOString(), respostas }); f.modelo.mockResolvedValue({resposta:"Qual sua maior dificuldade hoje?",dados:{},estado:"agente",encaminhar:false,motivo:"",resumo:"Sondagem"}); });
it("aproveita a ficha sem pular a sondagem", async () => {
  let resultado: any;
  f.processar.mockImplementation(async d => { resultado = await d.gerar(); });
  expect(await executarAgenteMimo()).toBe("processada");
  expect(f.ficha).toHaveBeenCalledWith(id, tarefa.telefone);
  expect(resultado).toMatchObject({ estado: "agente", encaminhar: false });
  expect(f.modelo.mock.calls[0][2]).toMatchObject({nome:{valor:"Cliente Teste",evidencia:"[Formulário de revenda verificado] Cliente Teste"}});
  const d = f.processar.mock.calls[0][0];
  await d.autorizar(resultado);
  expect(f.fila).toHaveBeenCalledWith("autorizar", { id, reserva: id, resultado });
});
it("não consulta ficha nem transforma follow-up em novo encaminhamento", async () => {
  f.fila.mockResolvedValue({ ...tarefa, followup: true });
  let resultado: any;
  f.processar.mockImplementation(async d => { resultado = await d.gerar(); });
  await executarAgenteMimo();
  expect(f.ficha).not.toHaveBeenCalled();
  expect(resultado.estado).toBe("agente");
});

it.each(["confirmada", "outra conversa", "reserva cancelada"])("verifica uma foto antes de enviá-la ao modelo (%s)", async (cenario) => {
  const foto = { role: "user", messageId: "foto-original", content: "[imagem] Qual é essa embalagem?" };
  const imagem = { bytes: Uint8Array.of(137, 80, 78, 71), mime: "image/png" };
  const trabalho = { ...tarefa, mensagens: [foto] };
  f.fila.mockImplementation(async (acao) => acao === "reservar" ? trabalho : cenario !== "reserva cancelada");
  f.remetente.mockResolvedValue("token-sintetico");
  f.buscarMensagem.mockResolvedValue({
    id: foto.messageId, fromMe: false, messageType: "ImageMessage",
    chatid: `${cenario === "outra conversa" ? "5511911112222" : tarefa.telefone}@s.whatsapp.net`,
  });
  f.baixarImagem.mockResolvedValue(imagem);
  f.processar.mockImplementation(async d => { await d.gerar(); });

  await executarAgenteMimo();
  expect(f.buscarMensagem).toHaveBeenCalledWith("token-sintetico", foto.messageId);
  if (cenario === "outra conversa") {
    expect(f.baixarImagem).not.toHaveBeenCalled();
    expect(f.modelo.mock.calls[0][1]).toEqual([foto]);
  } else if (cenario === "reserva cancelada") {
    expect(f.modelo).not.toHaveBeenCalled();
  } else {
    expect(f.baixarImagem).toHaveBeenCalledWith("token-sintetico", foto.messageId);
    expect(f.modelo.mock.calls[0][1]).toEqual([{ ...foto, content: "Qual é essa embalagem?", imagem }]);
  }
});

it("um catálogo aprovado e solicitado fica com a equipe. A apresentação mantém o fluxo", async () => {
  const path = `${id}/${id}.pdf`;
  const pedido = {
    ...tarefa,
    config: { ...tarefa.config, materiais: [id] },
    materiais: [{ id, empresa_id: id, path, mime: "application/pdf", tipo: "catalogo" }],
    mensagens: [
      { role: "assistant", content: "Gostaria de dar uma olhada no catálogo?" },
      { role: "user", content: "Sim!" },
    ],
  };
  f.remetente.mockResolvedValue("token-sintetico");
  f.modelo.mockImplementation((config, mensagens, dados) => respostaDeterministicaAgente(config, mensagens, dados));
  f.fila.mockImplementation(async acao => acao === "reservar" ? pedido : true);
  f.enviarTexto.mockResolvedValue({ id: "encaminhamento" });
  f.processar.mockImplementation(async d => {
    const resultado = await d.gerar();
    expect(resultado).toMatchObject({ estado: "humano", motivo: "catalogo_comercial" });
    expect(resultado).not.toHaveProperty("materialId");
    expect(await d.remetente()).toBe(true);
    expect(await d.autorizar(resultado)).toBe(true);
    expect(await d.enviar(resultado.resposta)).toBe("encaminhamento");
  });
  await executarAgenteMimo();
  expect(f.link).not.toHaveBeenCalled();
  expect(f.enviarMedia).not.toHaveBeenCalled();
  expect(f.enviarTexto).toHaveBeenCalledOnce();

  const apresentacao = {
    ...pedido,
    materiais: [{ ...pedido.materiais[0], tipo: "apresentacao" }],
    mensagens: [{ role: "user", content: "Pode enviar a apresentação?" }],
  };
  f.fila.mockImplementation(async acao => acao === "reservar" ? apresentacao : true);
  f.link.mockResolvedValue({ data: { signedUrl: "https://example.test/apresentacao" } });
  f.enviarMedia.mockResolvedValue({ id: "apresentacao" });
  f.processar.mockImplementation(async d => {
    const resultado = await d.gerar();
    expect(resultado).toMatchObject({ estado: "agente", materialId: id });
    expect(await d.remetente()).toBe(true);
    expect(await d.autorizar(resultado)).toBe(true);
    expect(await d.enviar(resultado.resposta)).toBe("apresentacao");
  });
  await executarAgenteMimo();
  expect(f.link).toHaveBeenCalledWith(path, 60);
  expect(f.enviarMedia).toHaveBeenCalledOnce();
});

it("o lembrete em conversa com catálogo antigo retoma a revenda", async () => {
  f.fila.mockResolvedValue({ ...tarefa, followup: true, catalogoApresentado: true });
  f.processar.mockImplementation(async d => {
    const resultado = await d.gerar();
    expect(resultado.resposta).toMatch(/revenda/i);
    expect(resultado.resposta).not.toMatch(/catálogo/i);
  });
  await executarAgenteMimo();
});

it.each([
  "não tenho interesse",
  "Não tenho mais interesse em revender, obrigada!",
  "Não quero mais revender a marca.",
  "Desisto da revenda.",
  "Apertei por engano, desculpe",
  "Cliquei no anúncio sem querer.\nFoi mal!",
  "[Transcrição de áudio]\nNão tenho interesse.",
  "[TranscriÃ§Ã£o de Ã¡udio]\nApertei por engano, desculpe.",
  "Olá, boa tarde! Obrigada pelo contato.\nMas não tenho interesse 👍👍",
])("encerra uma recusa ou contato por engano sem usar o modelo: %s", async (content) => {
  f.fila.mockImplementation(async (acao) => acao === "reservar"
    ? { ...tarefa, encerramentoRevenda: true, mensagens: [{ role: "user", content }] }
    : true);
  f.remetente.mockResolvedValue("token-sintetico");
  f.enviarTexto.mockResolvedValue({ id: "encerramento" });
  f.processar.mockImplementation(async (d) => {
    const resultado = await d.gerar();
    expect(resultado).toMatchObject({ motivo: "falta_interesse", estado: "pausada", encaminhar: false });
    expect(await d.remetente()).toBe(true);
    expect(await d.autorizar(resultado)).toBe(true);
    expect(await d.enviar(resultado.resposta)).toBe("encerramento");
  });
  await executarAgenteMimo();
  expect(f.modelo).not.toHaveBeenCalled();
  expect(f.ficha).not.toHaveBeenCalled();
  expect(f.enviarMedia).not.toHaveBeenCalled();
  expect(f.enviarTexto).toHaveBeenCalledExactlyOnceWith("token-sintetico", tarefa.telefone, "Tudo bem, agradeço pelo retorno!");
});

it("não autoriza encerramento parcial quando a migração ainda não foi aplicada", async () => {
  f.fila.mockResolvedValue({ ...tarefa, mensagens: [{ role: "user", content: "não tenho interesse" }] });
  f.processar.mockImplementation(async d => { expect(await d.gerar()).toBeNull(); });
  await executarAgenteMimo();
  expect(f.modelo).not.toHaveBeenCalled();
});

it("não registra perda sugerida pelo modelo em vez de uma recusa literal", async () => {
  f.fila.mockResolvedValue({ ...tarefa, encerramentoRevenda: true });
  f.modelo.mockResolvedValue({ resposta: "Tudo bem, agradeço pelo retorno!", motivo: "falta_interesse", estado: "pausada", encaminhar: false });
  f.processar.mockImplementation(async d => { expect(await d.gerar()).toBeNull(); });
  await executarAgenteMimo();
  expect(f.modelo).toHaveBeenCalledOnce();
});

it.each([
  ["Não tenho interesse. Não me envie mais mensagens.", "Você tem interesse em revender?", "parar"],
  ["Não quero mais revender. Preciso de suporte com meu pedido.", "Você tem interesse em revender?", "suporte"],
  ["Não tenho interesse no catálogo.", "Você tem interesse em revender?", null],
  ["Não tenho interesse por enquanto.", "Você tem interesse em revender?", null],
  ["Não tenho interesse", "Gostaria de ser representante?", null],
  ["Não tenho interesse", "Pode me contar brevemente o assunto do suporte?", "suporte"],
] as const)("não confunde %s com perda de revenda", (content, anterior, motivo) => {
  const r = respostaDeterministicaAgente(configInicialAgente, [
    { role: "assistant", content: anterior }, { role: "user", content },
  ], {});
  expect(r?.motivo ?? null).toBe(motivo);
});

it("interpreta o fragmento de recusa em mensagens agrupadas após pergunta sobre revenda", () => {
  expect(encerramentoRevendaAgente([
    { role: "assistant", content: "Você tem interesse em revender os produtos da MiMo?" },
    { role: "user", content: "Obg" },
    { role: "user", content: "Tenho não" },
    { role: "user", content: "Agradeço" },
  ], {})?.motivo).toBe("falta_interesse");
});

it.each([
  ["Apertei por engano, desculpe. Mas quero revender.", "Você tem interesse em revender?"],
  ["Fiz um pedido por engano, desculpe.", "Qual o número do pedido?"],
  ["Apertei por engano, desculpe.", "Pode me contar brevemente o assunto do suporte?"],
  ["Obg / Tenho não / Agradeço", ""],
  ["Obg / Tenho não / Agradeço", "Você tem interesse em revender? Você tem CNPJ?"],
  ["Obg / Tenho não / Agradeço", "Você quer revender ou ser representante?"],
  ["Obg / Tenho não / Agradeço", "Você tem o número do pedido para o suporte?"],
  ["Obrigada, mas não tenho interesse 👍. Qual o preço?", "Você tem interesse em revender?"],
  ["Não tenho interesse, mas envie o catálogo.", "Você tem interesse em revender?"],
  ["Obrigada, mas não tenho interesse 👍", "Pode me contar brevemente o assunto do suporte?"],
  ["Não, tenho interesse!", "Você tem interesse em revender?"],
])("não registra perda para %s (contexto: %s)", (content, anterior) => {
  expect(encerramentoRevendaAgente([
    { role: "assistant", content: anterior }, { role: "user", content },
  ], {})).toBeNull();
});
