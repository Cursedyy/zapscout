import { beforeEach, expect, it, vi } from "vitest";
import { configInicialAgente, encerramentoRevendaAgente, respostaDeterministicaAgente } from "./mimo-agente";
import { revendaSchema, mensagemRevenda } from "./mimo-revenda";
import { PERGUNTA_ASSUNTO_AGENTE, opcoesPerguntaAgente } from "./mimo-agente-opcoes";
import { FORMULARIO_INFLUENCER_AGENTE, FORMULARIO_REPRESENTANTE_AGENTE } from "./mimo-agente-formularios";
import { conteudoRecebidoMimo } from "./mimo-whatsapp";
const f = vi.hoisted(() => ({
  fila: vi.fn(), ficha: vi.fn(), modelo: vi.fn(), perfil: vi.fn(), processar: vi.fn(),
  remetente: vi.fn(), link: vi.fn(), enviarMedia: vi.fn(), enviarTexto: vi.fn(), enviarBotoes: vi.fn(),
  buscarMensagem: vi.fn(), baixarImagem: vi.fn(),
}));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: (tabela: string) => {
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: async () => ({
          data: tabela === "mimo_agente_followup_envios"
            ? { etapa: 2, silencio_em: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString() }
            : null,
          error: null,
        }),
      };
      return query;
    },
    storage: { from: () => ({ createSignedUrl: f.link }) },
  },
}));
vi.mock("./mimo-agente-db.server", () => ({ workerAgente: f.fila }));
vi.mock("./mimo-agente-revenda.server", () => ({ lerFichaRevendaAgente: f.ficha }));
vi.mock("./mimo-agente-modelo.server", () => ({ gerarRespostaAgente: f.modelo }));
vi.mock("./mimo-agente-aprendizado.server", () => ({ lerAprendizadoAgente: f.perfil }));
vi.mock("./mimo-agente-processador.server", () => ({ processarRespostaAgente: f.processar }));
vi.mock("./mimo-whatsapp-remetente.server", () => ({ obterRemetenteAgente: f.remetente }));
vi.mock("./uazapi.server", () => ({
  uazSendText: f.enviarTexto, uazSendMenu: f.enviarBotoes, uazSendMedia: f.enviarMedia, uazPresence: vi.fn(),
  uazBuscarMensagemRecebida: f.buscarMensagem, uazBaixarImagem: f.baixarImagem,
}));
import { executarAgenteMimo } from "./mimo-agente-worker.server";
const id = "00000000-0000-4000-8000-000000000001";
const respostas = revendaSchema.parse({ envio_id: id, interesse: "revenda", canal: "internet", cidade: "Teste", uf: "SP", investimento: "sim", prazo: "agora", nome: "Cliente Teste", whatsapp: "11988887777", consentimento: true });
const tarefa = { id, reserva: id, empresa: id, conversa: id, telefone: "5511988887777", vinculo: id, config: configInicialAgente, dados: {}, mensagens: [{ role: "user", content: mensagemRevenda(respostas) }] };
beforeEach(() => { vi.resetAllMocks(); f.fila.mockResolvedValue(tarefa); f.ficha.mockResolvedValue({ id, preenchidoEm: new Date().toISOString(), respostas }); f.modelo.mockResolvedValue({resposta:"Qual sua maior dificuldade hoje?",dados:{},estado:"agente",encaminhar:false,motivo:"",resumo:"Sondagem"}); });
it("envia as cinco opções da abertura em uma única mensagem interativa", async () => {
  f.remetente.mockResolvedValue("token-sintetico");
  f.enviarBotoes.mockResolvedValue({ id: "menu-id" });
  f.processar.mockImplementation(async d => {
    await d.remetente();
    expect(await d.enviar(PERGUNTA_ASSUNTO_AGENTE)).toBe("menu-id");
  });
  await executarAgenteMimo();
  expect(f.enviarBotoes).toHaveBeenCalledWith("token-sintetico", tarefa.telefone, PERGUNTA_ASSUNTO_AGENTE, [
    "Revendedor(a)|mimo_revenda", "Distribuidor(a)|mimo_quero_distribuir",
    "Representante|mimo_representacao", "Influenciador(a)|mimo_influencia", "Consumidor(a) final|mimo_consumo",
  ]);
  expect(f.enviarTexto).not.toHaveBeenCalled();
});
const u=(content:string)=>({role:"user" as const,content});
const a=(content:string)=>({role:"assistant" as const,content});
const abertura=[u("Olá!"),a("Como você se chama?"),u("Ana")];
const clique=(id:string)=>u(conteudoRecebidoMimo({ buttonOrListid:id },""));
it.each([
  { id: "mimo_revenda", atividade: "revender", ramo: "Qual é o seu ramo de atuação?", resposta: clique("mimo_emporio"), valor: "Empório" },
  { id: "mimo_quero_distribuir", atividade: "distribuir", ramo: "Qual é o ramo de atuação da sua distribuidora?", resposta: u("Alimentos"), valor: "Alimentos" },
])("avança da opção $id para estado e ramo", ({ id, atividade, ramo, resposta, valor }) => {
  const responder=(msgs:typeof abertura)=>respostaDeterministicaAgente(configInicialAgente,msgs,{});
  expect(responder(abertura)).toMatchObject({ resposta: PERGUNTA_ASSUNTO_AGENTE, dados:{nome:{valor:"Ana"}} });
  const escolha=[...abertura,a(PERGUNTA_ASSUNTO_AGENTE),clique(id)];
  const perguntaEstado=`Em qual estado você pretende ${atividade}?`;
  expect(responder(escolha)?.resposta).toBe(perguntaEstado);
  const estado=[...escolha,a(perguntaEstado),u("SP")];
  expect(responder(estado)?.resposta).toBe(ramo);
  // Distributors get a free-text question: resale niche buttons made them pick the wrong option.
  expect(opcoesPerguntaAgente(ramo)).toEqual(id === "mimo_revenda"
    ? ["Empório|mimo_emporio", "Mercado|mimo_mercado", "Padaria|mimo_padaria", "Farmácia|mimo_farmacia"]
    : undefined);
  expect(responder([...estado,a(ramo),resposta])).toMatchObject({
    encaminhar:true, motivo:"pre_qualificacao_pendente_revisao",
    dados:{nome:{valor:"Ana"},cidade_uf:{valor:"SP"},estabelecimento:{valor}},
  });
});
it("abre o menu quando o nome já foi verificado", () => {
  const dados = { nome: { valor: "Ana", evidencia: "Meu nome é Ana" } };
  expect(respostaDeterministicaAgente(configInicialAgente, [u("Oi")], dados)?.resposta)
    .toBe(PERGUNTA_ASSUNTO_AGENTE);
});
it("retoma a coleta quando a conversa usou o menu antigo e a pessoa digita a escolha", () => {
  const historico = [
    u("Oi"),
    a("Você quer saber mais sobre revenda, representação ou os produtos da MiMo?"),
    u("Quero revender"),
  ];
  expect(respostaDeterministicaAgente(configInicialAgente, historico, {})?.resposta)
    .toBe("Como você se chama?");
});
it.each([
  ["mimo_representacao",FORMULARIO_REPRESENTANTE_AGENTE],
  ["mimo_influencia",FORMULARIO_INFLUENCER_AGENTE],
])("envia direto o formulário oficial da opção %s", (id, formulario) => {
  expect(respostaDeterministicaAgente(configInicialAgente,[...abertura,a(PERGUNTA_ASSUNTO_AGENTE),clique(id)],{})?.resposta).toBe(formulario);
});
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
  expect(resultado.resposta).toMatch(/^Olá! /);
});

it.each([new SyntaxError("JSON inválido"), new Error("gateway_indisponivel")])(
  "continua a qualificação se a geração falhar: %s",
  async (erro) => {
    const dados = { nome: { valor: "Ana", evidencia: "Meu nome é Ana" } };
    f.ficha.mockResolvedValue(null);
    f.fila.mockImplementation(async acao => acao === "reservar"
      ? { ...tarefa, dados, mensagens: [{ role: "user", content: "Meu nome é Ana e quero revender." }] }
      : true);
    f.modelo.mockRejectedValue(erro);
    f.processar.mockImplementation(async (d) => {
      const resultado = await d.gerar();
      expect(resultado).toMatchObject({
        estado: "agente", encaminhar: false, motivo: "", dados,
        resposta: "Em qual estado você pretende revender?",
      });
      expect(await d.autorizar(resultado)).toBe(true);
    });
    await executarAgenteMimo();
    expect(f.fila).toHaveBeenCalledWith("autorizar", expect.objectContaining({
      resultado: expect.objectContaining({ estado: "agente", encaminhar: false }),
    }));
  },
);

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

it("o catálogo vigente mais recente é enviado sem depender da versão. A apresentação mantém o fluxo", async () => {
  const path = `${id}/${id}.pdf`;
  const antigo = "00000000-0000-4000-8000-0000000000aa";
  const pedido = {
    ...tarefa,
    config: { ...tarefa.config, materiais: [id] },
    materiais: [
      { id: antigo, empresa_id: id, path: `${id}/${antigo}.pdf`, mime: "application/pdf", tipo: "catalogo", created_at: "2026-01-01T00:00:00Z" },
      { id, empresa_id: id, path, mime: "application/pdf", tipo: "catalogo", created_at: "2026-11-27T00:00:00Z" },
    ],
    dados: {
      nome: { valor: "Ana", evidencia: "Sou Ana" },
      cidade_uf: { valor: "SP", evidencia: "Sou de SP" },
      estabelecimento: { valor: "empório", evidencia: "Tenho um empório" },
    },
    mensagens: [
      { role: "assistant", content: "Gostaria de dar uma olhada no catálogo?" },
      { role: "user", content: "Sim!" },
    ],
  };
  f.remetente.mockResolvedValue("token-sintetico");
  f.modelo.mockImplementation((config, mensagens, dados) => respostaDeterministicaAgente(config, mensagens, dados));
  f.fila.mockImplementation(async acao => acao === "reservar" ? pedido : true);
  f.link.mockResolvedValue({ data: { signedUrl: "https://example.test/catalogo" } });
  f.enviarMedia.mockResolvedValue({ id: "catalogo" });
  f.processar.mockImplementation(async d => {
    const resultado = await d.gerar();
    expect(resultado).toMatchObject({ estado: "agente", materialId: id, resposta: "Segue o catálogo de produtos MiMo." });
    expect(await d.remetente()).toBe(true);
    expect(await d.autorizar(resultado)).toBe(true);
    expect(await d.enviar(resultado.resposta)).toBe("catalogo");
  });
  await executarAgenteMimo();
  expect(f.link).toHaveBeenCalledWith(path, 600);
  expect(f.enviarMedia).toHaveBeenCalledWith("token-sintetico", expect.anything(), "https://example.test/catalogo",
    expect.objectContaining({ type: "document", docName: "Catálogo de produtos MiMo.pdf" }));
  expect(f.enviarTexto).not.toHaveBeenCalled();
  f.link.mockClear();
  f.enviarMedia.mockClear();

  const apresentacao = {
    ...pedido,
    materiais: [{ ...pedido.materiais[1], tipo: "apresentacao" }],
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
  f.fila.mockResolvedValue({
    ...tarefa,
    followup: true,
    followupEtapa: 2,
    catalogoApresentado: true,
    dados: { nome: { valor: "Érica Lima", evidencia: "Meu nome é Érica Lima" } },
  });
  f.processar.mockImplementation(async d => {
    const resultado = await d.gerar();
    expect(resultado.resposta).toMatch(/^Olá, Érica! .*revenda/i);
    expect(resultado.resposta).not.toMatch(/catálogo/i);
  });
  await executarAgenteMimo();
});

it.each([[1, "Olá, Raiane! Ficou alguma dúvida? É só responder por aqui que eu te ajudo."],
  [2, "Olá, Raiane! Se quiser continuar nossa conversa, estou por aqui para ajudar."]] as const)(
  "o lembrete %i de quem parou no menu de perfil não fala de revenda (caso real)", async (etapa, esperado) => {
  f.fila.mockResolvedValue({
    ...tarefa,
    followup: true,
    followupEtapa: etapa,
    mensagens: [
      { role: "user", content: "Olá! Posso ter mais informações sobre isso?" },
      { role: "assistant", content: "Como você se chama?" },
      { role: "user", content: "Raiane" },
      { role: "assistant", content: "O que melhor descreve você?" },
    ],
  });
  f.processar.mockImplementation(async d => {
    expect((await d.gerar()).resposta).toBe(esperado);
  });
  await executarAgenteMimo();
  expect(f.processar).toHaveBeenCalled();
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
  f.processar.mockImplementation(async d => {
    const r = await d.gerar();
    expect(r).toBeTruthy();
    expect(r.estado).not.toBe("pausada");
    expect(r.motivo).not.toBe("falta_interesse");
  });
  await executarAgenteMimo();
  expect(f.modelo).toHaveBeenCalledOnce();
});

it.each([false, true])("mantém visível um turno cujo ramo continua ambíguo (já esclarecido: %s)", async esclarecido => {
  const exemplo = "Que tipo de produto ou serviço você vende ou pretende vender?";
  const pergunta = "Qual é o seu ramo de atuação?";
  const dados = {
    nome: { valor: "Ana", evidencia: "Ana" },
    cidade_uf: { valor: "SC", evidencia: "SC" },
    revenda: { valor: "Revenda", evidencia: "Revenda" },
  };
  const mensagens = [
    { role: "assistant", content: pergunta }, { role: "user", content: "Ainda não sei muito" },
    ...(esclarecido ? [{ role: "assistant", content: exemplo }, { role: "user", content: "Ainda não sei" }] : []),
  ];
  f.ficha.mockResolvedValue(null);
  f.fila.mockImplementation(async acao => acao === "reservar" ? { ...tarefa, dados, mensagens } : true);
  f.modelo.mockResolvedValue({ resposta: pergunta, dados, estado: "agente", encaminhar: false, motivo: "", resumo: "" });
  const { processarRespostaAgente } = await vi.importActual<typeof import("./mimo-agente-processador.server")>("./mimo-agente-processador.server");
  f.processar.mockImplementation(d => processarRespostaAgente({ ...d, config: { ...d.config, digitando: false } }));
  f.remetente.mockResolvedValue("token-sintetico");
  f.enviarTexto.mockResolvedValue({ id: "mensagem-de-teste" });
  f.enviarBotoes.mockResolvedValue({ id: "mensagem-de-teste" });
  await executarAgenteMimo();
  if (esclarecido) {
    // Both clarifications were used: the sequence asks the branch again instead of a handoff (CEO, 28/11).
    expect(f.fila).toHaveBeenCalledWith("autorizar", expect.objectContaining({
      resultado: expect.objectContaining({ estado: "agente", encaminhar: false, motivo: "", resposta: pergunta }),
    }));
    expect(f.fila).not.toHaveBeenCalledWith("autorizar", expect.objectContaining({
      resultado: expect.objectContaining({ motivo: "resposta_requer_revisao" }),
    }));
    // The branch question goes with its option buttons.
    expect(f.enviarBotoes).toHaveBeenCalledOnce();
    expect(f.enviarTexto).not.toHaveBeenCalled();
    expect(f.fila).toHaveBeenCalledWith("enviada", expect.objectContaining({ messageId: "mensagem-de-teste" }));
  } else {
    expect(f.enviarTexto).toHaveBeenCalledWith("token-sintetico", tarefa.telefone, exemplo);
  }
  expect(f.fila).not.toHaveBeenCalledWith("cancelar", expect.anything());
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
it.each(["Não busca revenda, e sim patrocínio.", "Patrocínio para atleta"])(
  "encaminha pedido de patrocínio à equipe sem perguntar estado ou ramo: %s",
  (texto) => {
    const conversa = [...abertura, a("Você tem interesse em revender os produtos da MiMo?"), u(texto)];
    expect(respostaDeterministicaAgente(configInicialAgente, conversa, {})).toMatchObject({
      estado: "humano", encaminhar: true, motivo: "patrocinio",
    });
  },
);
it("os botões do menu descrevem o perfil e respondem com o texto que as regras já conhecem", () => {
  const rotulos = opcoesPerguntaAgente(PERGUNTA_ASSUNTO_AGENTE)!.map(o => o.split("|")[0]);
  expect(rotulos.every(r => r.length <= 20)).toBe(true);
  expect([
    "mimo_revenda", "mimo_quero_distribuir", "mimo_representacao", "mimo_influencia", "mimo_consumo",
  ].map(id => conteudoRecebidoMimo({ buttonOrListid: id }, ""))).toEqual([
    "Quero revender", "Quero distribuir", "Quero ser representante", "Quero parceria como influenciador", "Consumo próprio",
  ]);
});
