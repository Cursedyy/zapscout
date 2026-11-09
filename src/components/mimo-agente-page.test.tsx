// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { configInicialAgente } from "@/lib/mimo-agente";
const api = vi.hoisted(() => ({
  painel: vi.fn(),
  alterar: vi.fn(),
  simular: vi.fn(),
  responder: vi.fn(),
  material: vi.fn(),
  desativar: vi.fn(),
}));
vi.mock("@/lib/mimo-agente.functions", () => ({
  painelAgenteMimo: api.painel,
  alterarAgenteMimo: api.alterar,
  simularAgenteMimo: api.simular,
  responderAgenteMimo: api.responder,
  enviarMaterialAgenteMimo: api.material,
  desativarMaterialAgenteMimo: api.desativar,
}));
import { MimoAgentePage } from "./mimo-agente-page";
let client: QueryClient;
const config = {
  revisao: 1,
  rascunho: configInicialAgente,
  modo: "desativado",
  publicada: null,
  testada: null,
};
const conversa = {
  id: "10000000-0000-4000-8000-000000000001",
  telefone: "5511999999999",
  lead_id: "20000000-0000-4000-8000-000000000001",
  nome_empresa: "Empório sintético",
  responsavel_id: null,
  estado: "humano",
  motivo: "atendimento_humano",
  resumo: "Coleta incompleta.",
  dados: {},
  piloto: false,
  revisao_humana: "pendente",
  fila: [],
  mensagens: [
    { direcao: "recebida", texto: "Quero falar com a equipe", contato_em: "2026-11-06T12:00:00Z" },
  ],
};
beforeEach(() => {
  vi.resetAllMocks();
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  api.painel.mockResolvedValue({
    painel: { gestor: true, config, versoes: [], historico: [], conversas: [], materiais: [] },
    vinculos: [],
  });
  api.alterar.mockResolvedValue({ ok: true });
});
afterEach(() => {
  cleanup();
  client.clear();
});
const abrir = () =>
  render(
    <QueryClientProvider client={client}>
      <MimoAgentePage />
    </QueryClientProvider>,
  );
it("começa desativado, sem publicar ou enviar ao abrir", async () => {
  abrir();
  await screen.findByRole("heading", { name: "Agente de atendimento" });
  expect(screen.getByText(/desativado · versão/)).toBeTruthy();
  expect(
    (screen.getByRole("button", { name: "Publicar versão" }) as HTMLButtonElement).disabled,
  ).toBe(true);
  expect(api.alterar).not.toHaveBeenCalled();
  expect(api.responder).not.toHaveBeenCalled();
});
it("vendedor recebe apenas operação, sem controles de configuração", async () => {
  api.painel.mockResolvedValue({
    painel: { gestor: false, config: null, versoes: [], historico: [], conversas: [conversa] },
    vinculos: [],
  });
  abrir();
  await screen.findByText("Empório sintético");
  expect(screen.queryByRole("tab", { name: "Conhecimento" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Publicar versão" })).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "Assumir conversa" }));
  expect(api.alterar.mock.calls[0][0]).toEqual({
    data: expect.objectContaining({ acao: "assumir", conversa: conversa.id }),
  });
});
it("resposta manual exige uma ação explícita e usa chave idempotente", async () => {
  api.painel.mockResolvedValue({
    painel: { gestor: false, config: null, versoes: [], historico: [], conversas: [conversa] },
    vinculos: [],
  });
  api.responder.mockResolvedValue({ estado: "enviada" });
  abrir();
  const input = await screen.findByRole("textbox", { name: "Resposta manual" });
  await userEvent.type(input, "Olá, sou da equipe.");
  expect(api.responder).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: "Assumir e enviar resposta" }));
  expect(api.responder.mock.calls[0][0]).toEqual({
    data: {
      conversa: conversa.id,
      texto: "Olá, sou da equipe.",
      solicitacao: expect.stringMatching(/^[a-f0-9-]{36}$/),
    },
  });
});
it("simulador é separado dos envios", async () => {
  api.simular.mockResolvedValue({
    resposta: "Qual o nome do empório?",
    dados: {},
    resumo: "Coleta incompleta.",
    estado: "agente",
    motivo: "",
  });
  abrir();
  await screen.findByRole("heading", { name: "Agente de atendimento" });
  await userEvent.click(screen.getByRole("tab", { name: /Simulador e publicação/ }));
  await userEvent.type(
    screen.getByRole("textbox", { name: "Mensagem de teste" }),
    "Tenho um empório",
  );
  await userEvent.click(screen.getByRole("button", { name: "Simular" }));
  await screen.findByText(/Qual o nome do empório/);
  expect(api.responder).not.toHaveBeenCalled();
  expect(api.alterar).not.toHaveBeenCalled();
});
