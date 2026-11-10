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

it("mantém a resposta aprovada sem outra geração", async () => {
  gateway.mockResolvedValue(aprovado);
  const r = await gerarRespostaAgente(configInicialAgente, mensagens, {});
  expect(r.estado).toBe("agente");
  expect(r.resposta).toBe(JSON.parse(aprovado).resposta);
  expect(gateway).toHaveBeenCalledTimes(1);
});

it.each(["Aceitamos Pix.", "Veja https://exemplo.invalid", "O pedido custa 999 reais."])(
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
