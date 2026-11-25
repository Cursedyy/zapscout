import { createClient } from "@supabase/supabase-js";
import { beforeEach, expect, it, vi } from "vitest";
import type { Database } from "@/integrations/supabase/types";
import { novoPedido } from "./mimo-pedido";
import { filtroRastreamentoSchema } from "./mimo-rastreamento";
import { listarRastreamentoMimo } from "./mimo-rastreamento.functions";

const f = vi.hoisted(() => ({ acesso: vi.fn(), ativo: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const b = { middleware: () => b, inputValidator: () => b, handler: (fn: unknown) => fn };
    return b;
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("./mimo-leads.server", () => ({ exigirMimo: f.acesso }));
vi.mock("./mimo-tira.server", () => ({ tiraPersistenciaAtiva: f.ativo }));

const empresa = "10000000-0000-4000-8000-000000000001";
const usuario = "20000000-0000-4000-8000-000000000001";
const linha = {
  id: "40000000-0000-4000-8000-000000000001",
  empresa_id: empresa,
  lead_id: "30000000-0000-4000-8000-000000000001",
  numero: 42,
  versao: 1,
  documento: {
    ...novoPedido(),
    cliente: "Cliente autorizado",
    status: "enviado",
    cotacaoId: "c1",
    cotacoes: [
      {
        id: "c1",
        modalidade: "Expresso",
        prazo: "2 dias",
        modo: "remessa",
        valor: 100,
        valoresVolumes: {},
        assinatura: "a",
        registradaEm: "2026-11-20T12:00:00.000Z",
        oficial: true,
        transportadora: "Sintética",
        servicoCodigo: "COD-9",
      },
    ],
  },
  pix: null,
  recebimentos: [],
  total: 100,
  produtos: 100,
  frete: 0,
  status: "enviado",
  created_at: "2026-11-20T12:00:00Z",
  updated_at: "2026-11-24T12:00:00Z",
};

beforeEach(() => {
  vi.resetAllMocks();
  f.acesso.mockResolvedValue({ empresaId: empresa, usuarioId: usuario, papel: "vendedor" });
  f.ativo.mockReturnValue(true);
});

function preparar() {
  const fetcher = vi.fn(async () => Response.json([linha]));
  const supabase = createClient<Database>("https://mimo.example.invalid", "chave-sintetica", {
    global: { fetch: fetcher },
    auth: { persistSession: false },
  });
  const listar = (entrada: unknown) =>
    (
      listarRastreamentoMimo as unknown as (args: {
        context: { supabase: typeof supabase; userId: string };
        data: ReturnType<typeof filtroRastreamentoSchema.parse>;
      }) => Promise<{ disponivel: boolean; itens: unknown[]; total: number }>
    )({ context: { supabase, userId: usuario }, data: filtroRastreamentoSchema.parse(entrada) });
  return { fetcher, listar };
}

it("lê exclusivamente a visão segura, com empresa, estados e período escopados", async () => {
  const { fetcher, listar } = preparar();
  const resposta = await listar({ busca: "COD-9", inicio: "2026-11-01", fim: "2026-11-24" });
  const url = new URL(String((fetcher.mock.calls as unknown[][])[0]?.[0]));
  expect(url.pathname).toBe("/rest/v1/mimo_tira_pedidos_seguros");
  expect(url.searchParams.get("empresa_id")).toBe(`eq.${empresa}`);
  expect(url.searchParams.get("status")).toContain("faturado");
  expect(url.searchParams.getAll("updated_at")).toEqual([
    "gte.2026-11-01T00:00:00-03:00",
    "lte.2026-11-24T23:59:59.999-03:00",
  ]);
  expect(resposta).toMatchObject({
    disponivel: true,
    total: 1,
    itens: [{ numero: 42, codigoServico: "COD-9" }],
  });
});

it("nega marketing ou vínculo revogado antes de qualquer leitura", async () => {
  const { fetcher, listar } = preparar();
  f.acesso.mockResolvedValueOnce({ empresaId: empresa, usuarioId: usuario, papel: "marketing" });
  await expect(listar({})).rejects.toThrow("Acesso negado.");
  f.acesso.mockRejectedValueOnce(Error("Acesso negado."));
  await expect(listar({})).rejects.toThrow("Acesso negado.");
  expect(fetcher).not.toHaveBeenCalled();
});

it("não consulta quando a persistência canônica está indisponível", async () => {
  const { fetcher, listar } = preparar();
  f.ativo.mockReturnValue(false);
  expect(await listar({})).toEqual({ disponivel: false, itens: [], total: 0 });
  expect(fetcher).not.toHaveBeenCalled();
});
