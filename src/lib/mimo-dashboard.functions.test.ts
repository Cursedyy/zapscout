import { beforeEach, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({ exigir: vi.fn(), from: vi.fn(), adminFrom: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({ createServerFn: () => {
  const b = { middleware: () => b, inputValidator: () => b, handler: (h: unknown) => h };
  return b;
} }));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/lib/mimo-leads.server", () => ({ exigirMimo: f.exigir }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from: f.adminFrom } }));
import { dashboardMimo } from "./mimo-dashboard.functions";
const filtro = { inicio: "2026-09-01", fim: "2026-10-31", campanha: "", origem: "" };
const rows = [
  { empresa_id: "empresa", responsavel_id: "ana", entrada_em: "2026-09-10T12:00:00Z", perfil: "revendedor", origem: "whatsapp", campanha_origem: "Pessoal", qualificacao: "qualificado", etapa: "pedido_fechado", conversao_em: "2026-10-10T12:00:00Z", valor_pedido: "100" },
  { empresa_id: "empresa", responsavel_id: "bia", entrada_em: "2026-09-11T12:00:00Z", perfil: "revendedor", origem: "whatsapp", campanha_origem: "Colega", qualificacao: "qualificado", etapa: "novo", conversao_em: null, valor_pedido: null },
  { empresa_id: "outra", responsavel_id: "ana", entrada_em: "2026-09-12T12:00:00Z", perfil: "revendedor", origem: "whatsapp", campanha_origem: "Outra empresa", qualificacao: "pendente", etapa: "novo", conversao_em: null, valor_pedido: null },
];
let consultas: { tabela: string; filtros: [string, string, string][] }[];
beforeEach(() => {
  vi.resetAllMocks(); consultas = [];
  f.exigir.mockResolvedValue({ empresaId: "empresa", papel: "vendedor" });
  f.from.mockImplementation((tabela: string) => {
    const filtros: [string, string, string][] = []; consultas.push({ tabela, filtros });
    const q = {
      select: () => q,
      eq: (k: string, v: string) => { filtros.push(["eq", k, v]); return q; },
      gte: (k: string, v: string) => { filtros.push(["gte", k, v]); return q; },
      lte: (k: string, v: string) => { filtros.push(["lte", k, v]); return q; },
      order: () => q,
      range: async () => ({ error: null, data: tabela === "mimo_leads" ? rows.filter(r => filtros.every(([op, k, v]) => {
        const value = r[k as keyof typeof r];
        return op === "eq" ? value === v : op === "gte" ? String(value) >= v : String(value) <= v;
      })) : [] }),
    };
    return q;
  });
});
const executar = (usuario = "ana", data: unknown = filtro) => (dashboardMimo as unknown as (v: unknown) => Promise<any>)({ context: { supabase: { from: f.from }, userId: usuario }, data });
it("cada vendedor consulta somente seu historico, mesmo forjando outro responsavel", async () => {
  const ana = await executar("ana", { ...filtro, responsavel_id: "bia", usuarioId: "bia", empresaId: "outra" });
  expect(ana).toMatchObject({ permitido: true, escopo: "pessoal", indicadores: { leadsGerados: 1, qualificados: 1, novosClientes: 1, receita: 100, investimento: null, cpl: null, cacMidia: null } });
  expect(ana.porCampanha.map((c: any) => c.campanha)).toEqual(["Pessoal"]);
  expect(ana.serie.find((p: any) => p.periodo === "2026-09-10").leads).toBe(1);
  expect(ana.serie.find((p: any) => p.periodo === "2026-10-10").pedidos).toBe(1);
  const bia = await executar("bia");
  expect(bia.indicadores).toMatchObject({ leadsGerados: 1, novosClientes: 0, receita: 0 });
  expect(bia.porCampanha.map((c: any) => c.campanha)).toEqual(["Colega"]);
  expect(consultas.every(c => c.tabela === "mimo_leads")).toBe(true);
  expect(f.adminFrom).not.toHaveBeenCalled();
});
it("filtro de periodo permite consultar meses anteriores sem incluir outros periodos", async () => {
  const d = await executar("ana", { ...filtro, inicio: "2026-10-01" });
  expect(d.indicadores.leadsGerados).toBe(0);
  expect(d.indicadores.novosClientes).toBe(0);
});
it.each(["administrador", "gestor"])("%s preserva o dashboard geral", async papel => {
  f.exigir.mockResolvedValue({ empresaId: "empresa", papel });
  const d = await executar();
  expect(d.escopo).toBe("empresa");
  expect(d.indicadores.leadsGerados).toBe(2);
  expect(consultas.some(c => c.tabela === "mimo_meta_ads_metricas")).toBe(true);
  expect(consultas[0].filtros.some(([, k]) => k === "responsavel_id")).toBe(false);
});
it("administrativo nao consulta os dados", async () => {
  f.exigir.mockResolvedValue({ empresaId: "empresa", papel: "administrativo" });
  expect(await executar()).toEqual({ permitido: false });
  expect(f.from).not.toHaveBeenCalled();
});
it("vinculo inativo ou ausente falha antes de consultar estatisticas", async () => {
  f.exigir.mockRejectedValue(Error("Acesso negado."));
  await expect(executar()).rejects.toThrow("Acesso negado");
  expect(f.from).not.toHaveBeenCalled();
});
