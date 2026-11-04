import { QueryClient, queryOptions } from "@tanstack/react-query";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { periodoInicialMimo } from "./mimo-periodo";
import { filtrosCarteiraSchema } from "./mimo-carteira";
import { filtroPedidosSchema } from "./mimo-tira-regras";
const s = vi.hoisted(() => ({
  dashboard: vi.fn(),
  relatorio: vi.fn(),
  contexto: vi.fn(),
  carteira: vi.fn(),
  leads: vi.fn(),
  tira: vi.fn(),
  pedidos: vi.fn(),
  equipe: vi.fn(),
  perdas: vi.fn(),
  meta: vi.fn(),
  estado: vi.fn(),
}));
vi.mock("./mimo-dashboard.functions", () => ({ dashboardMimo: s.dashboard }));
vi.mock("./mimo-relatorio.functions", () => ({ relatorioMimo: s.relatorio }));
vi.mock("./mimo-contexto", () => ({
  contextoMimoOptions: { queryKey: ["mimo-leads-contexto"], queryFn: s.contexto },
}));
vi.mock("./mimo-carteira.functions", () => ({ listarCarteiraMimo: s.carteira }));
vi.mock("./mimo-leads.queries", () => ({
  filtrosIniciais: { pagina: 0 },
  leadsMimoOptions: (u: string, f: unknown) => ({
    queryKey: ["mimo-leads", u, f],
    queryFn: () => s.leads(f),
  }),
}));
vi.mock("./mimo-tira.queries", () => ({
  tiraOptions: { queryKey: ["mimo-tira"], queryFn: s.tira },
}));
vi.mock("./mimo-pedido.functions", () => ({ listarPedidosMimo: s.pedidos }));
vi.mock("./mimo-meta-ads.queries", () => ({
  importacoesMetaOptions: { queryKey: ["mimo-meta-importacoes"], queryFn: s.meta },
}));
vi.mock("./mimo-equipe.functions", () => ({ listarEquipeMimo: s.equipe }));
vi.mock("./mimo-leads.functions", () => ({ perdasMimo: s.perdas }));
vi.mock("./mimo-whatsapp.functions", () => ({ estadoWhatsAppMimo: s.estado }));
import { preloadDadosMimo } from "./mimo-preload-dados";
let qc: QueryClient;
beforeEach(() => {
  vi.clearAllMocks();
  qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 60_000 } } });
  for (const fn of Object.values(s)) fn.mockResolvedValue({ carregado: true });
  s.contexto.mockResolvedValue({ empresaId: "empresa", usuarioId: "usuario" });
  s.tira.mockResolvedValue({ disponivel: true });
});
afterEach(() => qc.clear());
describe("dados antecipados reutilizados pelas telas MiMo", () => {
  it("dashboard e relatórios reusam o mesmo filtro inicial sem repetir leitura", async () => {
    for (const to of ["/mimo", "/mimo/relatorios"]) {
      await preloadDadosMimo(to, qc);
      await preloadDadosMimo(to, qc);
    }
    expect(s.dashboard).toHaveBeenCalledTimes(1);
    expect(s.relatorio).toHaveBeenCalledTimes(1);
    expect(qc.getQueryData(["mimo-dashboard", periodoInicialMimo(30)])).toEqual({
      carregado: true,
    });
    expect(qc.getQueryData(["mimo-relatorio", periodoInicialMimo(7)])).toEqual({ carregado: true });
    await qc.fetchQuery(
      queryOptions({
        queryKey: ["mimo-dashboard", periodoInicialMimo(30)],
        queryFn: s.dashboard,
        staleTime: 60_000,
      }),
    );
    expect(s.dashboard).toHaveBeenCalledTimes(1);
  });
  it("leads e carteira compartilham o contexto e isolam a lista pelo usuário", async () => {
    await preloadDadosMimo("/mimo/leads", qc);
    await preloadDadosMimo("/mimo/carteira", qc);
    expect(s.contexto).toHaveBeenCalledTimes(1);
    expect(qc.getQueryData(["mimo-leads", "usuario", { pagina: 0 }])).toEqual({ carregado: true });
    expect(
      qc.getQueryData(["mimo-carteira", "empresa", "usuario", filtrosCarteiraSchema.parse({})]),
    ).toEqual({ carregado: true });
  });
  it("pedidos usam a primeira página padrão, sem ler pedidos se a persistência estiver desativada", async () => {
    await preloadDadosMimo("/mimo/tira-pedido", qc);
    expect(s.pedidos).toHaveBeenCalledWith({ data: filtroPedidosSchema.parse({}) });
    qc.clear();
    s.pedidos.mockClear();
    s.tira.mockResolvedValue({ disponivel: false });
    await preloadDadosMimo("/mimo/tira-pedido", qc);
    expect(s.pedidos).not.toHaveBeenCalled();
  });
  it.each([
    ["/mimo/equipe", "mimo-equipe"],
    ["/mimo/meta-ads", "mimo-meta-importacoes"],
    ["/mimo/whatsapp", "mimo-whatsapp-conexao"],
  ])("aquece %s no cache correto", async (to, key) => {
    await preloadDadosMimo(to, qc);
    expect(qc.getQueryData([key])).toEqual({ carregado: true });
  });
  it("perdas usam datas vazias e campanhas não dispara consulta inexistente", async () => {
    await preloadDadosMimo("/mimo/perdas", qc);
    expect(s.perdas).toHaveBeenCalledWith({ data: { inicio: null, fim: null } });
    const total = qc.getQueryCache().getAll().length;
    await preloadDadosMimo("/mimo/campanhas", qc);
    expect(qc.getQueryCache().getAll()).toHaveLength(total);
  });
});
