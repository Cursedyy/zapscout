import { it, expect } from "vitest";
import {
  materialSolicitadoAgente,
  motivoObrigatorioAgente,
  configInicialAgente,
  finalizarResultadoAgente,
} from "./mimo-agente";
import { conteudoRecebidoMimo, referenciaAnuncioMimo } from "./mimo-whatsapp";
it("material só é selecionado por pedido explícito ou aceite de oferta contextual", () => {
  expect(materialSolicitadoAgente("Olá")).toBeNull();
  expect(materialSolicitadoAgente("Pode mandar o catálogo?")).toBe("catalogo");
  expect(materialSolicitadoAgente("sim")).toBeNull();
  expect(materialSolicitadoAgente("sim", "Posso enviar o catálogo?")).toBe("catalogo");
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
