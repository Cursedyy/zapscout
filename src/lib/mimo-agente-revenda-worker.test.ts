import { beforeEach, expect, it, vi } from "vitest";
import { APRESENTACAO_CATALOGO_AGENTE, configInicialAgente, respostaDeterministicaAgente } from "./mimo-agente";
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
it("aproveita a ficha sem pular sondagem e apresentação do catálogo", async () => {
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

it("aceite da oferta usa o PDF aprovado e registra o material no mesmo envio", async () => {
  const path = `${id}/${id}.pdf`;
  const comCatalogo = {
    ...tarefa,
    config: { ...tarefa.config, materiais: [id] },
    materiais: [{ id, empresa_id: id, path, mime: "application/pdf", tipo: "catalogo" }],
    mensagens: [
      { role: "assistant", content: "Gostaria de dar uma olhada no catálogo?" },
      { role: "user", content: "Sim!" },
    ],
  };
  f.fila.mockImplementation(async acao => acao === "reservar" ? comCatalogo : true);
  f.modelo.mockImplementation((config, mensagens, dados) => respostaDeterministicaAgente(config, mensagens, dados));
  f.remetente.mockResolvedValue("token-sintetico");
  f.link.mockResolvedValue({ data: { signedUrl: "https://example.test/catalogo" } });
  f.enviarMedia.mockResolvedValue({ id: "aceite-pdf" });
  f.processar.mockImplementation(async d => {
    const resultado = await d.gerar();
    expect(resultado).toMatchObject({ materialId: id, resposta: APRESENTACAO_CATALOGO_AGENTE });
    expect(await d.remetente()).toBe(true);
    expect(await d.autorizar(resultado)).toBe(true);
    expect(await d.enviar(resultado.resposta)).toBe("aceite-pdf");
  });
  await executarAgenteMimo();
  expect(f.link).toHaveBeenCalledWith(path, 60);
  expect(f.enviarMedia).toHaveBeenCalledWith("token-sintetico", tarefa.telefone, "https://example.test/catalogo",
    { type: "document", caption: APRESENTACAO_CATALOGO_AGENTE });
  expect(f.enviarTexto).not.toHaveBeenCalled();
});
