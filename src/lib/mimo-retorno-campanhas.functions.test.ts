import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { beforeEach, expect, it, vi } from "vitest";
import { retornoCampanhasMimo } from "./mimo-retorno-campanhas.functions";
const f = vi.hoisted(() => ({ acesso: vi.fn(), capacidade: vi.fn(), adminFrom: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const b = { middleware: () => b, inputValidator: () => b, handler: (fn: unknown) => fn };
    return b;
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("./mimo-leads.server", () => ({ exigirMimo: f.acesso }));
vi.mock("./mimo-comercial-v2.server", () => ({ capacidadeComercial: f.capacidade }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from: f.adminFrom } }));
const empresaId = "10000000-0000-4000-8000-000000000001";
const filtro = { inicio: "2026-11-01", fim: "2026-11-30" };
const lead = { id: "lead", empresa_id: empresaId, entrada_em: "2026-11-02T12:00:00Z" };
const metrica = {
  id: "metrica",
  empresa_id: empresaId,
  chave: "chave",
  campanha: "Campanha sintética",
  conjunto: "Conjunto",
  anuncio: "Anúncio",
  data_inicio: "2026-11-01",
  data_fim: "2026-11-01",
  investimento: 10,
  leads_meta: 3,
};
const pedido = {
  id: "pedido",
  empresa_id: empresaId,
  lead_id: "lead",
  status: "faturado",
  total: 999,
  primeira_confirmacao: "2026-11-05T12:00:00Z",
};
beforeEach(() => {
  vi.resetAllMocks();
  f.acesso.mockResolvedValue({ empresaId, papel: "gestor", usuarioId: "ator" });
  f.capacidade.mockResolvedValue(true);
});
function preparar() {
  const dados = (url: RequestInfo | URL) => {
    const path = new URL(String(url)).pathname;
    if (path.endsWith("mimo_meta_ads_metricas")) return [metrica];
    if (path.endsWith("mimo_leads")) return [lead];
    if (path.endsWith("mimo_pedidos_conversao")) return [pedido];
    throw Error("Fonte inesperada");
  };
  const fetcher = vi.fn(async (url: RequestInfo | URL) =>
    Response.json(dados(url), { headers: { "content-range": "0-0/1" } }),
  );
  const fetchAdmin = vi.fn(async (url: RequestInfo | URL) => {
    expect(new URL(String(url)).pathname).toBe("/rest/v1/mimo_leads");
    return Response.json([lead], { headers: { "content-range": "0-0/1" } });
  });
  const cliente = (fetch: typeof fetcher) =>
    createClient<Database>("https://mimo.example.invalid", "sintetico", {
      global: { fetch },
      auth: { persistSession: false },
    });
  const supabase = cliente(fetcher),
    admin = cliente(fetchAdmin);
  f.adminFrom.mockImplementation(admin.from.bind(admin));
  const chamar = () =>
    (
      retornoCampanhasMimo as unknown as (args: {
        context: { supabase: typeof supabase; userId: string };
        data: typeof filtro;
      }) => Promise<Awaited<ReturnType<typeof retornoCampanhasMimo>>>
    )({ context: { supabase, userId: "ator" }, data: filtro });
  return { chamar, fetcher, fetchAdmin };
}
it("restringe todas as fontes à empresa, usa pedidos canônicos e retorna somente agregados", async () => {
  const { chamar, fetcher, fetchAdmin } = preparar();
  const r = await chamar();
  expect(fetcher).toHaveBeenCalledTimes(3);
  expect(fetchAdmin).not.toHaveBeenCalled();
  const urls = fetcher.mock.calls.map(([url]) => new URL(String(url)));
  for (const url of urls) {
    expect(url.searchParams.get("empresa_id")).toBe(`eq.${empresaId}`);
    expect(url.searchParams.get("order")).toBe("id.asc");
  }
  expect(
    urls.find((u) => u.pathname.endsWith("mimo_pedidos_conversao"))?.searchParams.get("select"),
  ).toBe("id,empresa_id,lead_id,status,total,primeira_confirmacao");
  expect(r.naoAtribuidos).toMatchObject({ leads: 1, pedidos: 1, receitaFaturada: 999 });
  expect(r).not.toHaveProperty("leads");
  expect(r).not.toHaveProperty("pedidos");
});
it("marketing recebe só agregados do CRM e não lê receita ou pedidos", async () => {
  f.acesso.mockResolvedValue({ empresaId, papel: "marketing", usuarioId: "ator" });
  const { chamar, fetcher, fetchAdmin } = preparar();
  const r = await chamar();
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetchAdmin).toHaveBeenCalledTimes(1);
  expect(f.capacidade).not.toHaveBeenCalled();
  const url = new URL(String(fetchAdmin.mock.calls[0][0]));
  expect(url.searchParams.get("select")).toBe("id,empresa_id,entrada_em");
  expect(url.searchParams.get("empresa_id")).toBe(`eq.${empresaId}`);
  expect(r.naoAtribuidos.receitaFaturada).toBeNull();
  expect(r.naoAtribuidos.leads).toBe(1);
  expect(r.avisos.pedidosDisponiveis).toBe(false);
});
it.each(["vendedor", "administrativo"])("nega cargo %s antes de ler as fontes", async (papel) => {
  f.acesso.mockResolvedValue({ empresaId, papel, usuarioId: "ator" });
  const { chamar, fetcher, fetchAdmin } = preparar();
  await expect(chamar()).rejects.toThrow("Acesso negado.");
  expect(fetcher).not.toHaveBeenCalled();
  expect(fetchAdmin).not.toHaveBeenCalled();
});
it("nega associação revogada e não transforma fonte incompleta em zero", async () => {
  const { chamar, fetcher } = preparar();
  f.acesso.mockRejectedValueOnce(Error("Acesso negado."));
  await expect(chamar()).rejects.toThrow("Acesso negado.");
  fetcher.mockResolvedValueOnce(Response.json([], { headers: { "content-range": "*/4" } }));
  await expect(chamar()).rejects.toThrow(/incompleta/);
});
it("marca ausência da projeção canônica sem usar valores legados de lead", async () => {
  f.capacidade.mockResolvedValue(false);
  const { chamar, fetcher } = preparar();
  const r = await chamar();
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(r.naoAtribuidos.pedidos).toBeNull();
  expect(r.naoAtribuidos.receitaFaturada).toBeNull();
});
