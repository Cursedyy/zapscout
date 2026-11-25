import { createClient } from "@supabase/supabase-js";
import { beforeEach, expect, it, vi } from "vitest";
import type { Database } from "@/integrations/supabase/types";
import { listarPedidosMimo } from "./mimo-pedido.functions";
import { filtroPedidosSchema } from "./mimo-tira-regras";
import { novoPedido, CATALOGO, itemDeProduto } from "./mimo-pedido";
import { PAPEIS_MIMO, podeAbrirPagina } from "./mimo-acesso";
const f = vi.hoisted(() => ({ acesso: vi.fn(), ativo: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const builder = {
      middleware: () => builder,
      inputValidator: () => builder,
      handler: (fn: unknown) => fn,
    };
    return builder;
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("./mimo-leads.server", () => ({ exigirMimo: f.acesso }));
vi.mock("./mimo-tira.server", () => ({ tiraPersistenciaAtiva: f.ativo }));
vi.mock("@/integrations/supabase/client.server", () => ({
  get supabaseAdmin() {
    throw Error("Não usar cliente privilegiado para esta leitura");
  },
}));
const empresa = "10000000-0000-4000-8000-000000000001";
const usuario = "20000000-0000-4000-8000-000000000001";
const leadId = "30000000-0000-4000-8000-000000000001";
const pedido = {
  id: "40000000-0000-4000-8000-000000000001",
  empresa_id: empresa,
  lead_id: leadId,
  numero: 42,
  versao: 1,
  documento: {
    ...novoPedido(),
    cliente: "Cliente",
    responsavelId: usuario,
    itens: [{ ...itemDeProduto(CATALOGO[0], 1), custoInterno: 123 }],
  },
  pix: null,
  recebimentos: [],
  total: 100,
  produtos: 100,
  frete: 0,
  status: "rascunho",
  created_at: "2026-11-01T12:00:00Z",
  updated_at: "2026-11-24T12:00:00Z",
};
beforeEach(() => {
  vi.resetAllMocks();
  f.acesso.mockResolvedValue({ empresaId: empresa, usuarioId: usuario, papel: "vendedor" });
  f.ativo.mockReturnValue(true);
});
function preparar() {
  const fetcher = vi.fn(async (url: RequestInfo | URL) => {
    const path = new URL(String(url)).pathname;
    if (path.endsWith("mimo_tira_pedidos_seguros"))
      return Response.json([pedido], { headers: { "content-range": "10-10/21" } });
    if (path.endsWith("mimo_leads")) return Response.json([{ id: leadId, origem: "whatsapp" }]);
    if (path.endsWith("mimo_comercial_responsaveis"))
      return Response.json([
        { user_id: usuario, papel: "vendedor", nome: "Responsável sintético" },
      ]);
    throw Error("Fonte inesperada");
  });
  const supabase = createClient<Database>("https://mimo.example.invalid", "chave-sintetica", {
    global: { fetch: fetcher },
    auth: { persistSession: false },
  });
  const listar = (data: unknown) =>
    (
      listarPedidosMimo as unknown as (args: {
        context: { supabase: typeof supabase; userId: string };
        data: ReturnType<typeof filtroPedidosSchema.parse>;
      }) => Promise<Awaited<ReturnType<typeof listarPedidosMimo>>>
    )({ context: { supabase, userId: usuario }, data: filtroPedidosSchema.parse(data) });
  return { fetcher, listar };
}
it("mantém cliente autenticado, empresa, visão segura, paginação estável e filtros combinados", async () => {
  const { fetcher, listar } = preparar();
  const resultado = await listar({
    pagina: 2,
    porPagina: 10,
    busca: "42",
    status: "rascunho",
    inicio: "2026-11-01",
    fim: "2026-11-24",
    incluirContexto: true,
  });
  const url = new URL(String(fetcher.mock.calls[0][0]));
  expect(url.pathname).toBe("/rest/v1/mimo_tira_pedidos_seguros");
  expect(url.searchParams.get("empresa_id")).toBe(`eq.${empresa}`);
  expect(url.searchParams.get("numero")).toBe("eq.42");
  expect(url.searchParams.get("status")).toBe("eq.rascunho");
  expect(url.searchParams.getAll("created_at")).toEqual([
    "gte.2026-11-01T00:00:00-03:00",
    "lte.2026-11-24T23:59:59.999-03:00",
  ]);
  expect(url.searchParams.get("offset")).toBe("10");
  expect(url.searchParams.get("limit")).toBe("10");
  expect(url.searchParams.get("order")).toBe("updated_at.desc,id.asc");
  expect(resultado.itens[0].documento.itens[0].custoInterno).toBeNull();
  expect(resultado.total).toBe(21);
  expect(resultado.contextoPedidos[pedido.id]).toEqual({
    origemLead: "whatsapp",
    responsavelNome: "Responsável sintético",
  });
  const leadUrl = new URL(String(fetcher.mock.calls[1][0]));
  expect(leadUrl.searchParams.get("empresa_id")).toBe(`eq.${empresa}`);
  expect(leadUrl.searchParams.get("id")).toBe(`in.(${leadId})`);
  expect(leadUrl.searchParams.get("select")).toBe("id,origem");
});
it("busca cliente sem ampliar escopo e não carrega metadados no fluxo antigo", async () => {
  const { fetcher, listar } = preparar();
  await listar({ busca: "Cliente%_,().*" });
  const url = new URL(String(fetcher.mock.calls[0][0]));
  expect(url.searchParams.get("documento->>cliente")).toBe("ilike.%Cliente%");
  expect(url.searchParams.get("empresa_id")).toBe(`eq.${empresa}`);
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("nega marketing e associação revogada antes da leitura", async () => {
  const { fetcher, listar } = preparar();
  f.acesso.mockResolvedValueOnce({ empresaId: empresa, usuarioId: usuario, papel: "marketing" });
  await expect(listar({})).rejects.toThrow("Acesso negado.");
  f.acesso.mockRejectedValueOnce(Error("Acesso negado."));
  await expect(listar({})).rejects.toThrow("Acesso negado.");
  expect(fetcher).not.toHaveBeenCalled();
});
it("sem ativação retorna indisponível e não lê outras fontes", async () => {
  const { fetcher, listar } = preparar();
  f.ativo.mockReturnValue(false);
  expect(await listar({ incluirContexto: true })).toMatchObject({
    disponivel: false,
    itens: [],
    total: 0,
    contextoPedidos: {},
  });
  expect(fetcher).not.toHaveBeenCalled();
});
it.each([{ inicio: "2026-02-30" }, { inicio: "2026-11-24", fim: "2026-11-01" }])(
  "valida datas e intervalo %j",
  (entrada) => {
    expect(filtroPedidosSchema.safeParse(entrada).success).toBe(false);
  },
);
it.each(PAPEIS_MIMO)("preserva os cargos autorizados no menu de pedidos: %s", (papel) => {
  expect(podeAbrirPagina(papel, "/mimo/pedidos")).toBe(papel !== "marketing");
});
