// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { WhatsAppLeadMimo } from "./mimo-whatsapp-lead";

const api = vi.hoisted(() => ({ listar: vi.fn(), enviar: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/mimo-whatsapp.functions", () => ({
  mensagensLeadWhatsAppMimo: api.listar,
  enviarMensagemLeadMimo: api.enviar,
}));

function montar(client = new QueryClient()) {
  api.listar.mockResolvedValue({ mensagens: [], mais: false });
  render(<QueryClientProvider client={client}>
    <WhatsAppLeadMimo usuarioId="vendedor" leadId="lead" telefone="5511999990001" />
  </QueryClientProvider>);
  return client;
}

afterEach(() => { cleanup(); vi.resetAllMocks(); });

it("abre com o histórico antecipado e mantém as mensagens durante a troca de página", async () => {
  const cache = new QueryClient();
  const recente = { id: "recente", texto: "Mensagem recente em cache", direcao: "recebida",
    contato_em: "2026-11-23T15:00:00Z", message_id: "recente", vinculo_id: "linha" };
  const antiga = { ...recente, id: "antiga", texto: "Mensagem de um dia anterior", contato_em: "2026-11-20T14:00:00Z" };
  cache.setQueryData(["mimo-whatsapp-mensagens", "vendedor", "lead", 0], { mensagens: [recente], mais: true });
  montar(cache);
  expect(screen.getByText(recente.texto)).toBeTruthy();
  expect(api.listar).not.toHaveBeenCalled();
  let resolver!: (dados: { mensagens: (typeof antiga)[]; mais: boolean }) => void;
  api.listar.mockImplementationOnce(() => new Promise(resolve => { resolver = resolve; }));
  fireEvent.click(screen.getByRole("button", { name: "Mais antigas" }));
  expect(screen.getByText(recente.texto)).toBeTruthy();
  expect(screen.queryByRole("status", { name: "Carregando mensagens" })).toBeNull();
  await waitFor(() => expect(api.listar).toHaveBeenCalledWith(expect.objectContaining({ data: { leadId: "lead", pagina: 1 } })));
  await act(async () => resolver({ mensagens: [antiga], mais: false }));
  expect(await screen.findByText(antiga.texto)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Mais recentes" }));
  expect(await screen.findByText(recente.texto)).toBeTruthy();
  expect(api.listar).toHaveBeenCalledTimes(1);
  cache.clear();
});

it("envia pela ficha e lê a mensagem registrada na própria conversa", async () => {
  const client = montar();
  await screen.findByText("Nenhuma mensagem registrada nesta conversa.");
  api.listar.mockResolvedValue({ mensagens: [{
    id: "1", texto: "Olá, posso ajudar?", direcao: "enviada", contato_em: "2026-11-18T12:00:00Z",
    message_id: "aceite", vinculo_id: "linha",
  }], mais: false });
  api.enviar.mockResolvedValue({ estado: "enviada", identidade: { messageId: "aceite", vinculoId: "linha" } });
  const campo = screen.getByLabelText<HTMLTextAreaElement>("Sua mensagem");
  fireEvent.change(campo, { target: { value: "Olá, posso ajudar?" } });
  fireEvent.keyDown(campo, { key: "Enter" });

  expect(await screen.findByText("Mensagem enviada ao WhatsApp.")).toBeTruthy();
  expect(await screen.findByText("Olá, posso ajudar?")).toBeTruthy();
  expect(screen.getAllByText("Olá, posso ajudar?")).toHaveLength(1);
  expect(campo.value).toBe("");
  expect(api.enviar).toHaveBeenCalledWith({ data: { leadId: "lead", texto: "Olá, posso ajudar?", solicitacao: expect.any(String) } });
  expect(screen.queryByRole("link", { name: "Abrir WhatsApp" })).toBeNull();
  client.clear();
});

it("mantém a solicitação original quando o resultado da chamada é desconhecido", async () => {
  const client = montar();
  await screen.findByText("Nenhuma mensagem registrada nesta conversa.");
  api.enviar.mockRejectedValueOnce(new Error("rede")).mockResolvedValueOnce({ estado: "incerta" });
  fireEvent.change(screen.getByLabelText("Sua mensagem"), { target: { value: "Mensagem sintética" } });
  const botao = screen.getByRole("button", { name: "Enviar mensagem" });
  fireEvent.click(botao);
  await screen.findByText(/Não foi possível consultar o resultado/);
  fireEvent.click(screen.getByRole("button", { name: "Verificar envio" }));
  await screen.findByText(/ainda não confirmou/);
  expect(api.enviar.mock.calls[1]).toEqual(api.enviar.mock.calls[0]);
  client.clear();
});

it("envia o catálogo uma vez, guarda o texto digitado e verifica o mesmo envio após falha de rede", async () => {
  const client = montar();
  await screen.findByText("Nenhuma mensagem registrada nesta conversa.");
  const campo = screen.getByLabelText<HTMLTextAreaElement>("Sua mensagem");
  fireEvent.change(campo, { target: { value: "Rascunho em andamento" } });
  api.enviar.mockRejectedValueOnce(new Error("rede")).mockResolvedValueOnce({ estado: "enviada", identidade: { messageId: "pdf", vinculoId: "linha" } });
  const botao = screen.getByRole<HTMLButtonElement>("button", { name: "Enviar catálogo" });
  act(() => { fireEvent.click(botao); fireEvent.click(botao); });
  await screen.findByText(/Não foi possível consultar o resultado/);
  expect(api.enviar).toHaveBeenCalledExactlyOnceWith({ data: { leadId: "lead", tipo: "catalogo", solicitacao: expect.any(String) } });
  expect(botao.disabled).toBe(true);
  expect(campo.value).toBe("Rascunho em andamento");
  expect(screen.getByText("Catálogo MiMo (PDF)")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Verificar envio" }));
  await screen.findByText("Mensagem enviada ao WhatsApp.");
  expect(api.enviar.mock.calls[1]).toEqual(api.enviar.mock.calls[0]);
  client.clear();
});

it("mostra o balão imediatamente e envia mensagens consecutivas na ordem", async () => {
  const client = montar();
  await screen.findByText("Nenhuma mensagem registrada nesta conversa.");
  let liberar!: (r: { estado: string }) => void;
  api.enviar.mockImplementationOnce(() => new Promise(resolve => { liberar = resolve; }))
    .mockResolvedValue({ estado: "enviada" });
  const campo = screen.getByLabelText<HTMLTextAreaElement>("Sua mensagem");
  fireEvent.change(campo, { target: { value: "Primeira" } });
  expect(fireEvent.keyDown(campo, { key: "Enter", shiftKey: true })).toBe(true);
  expect(fireEvent.keyDown(campo, { key: "Enter", isComposing: true, keyCode: 229 })).toBe(true);
  expect(api.enviar).not.toHaveBeenCalled();
  fireEvent.keyDown(campo, { key: "Enter" });
  expect(campo.value).toBe("");
  expect(screen.getByText("Primeira")).toBeTruthy();
  expect(screen.getByText("Enviando…")).toBeTruthy();
  fireEvent.change(campo, { target: { value: "Segunda" } });
  fireEvent.keyDown(campo, { key: "Enter" });
  expect(screen.getByText("Segunda")).toBeTruthy();
  await waitFor(() => expect(api.enviar).toHaveBeenCalledTimes(1));
  await act(async () => liberar({ estado: "enviada" }));
  await waitFor(() => expect(api.enviar.mock.calls.map(([r]) => r.data.texto)).toEqual(["Primeira", "Segunda"]));
  client.clear();
});
