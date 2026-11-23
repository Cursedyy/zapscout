import { beforeEach, expect, it, vi } from "vitest";
import { enviarMensagemComercialMimo } from "./mimo-whatsapp-envio.server";
import { CATALOGO_CHAT_MIMO, conteudoRecebidoMimo } from "./mimo-whatsapp";

const api = vi.hoisted(() => ({
  operar: vi.fn(), worker: vi.fn(), token: vi.fn(), enviar: vi.fn(), enviarPdf: vi.fn(),
  catalogo: vi.fn(), assinar: vi.fn(), linhaPessoal: vi.fn(),
}));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { storage: { from: () => ({ createSignedUrl: api.assinar }) } },
}));
vi.mock("./mimo-agente-db.server", () => ({
  operarConversaComercial: api.operar, workerAgente: api.worker,
  catalogoChatMimo: api.catalogo, suportaConversaPessoal: api.linhaPessoal,
}));
vi.mock("./mimo-whatsapp-remetente.server", () => ({ obterRemetenteAgente: api.token }));
vi.mock("./uazapi.server", () => ({ uazSendText: api.enviar, uazSendMedia: api.enviarPdf }));

const tarefa = { id: "10000000-0000-4000-8000-000000000001", reserva: "10000000-0000-4000-8000-000000000002" };
const reserva = { ...tarefa, estado: "reservada", telefone: "5511999990001",
  vinculo: "10000000-0000-4000-8000-000000000003", numeroComercial: "5511888880001" };
const responder = () => enviarMensagemComercialMimo("empresa", "vendedor", "lead", { texto: "Olá!" }, "solicitacao");
const enviarCatalogo = () => enviarMensagemComercialMimo("empresa", "vendedor", "lead", { tipo: "catalogo" }, "solicitacao", true);

beforeEach(() => {
  vi.resetAllMocks();
  api.operar.mockResolvedValueOnce(reserva).mockResolvedValueOnce(true);
  api.token.mockResolvedValue("sintetico");
  api.worker.mockResolvedValue(true);
  api.linhaPessoal.mockResolvedValue(true);
  api.catalogo.mockResolvedValue("empresa/arquivo.pdf");
  api.assinar.mockResolvedValue({ data: { signedUrl: "https://storage.example.invalid/pdf" }, error: null });
});

it("envia o PDF publicado pela linha do vendedor e registra o título no histórico", async () => {
  api.enviarPdf.mockResolvedValue({ id: "5511888880001:pdf-aceito" });
  expect(await enviarCatalogo()).toEqual({ estado: "enviada", identidade: { messageId: "pdf-aceito", vinculoId: reserva.vinculo } });
  expect(api.assinar).toHaveBeenCalledExactlyOnceWith("empresa/arquivo.pdf", 90, { download: "Catalogo-MiMo.pdf" });
  expect(api.operar.mock.calls[0]).toEqual(["empresa", "vendedor", "lead", "reservar", { texto: CATALOGO_CHAT_MIMO, solicitacao: "solicitacao" }]);
  expect(api.token).toHaveBeenCalledExactlyOnceWith("empresa", reserva.vinculo, "vendedor");
  expect(api.enviarPdf).toHaveBeenCalledExactlyOnceWith("sintetico", reserva.telefone, "https://storage.example.invalid/pdf", { type: "document", caption: CATALOGO_CHAT_MIMO });
  expect(api.enviar).not.toHaveBeenCalled();
  expect(api.worker).toHaveBeenCalledExactlyOnceWith("enviada", { ...tarefa, messageId: "pdf-aceito" });
});

it("preserva o atendimento quando falta catálogo e cancela quando ele deixa de estar publicado", async () => {
  api.catalogo.mockResolvedValueOnce(null);
  expect(await enviarCatalogo()).toEqual({ estado: "catalogo_indisponivel" });
  expect(api.operar).not.toHaveBeenCalled();
  expect(api.assinar).not.toHaveBeenCalled();
  api.catalogo.mockResolvedValueOnce("empresa/arquivo.pdf").mockResolvedValueOnce(null);
  expect(await enviarCatalogo()).toEqual({ estado: "catalogo_indisponivel" });
  expect(api.operar).toHaveBeenCalledTimes(1);
  expect(api.worker).toHaveBeenCalledExactlyOnceWith("cancelar", tarefa);
  expect(api.enviarPdf).not.toHaveBeenCalled();
});

it("reconhece a legenda do PDF no eco da API sem interpretar anexos recebidos", () => {
  const evento = { fromMe: true, wasSentByApi: true, messageType: "DocumentMessage", text: CATALOGO_CHAT_MIMO };
  expect(conteudoRecebidoMimo(evento, "")).toBe(CATALOGO_CHAT_MIMO);
  expect(conteudoRecebidoMimo({ ...evento, fromMe: false }, CATALOGO_CHAT_MIMO)).toBe("[anexo indisponivel]");
});

it("envia ao destinatário da reserva e grava o mesmo identificador usado pelo webhook", async () => {
  api.enviar.mockResolvedValueOnce({ id: "5511888880001:aceite-1" });
  expect(await responder()).toEqual({ estado: "enviada", identidade: { messageId: "aceite-1", vinculoId: reserva.vinculo } });
  expect(api.enviar).toHaveBeenCalledExactlyOnceWith("sintetico", reserva.telefone, "Olá!");
  expect(api.worker).toHaveBeenCalledExactlyOnceWith("enviada", { ...tarefa, messageId: "aceite-1" });
});

it("preserva o estado incerto após timeout e deduplica novas chamadas com a mesma solicitação", async () => {
  api.operar.mockResolvedValueOnce({ estado: "incerta" });
  api.enviar.mockRejectedValueOnce(new Error("timeout"));
  expect(await responder()).toEqual({ estado: "incerta" });
  expect(await responder()).toEqual({ estado: "incerta" });
  expect(api.enviar).toHaveBeenCalledTimes(1);
  expect(api.worker).toHaveBeenCalledExactlyOnceWith("incerta", tarefa);
});

it("encerra a tentativa antes de enviar quando a conexão comercial está indisponível", async () => {
  api.token.mockResolvedValueOnce(null);
  expect(await responder()).toEqual({ estado: "linha_indisponivel" });
  expect(api.enviar).not.toHaveBeenCalled();
  expect(api.worker).toHaveBeenCalledExactlyOnceWith("falha", tarefa);
});
