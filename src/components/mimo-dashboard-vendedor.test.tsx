// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { calcularDashboard } from "@/lib/mimo-dashboard";
const f = vi.hoisted(() => ({ dashboard: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock('@/lib/mimo-comercial-conversao.functions', () => ({
  conversaoPedidosMimo: async () => ({disponivel:false,motivo:'Conversão de pedidos aguardando ativação.'}),
}));
vi.mock("@/lib/mimo-dashboard.functions", () => ({ dashboardMimo: f.dashboard }));
vi.mock("recharts", () => {
  const Container = ({ children }: any) => <div>{children}</div>;
  const Empty = () => null;
  return { ResponsiveContainer: Container, LineChart: Container, BarChart: Container, Line: ({ name }: any) => <span>{name}</span>, Bar: Empty, XAxis: Empty, YAxis: Empty, Tooltip: Empty, CartesianGrid: Empty, Legend: Empty };
});
import { MimoDashboardPage } from "./mimo-dashboard-page";
let qc: QueryClient;
beforeEach(() => {
  vi.resetAllMocks();
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  f.dashboard.mockImplementation(async ({ data }) => ({ permitido: true, escopo: "pessoal", ...calcularDashboard(data, [{ entrada_em: `${data.inicio}T12:00:00Z`, perfil: "revendedor", origem: "whatsapp", campanha_origem: "Campanha pessoal", qualificacao: "qualificado", etapa: "novo", conversao_em: null, valor_pedido: null }], []) }));
});
afterEach(() => { cleanup(); qc.clear(); });
it("exibe estatisticas pessoais e consulta historico por datas sem metricas gerais de midia", async () => {
  render(<QueryClientProvider client={qc}><MimoDashboardPage /></QueryClientProvider>);
  expect(await screen.findByRole("heading", { name: "Meu hist\u00f3rico de estat\u00edsticas" })).toBeTruthy();
  expect(screen.getByText("Meus leads")).toBeTruthy();
  expect(screen.getByText("Campanha pessoal")).toBeTruthy();
  expect(screen.queryByText("Investimento")).toBeNull();
  expect(screen.queryByText("CPL")).toBeNull();
  expect(screen.queryByText("CAC de m\u00eddia")).toBeNull();
  expect(screen.queryByText(/Nenhum dado do Meta Ads/)).toBeNull();
  fireEvent.change(screen.getByLabelText("In\u00edcio"), { target: { value: "2026-11-01" } });
  fireEvent.change(screen.getByLabelText("Fim"), { target: { value: "2026-11-30" } });
  fireEvent.change(screen.getByLabelText("In\u00edcio"), { target: { value: "2026-10-01" } });
  await waitFor(() => expect(f.dashboard).toHaveBeenLastCalledWith({ data: expect.objectContaining({ inicio: "2026-10-01", fim: "2026-11-30" }) }));
});
it("periodo sem leads pessoais orienta consultar outras datas", async () => {
  f.dashboard.mockImplementation(async ({ data }) => ({ permitido: true, escopo: "pessoal", ...calcularDashboard(data, [], []) }));
  render(<QueryClientProvider client={qc}><MimoDashboardPage /></QueryClientProvider>);
  expect(await screen.findByText(/Nenhum lead atribu\u00eddo a voc\u00ea entrou neste per\u00edodo/)).toBeTruthy();
  expect(screen.queryByText(/importe um relat\u00f3rio/)).toBeNull();
});
