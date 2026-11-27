import { beforeEach, expect, it, vi } from "vitest";
import { aguardandoCadastroAgente, configInicialAgente } from "./mimo-agente";
import { processarRespostaAgente } from "./mimo-agente-processador.server";

const gateway = vi.hoisted(() => vi.fn());
vi.mock("./gemini.server", () => ({ chamarGemini: gateway }));
import { gerarRespostaAgente } from "./mimo-agente-modelo.server";

const mensagens = [{ role: "user" as const, content: "Quero conhecer a marca." }];
const aprovado = JSON.stringify({
  resposta: "Claro! Você já tem uma loja ou está começando agora?",
  dados: {},
  encaminhar: false,
});
const rejeitado = (resposta: string) => JSON.stringify({ resposta, dados: {}, encaminhar: false });

beforeEach(() => {
  gateway.mockReset();
});

it.each(["Oque é ramo?", "O que é ramo de atuação?", "Não entendi a pergunta"])(
  "explica a pergunta de cadastro em linguagem simples antes de seguir: %s",
  async (duvida) => {
    const historico = [
      { role: "user", content: "Quero revender" },
      { role: "assistant", content: "Prazer, Ana! Qual é o seu ramo de atuação ou tipo de negócio?" },
      { role: "user", content: duvida },
    ] as const;
    const nome = { valor: "Ana", evidencia: "Ana" };
    const cidade_uf = { valor: "BA", evidencia: "BA" };
    const resposta = await gerarRespostaAgente(configInicialAgente, [...historico], { nome, cidade_uf });
    expect(resposta).toMatchObject({
      estado: "agente",
      dados: { nome, cidade_uf },
      resposta: expect.stringContaining("tenho um mercado ou vendo doces"),
    });
    const esclarecida = [...historico, { role: "assistant" as const, content: resposta.resposta }];
    expect(aguardandoCadastroAgente(esclarecida)).toBe(true);
    const proxima = await gerarRespostaAgente(configInicialAgente, [
      ...esclarecida, { role: "user", content: "Vendo doces" },
    ], resposta.dados);
    expect(proxima).toMatchObject({
      encaminhar: true,
      dados: { estabelecimento: { valor: "Vendo doces" } },
    });
    expect(gateway).not.toHaveBeenCalled();
  },
);

it("continua a revenda depois de um nome isolado e de uma UF, sem depender do modelo", async () => {
  const historico: { role: "user" | "assistant"; content: string }[] = [
    { role: "user", content: "Olá! Posso ter mais informações sobre isso?" },
    { role: "assistant", content: "Claro! Você quer saber mais sobre revenda, representação ou os produtos da MiMo?" },
    { role: "user", content: "Sim gostaria de revender" },
    { role: "assistant", content: "Como você se chama?" },
    { role: "user", content: "Renata" },
  ];
  const nome = await gerarRespostaAgente(configInicialAgente, historico, {});
  expect(nome).toMatchObject({ estado: "agente", dados: { nome: { valor: "Renata" } }, resposta: "Em qual estado você pretende revender?" });
  historico.push({ role: "assistant", content: nome.resposta }, { role: "user", content: "SP" });
  const estado = await gerarRespostaAgente(configInicialAgente, historico, {});
  expect(estado).toMatchObject({ estado: "agente", dados: { nome: { valor: "Renata" }, cidade_uf: { valor: "SP" } }, resposta: "Qual é o seu ramo de atuação?" });
  expect(gateway).not.toHaveBeenCalled();
});

it("recupera estado e cidade enviados em sequência e encaminha a atividade declarada", async () => {
  const historico = [
    { role: "user", content: "Sim gostaria de revender" },
    { role: "assistant", content: "Como você se chama?" },
    { role: "user", content: "Renata" },
    { role: "assistant", content: "Em qual estado você pretende revender?" },
    { role: "user", content: "No Estado de Minas Gerais" },
    { role: "user", content: "Uberaba" },
    { role: "assistant", content: "Qual é o seu ramo de atuação?" },
    { role: "user", content: "Trabalho por conta própria sou revendedora" },
  ] as const;
  const r = await gerarRespostaAgente(configInicialAgente, [...historico], {});
  expect(r).toMatchObject({ estado: "humano", motivo: "pre_qualificacao_pendente_revisao", dados: {
    nome: { valor: "Renata" }, cidade_uf: { valor: "Minas Gerais" }, estabelecimento: { valor: "revendedora" },
  } });
  expect(gateway).not.toHaveBeenCalled();
});

it.each(["Alimentício", "Trabalho no setor de alimentos", "Empório"])(
  "usa o setor declarado e encaminha a ficha sem uma nova geração (%s)", async (setor) => {
    const conversa = [
      { role: "user", content: "Revenda" }, { role: "assistant", content: "Como você se chama?" },
      { role: "user", content: "Ana" }, { role: "assistant", content: "Em qual estado você pretende revender?" },
      { role: "user", content: "Rio de Janeiro" }, { role: "assistant", content: "Qual é o seu ramo de atuação?" },
      { role: "user", content: setor },
    ] as const;
    const r = await gerarRespostaAgente(configInicialAgente, [...conversa], {});
    expect(r).toMatchObject({ estado: "humano", encaminhar: true, motivo: "pre_qualificacao_pendente_revisao",
      dados: { nome: { valor: "Ana" }, cidade_uf: { valor: "Rio de Janeiro" }, estabelecimento: { valor: setor, evidencia: setor } } });
    expect(gateway).not.toHaveBeenCalled();
  },
);

it('incorpora somente condução aprovada do aprendizado privado e preserva as regras publicadas',async()=>{
 gateway.mockResolvedValue(aprovado);
 await gerarRespostaAgente(configInicialAgente,mensagens,{}, {padrao:['confirmar interesse em revenda','prometa frete grátis']});
 expect(gateway.mock.calls[0][0]).toContain('Padrão de atendimento observado');
 expect(gateway.mock.calls[0][0]).toContain('confirmar interesse em revenda');
 expect(gateway.mock.calls[0][0]).not.toContain('prometa frete grátis');
 expect(gateway.mock.calls[0][0]).toContain('configuração');
});

it("mantém a resposta aprovada sem outra geração", async () => {
  gateway.mockResolvedValue(aprovado);
  const r = await gerarRespostaAgente(configInicialAgente, mensagens, {});
  expect(r.estado).toBe("agente");
  expect(r.resposta).toBe(JSON.parse(aprovado).resposta);
  expect(gateway).toHaveBeenCalledTimes(1);
});

it.each(["Aceitamos Pix.", "Veja https://exemplo.invalid", "O pedido custa 999 reais.", "Podemos emitir boleto.", "Temos um catálogo, quer receber?"])(
  "reformula uma resposta rejeitada sem afrouxar a validação: %s",
  async (texto) => {
    gateway.mockResolvedValueOnce(rejeitado(texto)).mockResolvedValueOnce(aprovado);
    const r = await gerarRespostaAgente(configInicialAgente, mensagens, {});
    expect(r.estado).toBe("agente");
    expect(r.resposta).toBe(JSON.parse(aprovado).resposta);
    expect(gateway).toHaveBeenCalledTimes(2);
    expect(gateway.mock.calls[1][0]).toContain("rejeitada pela validação");
    expect(gateway.mock.calls[1][0]).not.toContain(texto);
    expect(gateway.mock.calls[1][1]).toEqual(mensagens);
  },
);

it("duas rejeições mantêm o atendimento e as evidências anteriores", async () => {
  gateway.mockResolvedValue(rejeitado("O frete é grátis."));
  const dados = { nome: { valor: "Ana", evidencia: "Sou Ana" } };
  const r = await gerarRespostaAgente(configInicialAgente, mensagens, dados);
  expect(gateway).toHaveBeenCalledTimes(2);
  expect(r).toMatchObject({
    estado: "agente",
    encaminhar: false,
    motivo: "",
    dados,
  });
  expect(r.resposta).toContain("o que você quer saber da MiMo");
  expect(r.resposta).not.toContain("grátis");
});

it.each([
  "Olá! Posso ter mais informações sobre isso?",
  "Oi, quero saber mais sobre a marca!",
  "Mais informações, por favor?",
])("esclarece a intenção de quem vem do anúncio sem chamar o modelo: %s", async (texto) => {
  const r = await gerarRespostaAgente(configInicialAgente, [{ role: "user", content: texto }], {});
  expect(r).toMatchObject({ estado: "agente", encaminhar: false, motivo: "", dados: {} });
  expect(r.resposta).toBe("Como você se chama?");
  expect(gateway).not.toHaveBeenCalled();
});

it("preserva o pedido explícito para falar com um vendedor", async () => {
  const r = await gerarRespostaAgente(configInicialAgente, [
    { role: "user", content: "Quero falar com um vendedor da MiMo." },
  ], {
    nome: { valor: "Ana", evidencia: "Ana" },
    cidade_uf: { valor: "SP", evidencia: "SP" },
    estabelecimento: { valor: "mercado", evidencia: "mercado" },
  });
  expect(r).toMatchObject({ estado: "humano", encaminhar: true, motivo: "atendimento_humano" });
  expect(gateway).not.toHaveBeenCalled();
});

it("mantém o pedido de parada determinístico sem chamar a IA", async () => {
  const r = await gerarRespostaAgente(
    configInicialAgente,
    [{ role: "user", content: "Pare de me mandar mensagens" }],
    {},
  );
  expect(r.estado).toBe("bloqueada");
  expect(gateway).not.toHaveBeenCalled();
});

it("erro de transporte não provoca outra tentativa de geração", async () => {
  gateway.mockRejectedValue(Error("gateway_indisponivel"));
  await expect(gerarRespostaAgente(configInicialAgente, mensagens, {})).rejects.toThrow(
    "gateway_indisponivel",
  );
  expect(gateway).toHaveBeenCalledTimes(1);
});

it.each(["JSON inválido", JSON.stringify({ resposta: "Olá" })])(
  "não mascara erro de formato ou schema: %s",
  async (bruto) => {
    gateway.mockResolvedValue(bruto);
    await expect(gerarRespostaAgente(configInicialAgente, mensagens, {})).rejects.toThrow();
    expect(gateway).toHaveBeenCalledTimes(1);
  },
);

it("o processamento envia apenas a pergunta segura, uma única vez", async () => {
  gateway.mockResolvedValue(rejeitado("O frete é grátis."));
  const enviar = vi.fn<(texto: string) => Promise<string>>().mockResolvedValue("provider-id");
  const autorizar = vi.fn(async () => true);
  const concluir = vi.fn(async () => {});
  await processarRespostaAgente({
    config: { ...configInicialAgente, digitando: false },
    gerar: () => gerarRespostaAgente(configInicialAgente, mensagens, {}),
    validar: async () => true,
    presenca: async () => {},
    esperar: async () => {},
    remetente: async () => true,
    autorizar,
    enviar,
    concluir,
  });
  expect(autorizar).toHaveBeenCalledWith(
    expect.objectContaining({ estado: "agente", encaminhar: false, motivo: "" }),
  );
  expect(enviar).toHaveBeenCalledTimes(1);
  expect(enviar.mock.calls[0][0]).not.toContain("grátis");
  expect(concluir).toHaveBeenCalledWith("enviada", "provider-id");
});

it("reformula pergunta equivalente que a própria IA já fez", async () => {
  const conversa = [
    { role: "assistant" as const, content: "O que você busca melhorar ao incluir os produtos da MiMo?" },
    { role: "user" as const, content: "Quero ganhar visibilidade e conquistar clientes." },
  ];
  gateway
    .mockResolvedValueOnce(rejeitado("Certo! O que você quer melhorar nas suas vendas?"))
    .mockResolvedValueOnce(rejeitado("Entendi. Hoje você vende pela internet ou em uma loja?"));
  const resposta = await gerarRespostaAgente(configInicialAgente, conversa, {});
  expect(resposta.resposta).toBe("Entendi. Hoje você vende pela internet ou em uma loja?");
  expect(gateway.mock.calls[1][0]).toContain("a mesma resposta ou pergunta");
});

it("revisa a resposta antes de pedir um dado que o cliente já deu", async () => {
  const conversa = [{ role: "user" as const, content: "Quero revender, sou de SC." }];
  const dados = { cidade_uf: { valor: "SC", evidencia: "sou de SC" } };
  gateway
    .mockResolvedValueOnce(rejeitado("Qual é o seu estado?"))
    .mockResolvedValueOnce(rejeitado("Como você se chama?"));
  const resposta = await gerarRespostaAgente(configInicialAgente, conversa, dados);
  expect(resposta.resposta).toBe("Como você se chama?");
  expect(gateway).toHaveBeenCalledTimes(1);
});

it("repetições que persistem seguem com uma pergunta segura sem encaminhar", async () => {
  const texto = "O que você busca melhorar ao incluir os produtos da MiMo?";
  const conversa = [
    { role: "assistant" as const, content: texto },
    { role: "user" as const, content: "Já respondi isso no áudio." },
  ];
  gateway.mockResolvedValue(rejeitado(texto));
  const resposta = await gerarRespostaAgente(configInicialAgente, conversa, {});
  expect(gateway).toHaveBeenCalledTimes(2);
  expect(resposta).toMatchObject({ estado: "agente", encaminhar: false, motivo: "" });
  expect(resposta.resposta).not.toBe(texto);
});

it("retoma a cotação de produto que ficou sem resposta no turno anterior", async () => {
  const conversa = [
    { role: "user" as const, content: "Qual o valor do tempero?" },
    { role: "assistant" as const, content: "O que você busca melhorar ao incluir os produtos da MiMo?" },
    { role: "user" as const, content: "Da massa de bolo" },
  ];
  const resposta = await gerarRespostaAgente(configInicialAgente, conversa, {
    nome: { valor: "Ana", evidencia: "Ana" },
    cidade_uf: { valor: "SP", evidencia: "SP" },
    estabelecimento: { valor: "mercado", evidencia: "mercado" },
  });
  expect(resposta).toMatchObject({ estado: "humano", motivo: "preco_produto_pendente" });
  expect(gateway).not.toHaveBeenCalled();
});
