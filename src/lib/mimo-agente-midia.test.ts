import { it, expect } from "vitest";
import {
  materialSolicitadoAgente,
  motivoObrigatorioAgente,
  configInicialAgente,
  finalizarResultadoAgente,
  respostaDeterministicaAgente,
  type MensagemAgente,
} from "./mimo-agente";
import { conteudoRecebidoMimo, referenciaAnuncioMimo } from "./mimo-whatsapp";
it("material só é selecionado por pedido explícito ou aceite de oferta contextual", () => {
  expect(materialSolicitadoAgente("Olá")).toBeNull();
  expect(materialSolicitadoAgente("Pode mandar o catálogo?")).toBe("catalogo");
  expect(materialSolicitadoAgente("sim")).toBeNull();
  expect(materialSolicitadoAgente("sim", "Posso enviar o catálogo?")).toBe("catalogo");
  expect(materialSolicitadoAgente("Sim!", "Você gostaria de dar uma olhada no catálogo para conhecer nossa linha de produtos?")).toBe("catalogo");
  expect(materialSolicitadoAgente("Não quero ver o catálogo")).toBeNull();
  expect(materialSolicitadoAgente("Sim!", "Você conseguiu ver o catálogo?")).toBeNull();
});

const oferta: MensagemAgente = { role: "assistant", content: "Você gostaria de dar uma olhada no catálogo?" };
const aceite: MensagemAgente = { role: "user", content: "Sim!" };
const anunciou: MensagemAgente = { role: "assistant", content: "Perfeito! Segue o nosso catálogo para você conferir." };
const agradeceu: MensagemAgente = { role: "user", content: "Excelente" };

it("encaminha pedido ou aceite de catálogo e corrige oferta antiga sem anexar", () => {
  const pedido: MensagemAgente = { role: "user", content: "Pode enviar o catálogo?" };
  for (const mensagens of [[pedido], [oferta, aceite], [oferta, aceite, anunciou, agradeceu]]) {
    const resposta = respostaDeterministicaAgente(configInicialAgente, mensagens, {}, false, true);
    expect(resposta).toMatchObject({ estado: "humano", motivo: "catalogo_comercial" });
    expect(resposta?.materialSolicitado).toBeUndefined();
  }
  const outra = respostaDeterministicaAgente(configInicialAgente, [
    { role: "user", content: "Pode mandar a apresentação?" },
  ], {});
  expect(outra).toMatchObject({ estado: "agente", materialSolicitado: "apresentacao" });
});

it("rejeita anunciar o catálogo sem um anexo autorizado e prioriza parar", () => {
  expect(() => finalizarResultadoAgente(configInicialAgente, [{ role: "user", content: "Boa tarde" }],
    {}, { resposta: anunciou.content, dados: {}, encaminhar: false })).toThrow("agente_resposta_nao_aprovada");
  const resposta = respostaDeterministicaAgente(configInicialAgente,
    [oferta, aceite, { role: "user", content: "Pare de me enviar mensagens" }], {}, false, true);
  expect(resposta?.estado).toBe("bloqueada");
  expect(resposta?.materialSolicitado).toBeUndefined();
});

it("usa o aceite de revenda do histórico para não repetir a pergunta", () => {
  const resposta = finalizarResultadoAgente(configInicialAgente, [
    { role: "assistant", content: "Você tem interesse em revender os produtos da MiMo?" },
    aceite, anunciou, agradeceu,
  ], {}, { resposta: "Você tem interesse em revender os produtos da MiMo?", dados: {}, encaminhar: false },
  new Date(), true, true);
  expect(resposta.dados.revenda).toEqual({ valor: "Sim!", evidencia: "Sim!" });
  expect(resposta.resposta).toBe("Como você se chama?");
  expect(resposta.resumo).toContain("Assunto: revenda");
});
it("mídia recebida não publica nem interpreta URLs", () => {
  expect(
    conteudoRecebidoMimo(
      { type: "audio", content: "https://media.invalid/audio" },
      "https://media.invalid/audio",
    ),
  ).toBe("[audio]");
  expect(
    conteudoRecebidoMimo(
      { message: { documentMessage: { url: "https://media.invalid/file" } } },
      "url",
    ),
  ).toBe("[anexo indisponivel]");
  expect(motivoObrigatorioAgente("[audio]")).toBe("audio_indisponivel");
});
it("registra fotos e suas legendas em ambos os formatos do webhook", () => {
  expect(conteudoRecebidoMimo({ messageType: "ImageMessage", content: { Caption: "Qual é este produto?", URL: "https://media.invalid/foto" } }, "fallback"))
    .toBe("[imagem] Qual é este produto?");
  expect(conteudoRecebidoMimo({ message: { imageMessage: { caption: "Atendente" } } }, "[imagem] Atendente"))
    .toBe("[imagem] Atendente");
  expect(conteudoRecebidoMimo({ mediaType: "image", content: "https://media.invalid/foto" }, "[mensagem]"))
    .toBe("[imagem]");
  expect(conteudoRecebidoMimo({ messageType: "DocumentMessage", mimetype: "image/png" }, "[mensagem]"))
    .toBe("[anexo indisponivel]");
  expect(motivoObrigatorioAgente("[imagem] Atendente")).toBe("atendimento_humano");
});
it("preserva somente referência recebida de domínio de anúncio reconhecido", () => {
  expect(referenciaAnuncioMimo({ text: "vim do anúncio" })).toBeNull();
  expect(
    referenciaAnuncioMimo({
      referral: { source_id: "123", source_url: "https://facebook.com/anuncio/123" },
    }),
  ).toEqual({ id: "123", url: "https://facebook.com/anuncio/123", fonte: "metadado_whatsapp" });
  expect(
    referenciaAnuncioMimo({
      referral: { source_id: "123", source_url: "https://facebook.com.evil.invalid/x" },
    }),
  ).toBeNull();
});
it("não completa cidade/UF ou cargo com inferência", () => {
  const r = finalizarResultadoAgente(
    configInicialAgente,
    [{ role: "user", content: "Tenho um empório em Porto Alegre" }],
    {},
    {
      resposta: "Qual o nome do empório?",
      encaminhar: false,
      dados: {
        cidade_uf: { valor: "Porto Alegre/RS", evidencia: "em Porto Alegre" },
        compras: { valor: "proprietário", evidencia: "Tenho um empório" },
      },
    },
  );
  expect(r.dados).toEqual({});
});
it("pedido de humano em mensagem fragmentada não é perdido", () => {
  const r = finalizarResultadoAgente(
    configInicialAgente,
    [
      { role: "user", content: "Quero falar com uma pessoa" },
      { role: "user", content: "sobre revenda" },
    ],
    {},
    { resposta: "Qual sua cidade?", encaminhar: false, dados: {} },
  );
  expect(r.estado).toBe("humano");
});
it("pergunta sobre automação recebe transparência sem falso pedido de humano", () =>
  expect(motivoObrigatorioAgente("Você é uma pessoa ou um robô?")).toBeNull());
