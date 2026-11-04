import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const s = vi.hoisted(() => ({ leads: vi.fn(), contexto: vi.fn(), tira: vi.fn(), meta: vi.fn() }));
vi.mock("./mimo-leads.functions", () => ({
  listarLeadsMimo: s.leads,
  contextoLeadsMimo: s.contexto,
}));
vi.mock("./mimo-pedido.functions", () => ({ carregarTiraMimo: s.tira }));
vi.mock("./mimo-meta-ads.functions", () => ({ listarImportacoesMetaMimo: s.meta }));
import { filtrosIniciais, leadsMimoOptions } from "./mimo-leads.queries";
import { importacoesMetaOptions } from "./mimo-meta-ads.queries";
import { preloadDadosMimo } from "./mimo-preload-dados";
let qc: QueryClient;
beforeEach(() => {
  vi.resetAllMocks();
  s.leads.mockResolvedValue({ leads: [], total: 0 });
  s.contexto.mockResolvedValue({ empresaId: "empresa", usuarioId: "usuario" });
  s.meta.mockResolvedValue([]);
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(() => qc.clear());
describe("opções reais compartilhadas entre prefetch e tela", () => {
  it("a tela reutiliza a lista já antecipada sem repetir a consulta", async () => {
    await preloadDadosMimo("/mimo/leads", qc);
    await qc.fetchQuery(leadsMimoOptions("usuario", filtrosIniciais));
    expect(s.leads).toHaveBeenCalledTimes(1);
  });
  it("prefetch e abertura simultâneos compartilham a requisição em andamento", async () => {
    await Promise.all([
      qc.prefetchQuery(importacoesMetaOptions),
      qc.fetchQuery(importacoesMetaOptions),
    ]);
    expect(s.meta).toHaveBeenCalledTimes(1);
  });
  it("consultas de usuários diferentes não compartilham a lista de leads", async () => {
    await qc.fetchQuery(leadsMimoOptions("usuario-a", filtrosIniciais));
    await qc.fetchQuery(leadsMimoOptions("usuario-b", filtrosIniciais));
    expect(s.leads).toHaveBeenCalledTimes(2);
  });
  it("invalidar após edição força nova leitura mesmo dentro do staleTime", async () => {
    await qc.fetchQuery(leadsMimoOptions("usuario", filtrosIniciais));
    await qc.invalidateQueries({ queryKey: ["mimo-leads"] });
    await qc.fetchQuery(leadsMimoOptions("usuario", filtrosIniciais));
    expect(s.leads).toHaveBeenCalledTimes(2);
  });
});
