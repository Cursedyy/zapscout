// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
const api = vi.hoisted(() => ({ buscar: vi.fn(), legado: vi.fn(), n8n: vi.fn(), incrementar: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({ createFileRoute: () => (options: unknown) => ({ options }), Link: () => null }));
vi.mock("@/store/app-store", () => ({
  usePlano: () => ({ id: "pro", nome: "Pro", buscas_mes: 100 }),
  useStore: () => ({ buscasUsadas: 0, incrementarBusca: api.incrementar, addBuscaSalva: vi.fn(), buscasSalvas: [], leads: [], addLead: vi.fn(), addLeads: vi.fn() }),
}));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { id: "usuario-sintetico" } }) }));
vi.mock("@/lib/buscar-leads-fallback.functions", () => ({ buscarLeadsFallback: api.buscar }));
vi.mock("@/lib/buscar-leads.functions", () => ({ buscarLeadsReais: api.legado }));
vi.mock("@/lib/buscar-leads-n8n-webhook.functions", () => ({ buscarLeadsN8nWebhook: api.n8n }));
vi.mock("@/lib/funnel-events", () => ({ trackFunnelEvent: vi.fn() }));
vi.mock("@/components/nicho-combobox", () => ({ NichoCombobox: ({ value, onChange }: { value: string; onChange: (s: string) => void }) => <input aria-label="Nicho" value={value} onChange={(e) => onChange(e.target.value)} /> }));
vi.mock("@/components/cidade-combobox", () => ({ CidadeCombobox: () => null }));
vi.mock("@/components/lead-card", () => ({ LeadCard: ({ lead, afinidadeMimo }: { lead: { nome: string }; afinidadeMimo?: { nivel: string } }) => <article>{lead.nome} · {afinidadeMimo?.nivel ?? "Score geral"}</article> }));
vi.mock("@/components/export-button", () => ({ ExportButton: () => null }));
vi.mock("@/components/upgrade-modal", () => ({ UpgradeModal: () => null }));
vi.mock("@/components/buscar-loading", () => ({ BuscarLoading: () => null }));
vi.mock("@/components/fila-leads-menu", () => ({ FilaLeadsMenu: () => null }));
import { Route } from "./app.buscar";
const Page = Route.options.component!;
beforeEach(() => {
  const storage = new Map<string, string>();
  vi.stubGlobal("localStorage", { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => storage.set(k, v), removeItem: (k: string) => storage.delete(k) });
  vi.clearAllMocks();
  api.buscar.mockResolvedValue({ source: "apify", totalBrutoFonte: 2, leads: [
    { id: "sintetico-1", nome: "Empresa Exemplo", nicho: "Loja de produtos naturais", cidade: "Teste", telefone: "", avaliacao: 4.8, totalAvaliacoes: 200, site: null },
    { id: "sintetico-2", nome: "Empório Sintético", nicho: "Empório", cidade: "Teste", telefone: "", avaliacao: 4.9, totalAvaliacoes: 200, site: null },
  ] });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("busca no segmento escolhido, ordena por evidência e permite filtrar indicados", async () => {
  const user = userEvent.setup(); render(<Page />);
  await user.selectOptions(screen.getByLabelText("Objetivo da prospecção"), "mimo");
  await user.click(screen.getByRole("button", { name: "Empório" }));
  await user.click(screen.getByRole("button", { name: "Buscar leads" }));
  await waitFor(() => expect(api.buscar).toHaveBeenCalledWith({ data: expect.objectContaining({ nicho: "Empório", semSite: false }) }));
  await screen.findByText("Empório Sintético · Perfil indicado");
  expect(screen.getAllByRole("article")[0].textContent).toContain("Empório Sintético");
  expect(screen.getByText("Empresa Exemplo · Avaliar perfil")).toBeTruthy();
  await user.click(screen.getByLabelText("Somente perfis indicados"));
  expect(screen.queryByText("Empresa Exemplo · Avaliar perfil")).toBeNull();
  await user.selectOptions(screen.getByLabelText("Objetivo da prospecção"), "geral");
  expect(screen.getByText("Empório Sintético · Perfil indicado")).toBeTruthy();
});
it("uma busca geral continua usando o fluxo e o score existentes", async () => {
  const user = userEvent.setup(); render(<Page />);
  await user.type(screen.getByLabelText("Nicho"), "Empório");
  await user.click(screen.getByRole("button", { name: "Buscar leads" }));
  await screen.findByText("Empório Sintético · Score geral");
  expect(screen.queryByLabelText("Somente perfis indicados")).toBeNull();
});

