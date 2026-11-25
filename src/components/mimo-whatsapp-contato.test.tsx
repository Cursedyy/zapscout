// @vitest-environment happy-dom
import type { ComponentProps } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { WhatsAppLeadMimo } from "./mimo-whatsapp-lead";
const api = vi.hoisted(() => ({ listar: vi.fn(), enviar: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/mimo-whatsapp.functions", () => ({
  mensagensLeadWhatsAppMimo: api.listar,
  enviarMensagemLeadMimo: api.enviar,
}));
const a = {
  empresaId: "empresa-A",
  usuarioId: "vendedor-A",
  leadId: "lead-A",
  telefone: "5511999990001",
  nomeContato: "Ana Silva",
  nomeEmpresa: "Empório A",
};
const b = {
  ...a,
  leadId: "lead-B",
  telefone: "5511999990002",
  nomeContato: "Bruno Souza",
  nomeEmpresa: "Mercado B",
};
const historico = (texto: string) => ({
  mensagens: [
    {
      id: texto,
      texto,
      direcao: "recebida",
      contato_em: "2026-11-24T12:00:00Z",
      message_id: texto,
      vinculo_id: "linha",
    },
  ],
  mais: false,
});
const clientes: QueryClient[] = [];
function montar(props = a) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clientes.push(client);
  const view = (p: ComponentProps<typeof WhatsAppLeadMimo>) => (
    <QueryClientProvider client={client}>
      <WhatsAppLeadMimo {...p} />
    </QueryClientProvider>
  );
  const r = render(view(props));
  return { trocar: (p: ComponentProps<typeof WhatsAppLeadMimo>) => r.rerender(view(p)), client };
}
const texto = () => screen.getByLabelText<HTMLTextAreaElement>("Sua mensagem");
beforeEach(() => api.listar.mockResolvedValue({ mensagens: [], mais: false }));
afterEach(() => {
  cleanup();
  clientes.splice(0).forEach((c) => c.clear());
  vi.resetAllMocks();
});
it("troca de contato descarta rascunho e personaliza nova prévia, sem envio", async () => {
  const { trocar } = montar();
  await screen.findByText("Nenhuma mensagem registrada nesta conversa.");
  fireEvent.click(screen.getByRole("button", { name: "Resposta rápida" }));
  expect(texto().value).toContain("Ana");
  expect(texto().value).toContain("Empório A");
  fireEvent.change(texto(), { target: { value: "Rascunho manual de Ana" } });
  trocar(b);
  expect(texto().value).toBe("");
  fireEvent.click(screen.getByRole("button", { name: "Resposta rápida" }));
  expect(texto().value).toContain("Bruno");
  expect(texto().value).toContain("Mercado B");
  expect(texto().value).not.toContain("Ana");
  trocar(a);
  expect(texto().value).toBe("");
  expect(api.enviar).not.toHaveBeenCalled();
});
it("resposta de histórico fora de ordem não entra na conversa nova", async () => {
  let resolverA!: (v: ReturnType<typeof historico>) => void;
  let resolverB!: (v: ReturnType<typeof historico>) => void;
  api.listar.mockImplementation(
    ({ data }: { data: { leadId: string } }) =>
      new Promise((resolve) => {
        if (data.leadId === a.leadId) resolverA = resolve;
        else resolverB = resolve;
      }),
  );
  const { trocar } = montar();
  await waitFor(() => expect(resolverA).toBeDefined());
  trocar(b);
  await waitFor(() => expect(resolverB).toBeDefined());
  await act(async () => resolverB(historico("Histórico de Bruno")));
  expect(await screen.findByText("Histórico de Bruno")).toBeTruthy();
  await act(async () => resolverA(historico("Histórico privado de Ana")));
  expect(screen.queryByText("Histórico privado de Ana")).toBeNull();
  expect(screen.getByText("Histórico de Bruno")).toBeTruthy();
});
it("retorno de envio antigo não altera o novo contato e cada envio conserva seu destino", async () => {
  let falharA!: (v: Error) => void;
  api.enviar
    .mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          falharA = reject;
        }),
    )
    .mockResolvedValue({ estado: "enviada" });
  const { trocar } = montar();
  await screen.findByText("Nenhuma mensagem registrada nesta conversa.");
  fireEvent.change(texto(), { target: { value: "Mensagem de Ana" } });
  fireEvent.click(screen.getByRole("button", { name: "Enviar mensagem" }));
  await waitFor(() => expect(falharA).toBeDefined());
  trocar(b);
  await screen.findByText("Nenhuma mensagem registrada nesta conversa.");
  expect(screen.queryByText("Mensagem de Ana")).toBeNull();
  fireEvent.change(texto(), { target: { value: "Mensagem de Bruno" } });
  fireEvent.click(screen.getByRole("button", { name: "Enviar mensagem" }));
  expect(await screen.findByText("Mensagem enviada ao WhatsApp.")).toBeTruthy();
  await act(async () => falharA(Error("erro do contato anterior")));
  expect(screen.queryByText(/Não foi possível consultar o resultado/)).toBeNull();
  expect(screen.getByText("Mensagem enviada ao WhatsApp.")).toBeTruthy();
  expect(api.enviar.mock.calls.map(([r]) => [r.data.leadId, r.data.texto])).toEqual([
    [a.leadId, "Mensagem de Ana"],
    [b.leadId, "Mensagem de Bruno"],
  ]);
});
it("isola empresa, usuário e telefone mesmo se o componente for reutilizado sem key", async () => {
  const { trocar, client } = montar();
  await screen.findByText("Nenhuma mensagem registrada nesta conversa.");
  client.setQueryData(
    ["mimo-whatsapp-mensagens", a.usuarioId, a.leadId, 0, a.empresaId],
    historico("Mensagem da empresa A"),
  );
  fireEvent.change(texto(), { target: { value: "Rascunho A" } });
  trocar({ ...a, empresaId: "empresa-B", nomeContato: "Beatriz", nomeEmpresa: "Empresa B" });
  expect(texto().value).toBe("");
  expect(screen.queryByText("Mensagem da empresa A")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Resposta rápida" }));
  expect(texto().value).toContain("Beatriz");
  expect(texto().value).toContain("Empresa B");
  trocar({ ...a, usuarioId: "outro-vendedor" });
  expect(texto().value).toBe("");
  fireEvent.change(texto(), { target: { value: "Rascunho com telefone antigo" } });
  trocar({ ...a, usuarioId: "outro-vendedor", telefone: "5511999990003" });
  expect(texto().value).toBe("");
  expect(api.enviar).not.toHaveBeenCalled();
});
it("explica fallback sem nome/empresa e preserva edição manual", async () => {
  const { trocar } = montar();
  trocar({ ...a, nomeContato: null, nomeEmpresa: null });
  fireEvent.click(screen.getByRole("button", { name: "Resposta rápida" }));
  expect(texto().value).toMatch(/^Olá! /);
  expect(screen.getByText(/Nome do contato não informado ou inválido/)).toBeTruthy();
  expect(screen.getByText(/Empresa não informada/)).toBeTruthy();
  fireEvent.change(texto(), { target: { value: "Texto próprio" } });
  fireEvent.click(screen.getByRole("button", { name: "Resposta rápida" }));
  expect(texto().value).toBe("Texto próprio");
  expect(api.enviar).not.toHaveBeenCalled();
});
