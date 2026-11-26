// @vitest-environment happy-dom
import type { AnchorHTMLAttributes, PropsWithChildren } from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MimoPainelPedidos } from "./mimo-painel-pedidos";
import { novoPedido } from "@/lib/mimo-pedido";
const f = vi.hoisted(() => ({
  listar: vi.fn(),
  contexto: vi.fn(),
  alterar: vi.fn(),
  referenciasOmie: vi.fn(),
  testarOmie: vi.fn(),
  produtosEnvioOmie: vi.fn(),
  clienteEnvioOmie: vi.fn(),
  enviarOmie: vi.fn(),
  faturamentoOmie: vi.fn(),
  operarFiscal: vi.fn(),
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/mimo-omie-faturamento.functions", () => ({
  listarReferenciasFaturamentoOmieMimo: f.referenciasOmie,
  testarFaturamentoOmieMimo: f.testarOmie,
}));
vi.mock("@/lib/mimo-omie-envio.functions", () => ({
  consultarProdutosPedidoEnvioOmieMimo: f.produtosEnvioOmie,
  consultarClientePedidoEnvioOmieMimo: f.clienteEnvioOmie,
  enviarPedidoParaConferenciaOmieMimo: f.enviarOmie,
}));
vi.mock("@/lib/mimo-omie-producao.functions", () => ({
  consultarFaturamentoOmieMimo: f.faturamentoOmie,
  operarFaturamentoOmieMimo: f.operarFiscal,
}));
vi.mock("@/lib/mimo-pedido.functions", () => ({
  listarPedidosMimo: f.listar,
  alterarStatusPedidoMimo: f.alterar,
  carregarTiraMimo: f.contexto,
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    search: _search,
    children,
    ...props
  }: PropsWithChildren<
    AnchorHTMLAttributes<HTMLAnchorElement> & { to: string; search?: unknown }
  >) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));
const empresa = "10000000-0000-4000-8000-000000000001";
const usuario = "20000000-0000-4000-8000-000000000001";
const pedido = {
  id: "pedido-1",
  numero: 42,
  empresa_id: empresa,
  versao: 1,
  status: "rascunho",
  total: 12345,
  created_at: "2026-11-01T12:00:00Z",
  updated_at: "2026-11-24T12:00:00Z",
  documento: { ...novoPedido(), cliente: "Cliente sintético", responsavelId: usuario },
  pix: null,
};
const resposta = {
  disponivel: true,
  itens: [pedido],
  total: 21,
  contextoPedidos: {
    "pedido-1": { origemLead: "whatsapp", responsavelNome: "Responsável sintético" },
  },
};
beforeEach(() => {
  f.contexto.mockResolvedValue({
    disponivel: true,
    empresaId: empresa,
    usuarioId: usuario,
    papel: "vendedor",
  });
  f.listar.mockResolvedValue(resposta);
  f.faturamentoOmie.mockResolvedValue({ estado: "desativado" });
});
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
function montar() {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MimoPainelPedidos />
    </QueryClientProvider>,
  );
  return userEvent.setup();
}
it("apresenta os dados canônicos e mantém vendedor sem ação de faturar", async () => {
  montar();
  expect(await screen.findByText("Cliente sintético")).toBeTruthy();
  expect(screen.getByRole("link", { name: "Abrir pedido 42" }).getAttribute("href")).toBe(
    "/mimo/tira-pedido",
  );
  expect(screen.getByText("R$ 123,45")).toBeTruthy();
  expect(screen.getByText("01/11/2026")).toBeTruthy();
  expect(screen.getByText("24/11/2026")).toBeTruthy();
  expect(screen.getByText("WhatsApp")).toBeTruthy();
  expect(screen.getByText("Responsável sintético")).toBeTruthy();
  expect(within(screen.getByRole("table")).getByText("Rascunho")).toBeTruthy();
  expect(screen.queryByRole("button", { name: /Faturar pedido/ })).toBeNull();
  expect(screen.getByText(/Página 1 de 3/)).toBeTruthy();
});
it("combina filtros no servidor, reinicia a paginação e permite limpar", async () => {
  const user = montar();
  await screen.findByText("Cliente sintético");
  await user.click(screen.getByRole("button", { name: "Próxima" }));
  await waitFor(() =>
    expect(f.listar).toHaveBeenLastCalledWith({
      data: expect.objectContaining({ pagina: 2, incluirContexto: true }),
    }),
  );
  await user.type(screen.getByLabelText("Cliente ou número"), "42");
  await user.selectOptions(screen.getByLabelText("Status"), "entregue");
  fireEvent.change(screen.getByLabelText("Criados de"), { target: { value: "2026-11-01" } });
  fireEvent.change(screen.getByLabelText("Criados até"), { target: { value: "2026-11-24" } });
  f.listar.mockResolvedValue({ ...resposta, total: 1 });
  await user.click(screen.getByRole("button", { name: "Aplicar filtros" }));
  await waitFor(() =>
    expect(f.listar).toHaveBeenLastCalledWith({
      data: expect.objectContaining({
        pagina: 1,
        busca: "42",
        status: "entregue",
        inicio: "2026-11-01",
        fim: "2026-11-24",
      }),
    }),
  );
  await user.click(screen.getByRole("button", { name: "Limpar filtros" }));
  await waitFor(() =>
    expect(f.listar).toHaveBeenLastCalledWith({
      data: expect.objectContaining({
        pagina: 1,
        busca: "",
        status: null,
        inicio: null,
        fim: null,
      }),
    }),
  );
});
it("não envia intervalo invertido e recupera a última página após recarga", async () => {
  const user = montar();
  await screen.findByText("Cliente sintético");
  fireEvent.change(screen.getByLabelText("Criados de"), { target: { value: "2026-12-01" } });
  fireEvent.change(screen.getByLabelText("Criados até"), { target: { value: "2026-11-01" } });
  await user.click(screen.getByRole("button", { name: "Aplicar filtros" }));
  expect(screen.getByRole("alert").textContent).toContain("data inicial");
  expect(f.listar).toHaveBeenCalledTimes(1);
  await user.click(screen.getByRole("button", { name: "Próxima" }));
  await screen.findByText(/Página 2 de 3/);
  f.listar.mockResolvedValue({ ...resposta, total: 1 });
  await user.click(screen.getByRole("button", { name: "Atualizar pedidos" }));
  await waitFor(() =>
    expect(f.listar).toHaveBeenLastCalledWith({ data: expect.objectContaining({ pagina: 1 }) }),
  );
  expect(await screen.findByText(/Página 1 de 1/)).toBeTruthy();
});
it("mostra carregamento, falha recuperável e vazio", async () => {
  f.listar
    .mockRejectedValueOnce(Error("rede"))
    .mockResolvedValue({ ...resposta, itens: [], total: 0 });
  const user = montar();
  expect(screen.getByText("Carregando pedidos…")).toBeTruthy();
  expect(await screen.findByRole("alert")).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Tentar novamente" }));
  expect(await screen.findByText("Nenhum pedido encontrado.")).toBeTruthy();
});
it("não consulta pedidos se a autorização do contexto falhar", async () => {
  f.contexto.mockRejectedValue(Error("Acesso negado"));
  montar();
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(f.listar).not.toHaveBeenCalled();
});

it("usa o pedido de referência escolhido no Omie de teste, sem digitar códigos fiscais", async () => {
  f.contexto.mockResolvedValue({
    empresaId: empresa,
    usuarioId: usuario,
    papel: "administrador",
    disponivel: true,
  });
  f.listar.mockResolvedValue({
    ...resposta,
    itens: [
      {
        ...pedido,
        status: "confirmado",
        documento: { ...pedido.documento, itens: [{ id: "item-demo", brinde: false }] },
      },
    ],
  });
  f.referenciasOmie.mockResolvedValue([
    {
      id: 789,
      numero: "3",
      produtos: [
        { codigo: 55, nome: "Produto de demonstração" },
        { codigo: 56, nome: "Segundo produto" },
      ],
    },
  ]);
  f.testarOmie.mockResolvedValue({ codigo: 123, estado: "solicitado" });
  const user = montar();
  await user.click(await screen.findByRole("button", { name: "Testar no Omie" }));
  await user.selectOptions(
    await screen.findByLabelText("Pedido de referência do Omie de teste"),
    "789",
  );
  await user.selectOptions(screen.getByLabelText("Produto de referência"), "56");
  await user.click(screen.getByRole("checkbox", { name: /Confirmei/ }));
  await user.click(screen.getByRole("button", { name: "Criar e faturar no Omie de teste" }));
  expect(await screen.findByText(/Código interno 123/)).toBeTruthy();
  expect(f.testarOmie).toHaveBeenCalledWith({
    data: expect.objectContaining({ referencia: 789, produtoReferencia: 56, confirmarTeste: true }),
  });
  expect(f.alterar).not.toHaveBeenCalled();
});

it("preenche os produtos para o administrativo enviar ao Omie sem digitar os códigos", async () => {
  f.contexto.mockResolvedValue({
    empresaId: empresa,
    usuarioId: usuario,
    papel: "administrativo",
    disponivel: true,
  });
  f.listar.mockResolvedValue({ ...resposta, itens: [{ ...pedido, status: "confirmado" }] });
  const versaoProdutos = "f".repeat(64);
  f.produtosEnvioOmie.mockResolvedValue({
    versaoProdutos,
    envioAtivo: true,
    itens: [
      {
        id: "a",
        codigo: "SKU1",
        nome: "Produto A",
        quantidade: 2,
        unidade: "Unidade",
        produto: { id: 123, codigo: "SKU1", nome: "Produto A no Omie", unidade: "UN" },
      },
      {
        id: "b",
        codigo: "SKU2",
        nome: "Produto B",
        quantidade: 3,
        unidade: "Unidade",
        produto: { id: 456, codigo: "SKU2", nome: "Produto B no Omie", unidade: "UN" },
      },
    ],
  });
  f.clienteEnvioOmie.mockResolvedValue({ id: 98, nome: "Cliente de teste no Omie" });
  f.enviarOmie.mockResolvedValue({ codigo: 314, numero: "221" });
  const user = montar();
  await user.click(await screen.findByRole("button", { name: "Enviar ao Omie" }));
  const dialog = within(await screen.findByRole("dialog", { name: "Enviar pedido #42 ao Omie" }));
  expect(await dialog.findByText(/SKU1 · Produto A no Omie/)).toBeTruthy();
  expect(dialog.getByText(/SKU2 · Produto B no Omie/)).toBeTruthy();
  await user.type(dialog.getByLabelText(/CPF ou CNPJ/), "12345678000100");
  await user.click(dialog.getByRole("button", { name: "Consultar cliente" }));
  await user.type(await dialog.findByLabelText("Código da categoria"), "1.01");
  await user.type(dialog.getByLabelText("Código da conta corrente"), "20");
  await user.type(dialog.getByLabelText("Código da condição de pagamento"), "001");
  await user.selectOptions(dialog.getByLabelText("Modalidade de frete"), "9");
  await user.selectOptions(dialog.getByLabelText("Consumidor final"), "N");
  await user.click(dialog.getByRole("checkbox", { name: /Conferi o cliente/ }));
  await user.click(dialog.getByRole("button", { name: "Enviar pedido para conferência" }));
  expect(await dialog.findByText(/Pedido 221 localizado no Omie/)).toBeTruthy();
  expect(f.enviarOmie).toHaveBeenCalledWith({
    data: expect.objectContaining({ versaoProdutos, clienteId: 98 }),
  });
  expect(f.alterar).not.toHaveBeenCalled();
});

it("solicita emissão com confirmação e consulta a autorização sem repetir o pedido de emissão", async () => {
  f.contexto.mockResolvedValue({
    empresaId: empresa,
    usuarioId: usuario,
    papel: "administrativo",
    disponivel: true,
  });
  f.listar.mockResolvedValue({ ...resposta, itens: [{ ...pedido, status: "confirmado" }] });
  f.faturamentoOmie.mockResolvedValue({
    estado: "vinculado",
    numero: "221",
    pendente: false,
    ativo: true,
  });
  f.operarFiscal
    .mockResolvedValueOnce({ estado: "aguardando" })
    .mockResolvedValueOnce({ estado: "autorizado", nota: "87" });
  const user = montar();
  await user.click(await screen.findByRole("button", { name: "Enviar ao Omie" }));
  const emitir = await screen.findByRole("button", { name: "Solicitar emissão da NF-e" });
  expect((emitir as HTMLButtonElement).disabled).toBe(true);
  await user.click(screen.getByRole("checkbox", { name: /Conferi o cliente/ }));
  await user.click(emitir);
  await screen.findByText("Aguardando confirmação da NF-e no Omie.");
  expect(screen.queryByRole("button", { name: "Solicitar emissão da NF-e" })).toBeNull();
  await user.click(screen.getByRole("button", { name: "Consultar autorização" }));
  expect(await screen.findByText(/NF-e 87 autorizada/)).toBeTruthy();
  expect(f.operarFiscal.mock.calls.map(([entrada]) => entrada.data.emitir)).toEqual([true, false]);
  expect(f.alterar).not.toHaveBeenCalled();
});
