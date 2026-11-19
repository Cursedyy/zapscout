import { beforeEach, expect, it, vi } from "vitest";
import { configInicialAgente } from "./mimo-agente";
import { processarRespostaAgente } from "./mimo-agente-processador.server";

const gateway = vi.hoisted(() => vi.fn());
vi.mock("./ia.server", () => ({ chamarLovableAI: gateway }));
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

it("duas rejeições encaminham com evidências anteriores, sem revelar o texto bloqueado", async () => {
  gateway.mockResolvedValue(rejeitado("O frete é grátis."));
  const dados = { nome: { valor: "Ana", evidencia: "Sou Ana" } };
  const r = await gerarRespostaAgente(configInicialAgente, mensagens, dados);
  expect(gateway).toHaveBeenCalledTimes(2);
  expect(r).toMatchObject({
    estado: "humano",
    encaminhar: true,
    motivo: "resposta_nao_aprovada",
    dados,
  });
  expect(r.resposta).toContain("encaminhar");
  expect(r.resposta).not.toContain("grátis");
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

it("o processamento envia apenas o encaminhamento aprovado, uma única vez", async () => {
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
    expect.objectContaining({ estado: "humano", motivo: "resposta_nao_aprovada" }),
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
  expect(gateway.mock.calls[1][0]).toContain("já contém o dado");
});

it("repetições que persistem vão para revisão humana", async () => {
  const texto = "O que você busca melhorar ao incluir os produtos da MiMo?";
  const conversa = [
    { role: "assistant" as const, content: texto },
    { role: "user" as const, content: "Já respondi isso no áudio." },
  ];
  gateway.mockResolvedValue(rejeitado(texto));
  const resposta = await gerarRespostaAgente(configInicialAgente, conversa, {});
  expect(gateway).toHaveBeenCalledTimes(2);
  expect(resposta).toMatchObject({ estado: "humano", motivo: "resposta_nao_aprovada" });
});

it("retoma a cotação de produto que ficou sem resposta no turno anterior", async () => {
  const conversa = [
    { role: "user" as const, content: "Qual o valor do tempero?" },
    { role: "assistant" as const, content: "O que você busca melhorar ao incluir os produtos da MiMo?" },
    { role: "user" as const, content: "Da massa de bolo" },
  ];
  const resposta = await gerarRespostaAgente(configInicialAgente, conversa, {});
  expect(resposta).toMatchObject({ estado: "humano", motivo: "preco_produto_pendente" });
  expect(gateway).not.toHaveBeenCalled();
});
