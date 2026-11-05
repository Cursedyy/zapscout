// @vitest-environment happy-dom
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MimoCarrinhosPage } from "./mimo-carrinhos-page";
const api = vi.hoisted(() => ({
  listar: vi.fn(),
  sync: vi.fn(),
  conectar: vi.fn(),
  indicadores: vi.fn(),
  configurar: vi.fn(),
}));
vi.mock("@/lib/mimo-carrinhos-recuperacao.functions", () => ({
  obterIndicadoresRecuperacaoMimo: api.indicadores,
  configurarRecuperacaoMimo: api.configurar,
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (f: unknown) => f }));
vi.mock("@/lib/mimo-nuvemshop-oauth.functions", () => ({ conectarNuvemshopMimo: api.conectar }));
vi.mock("@/lib/mimo-carrinhos.functions", () => ({
  listarCarrinhosMimo: api.listar,
  sincronizarCarrinhosMimo: api.sync,
}));
const resposta = {
  disponivel: true,
  podeConectar: false,
  configurada: true,
  sincronizadoEm: null,
  total: 0,
  carrinhos: [],
};
beforeEach(() => {
  vi.resetAllMocks();
  api.listar.mockResolvedValue(resposta);
  api.indicadores.mockResolvedValue({
    ativa: false,
    inicioEm: null,
    pendentes: 0,
    enviadas: 0,
    compras: 0,
    valorCentavos: "0",
    bloqueadas: 0,
    incertas: 0,
  });
});
afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
});
function abrir() {
  render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
        })
      }
    >
      <MimoCarrinhosPage />
    </QueryClientProvider>,
  );
}
it("sem conexão deixa sincronização desabilitada e não inicia contatos", async () => {
  api.listar.mockResolvedValue({ ...resposta, configurada: false });
  abrir();
  expect(
    ((await screen.findByRole("button", { name: "Sincronizar loja" })) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  expect(screen.getByText(/Envios automáticos desativados/)).toBeTruthy();
  expect(api.sync).not.toHaveBeenCalled();
});
it("sincroniza somente após ação explícita e preserva feedback de falha", async () => {
  api.sync.mockRejectedValue(Error("Falha ao consultar a Nuvemshop."));
  abrir();
  const b = await screen.findByRole("button", { name: "Sincronizar loja" });
  expect(api.sync).not.toHaveBeenCalled();
  await userEvent.click(b);
  expect((await screen.findByRole("alert")).textContent).toContain("Falha ao consultar");
  expect(api.sync).toHaveBeenCalledTimes(1);
  expect(screen.queryByText(/Sincronização concluída/)).toBeNull();
});
it("mostra compra sem atribuir recuperação e sem link para retomar checkout", async () => {
  api.listar.mockResolvedValue({
    ...resposta,
    total: 1,
    carrinhos: [
      {
        id: "42",
        nome: "Cliente sintético",
        email: "teste@example.invalid",
        telefone: "",
        total: 12345,
        moeda: "BRL",
        itens: [],
        atualizadoEm: "2026-11-05T12:00:00Z",
        canais: "E-mail",
        situacao: "Compra identificada",
        url: null,
        pedido: { numero: "100", total: 12345, moeda: "BRL" },
      },
    ],
  });
  abrir();
  await screen.findByText("Compra identificada");
  expect(screen.getByText(/Lembretes de carrinho bloqueados/)).toBeTruthy();
  expect(screen.queryByRole("link", { name: "Abrir carrinho na loja" })).toBeNull();
  expect(screen.getByText(/Não há receita atribuída/)).toBeTruthy();
});
it("sucesso revalida a lista e não informa envio", async () => {
  api.sync.mockResolvedValue({ carrinhos: 0, pedidos: 0 });
  abrir();
  await userEvent.click(await screen.findByRole("button", { name: "Sincronizar loja" }));
  await screen.findByText("Sincronização concluída. Esta ação não dispara mensagens.");
  await waitFor(() => expect(api.listar.mock.calls.length).toBeGreaterThan(1));
});

it("não abre autorização sem aplicativo configurado e mostra falha ao iniciar", async () => {
  api.listar.mockResolvedValue({ ...resposta, configurada: false, podeConectar: true });
  api.conectar.mockRejectedValue(Error("Conexão ainda não disponível."));
  abrir();
  await userEvent.click(await screen.findByRole("button", { name: "Conectar Nuvemshop" }));
  expect((await screen.findByRole("alert")).textContent).toContain("Conexão ainda não disponível");
  expect(api.conectar).toHaveBeenCalledTimes(1);
});

it("mostra causa segura de loja divergente sem reproduzir texto arbitrário da URL", async () => {
  window.history.replaceState(null, "", "/mimo/automacoes?conexao=falha&motivo=loja_divergente");
  abrir();
  expect((await screen.findByRole("alert")).textContent).toContain("diferente da loja configurada");
  cleanup();
  window.history.replaceState(null, "", "/mimo/automacoes?conexao=falha&motivo=segredo-injetado");
  abrir();
  expect((await screen.findByRole("alert")).textContent).toContain("Inicie a conexão novamente");
  expect(screen.queryByText(/segredo-injetado/)).toBeNull();
});
