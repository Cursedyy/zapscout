import { beforeEach, expect, it, vi } from "vitest";
import { enviarTextoComercialMimo } from "./mimo-whatsapp-envio.server";

const api = vi.hoisted(() => ({ operar: vi.fn(), worker: vi.fn(), token: vi.fn(), enviar: vi.fn() }));
vi.mock("./mimo-agente-db.server", () => ({ operarConversaComercial: api.operar, workerAgente: api.worker }));
vi.mock("./mimo-whatsapp-remetente.server", () => ({ obterRemetenteAgente: api.token }));
vi.mock("./uazapi.server", () => ({ uazSendText: api.enviar }));

const tarefa = { id: "10000000-0000-4000-8000-000000000001", reserva: "10000000-0000-4000-8000-000000000002" };
const reserva = { ...tarefa, estado: "reservada", telefone: "5511999990001",
  vinculo: "10000000-0000-4000-8000-000000000003", numeroComercial: "5511888880001" };
const responder = () => enviarTextoComercialMimo("empresa", "vendedor", "lead", "Olá!", "solicitacao");

beforeEach(() => {
  vi.resetAllMocks();
  api.operar.mockResolvedValueOnce(reserva).mockResolvedValueOnce(true);
  api.token.mockResolvedValue("sintetico");
  api.worker.mockResolvedValue(true);
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
