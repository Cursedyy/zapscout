import { beforeEach, expect, it, vi } from "vitest";
import { consultarVendasMensais, salvarValorVendas } from "./mimo-vendas-mensais.functions";
const f = vi.hoisted(() => ({ acesso: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({ createServerFn: () => {
  const builder = { middleware: () => builder, inputValidator: () => builder, handler: (fn: unknown) => fn };
  return builder;
} }));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("./mimo-leads.server", () => ({ exigirMimo: f.acesso }));
const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(), maybeSingle: vi.fn() };
const from = vi.fn(() => query);
const ler = () => (consultarVendasMensais as unknown as (args: unknown) => Promise<unknown>)(
  { context: { supabase: { from }, userId: "usuario" } });
beforeEach(() => vi.clearAllMocks());
it.each(["administrador", "gestor"])("consulta o mês mais recente da empresa para %s", async papel => {
  f.acesso.mockResolvedValue({ papel, empresaId: "empresa" });
  query.maybeSingle.mockResolvedValue({ data: null, error: null });
  expect(await ler()).toBeNull();
  expect(query.eq).toHaveBeenCalledWith("empresa_id", "empresa");
  expect(query.order).toHaveBeenCalledWith("competencia", { ascending: false });
});
it.each(["administrativo", "marketing", "vendedor"])("bloqueia a consulta direta por %s", async papel => {
  f.acesso.mockResolvedValue({ papel, empresaId: "empresa" });
  await expect(ler()).rejects.toThrow("Acesso negado");
  expect(from).not.toHaveBeenCalled();
});

const rpc = vi.fn();
const editar = () => (salvarValorVendas as unknown as (args: unknown) => Promise<unknown>)({
  context: { supabase: { from, rpc }, userId: "usuario" },
  data: { competencia: "2025-01-01", dia: null, esperado: 1000, valor: 2000 },
});
it("salva no escopo do usuário e devolve os totais recalculados", async () => {
  f.acesso.mockResolvedValue({ papel: "gestor", empresaId: "empresa" });
  rpc.mockResolvedValue({ data: { competencia: "2025-01-01", ajustes: { meta: 2000 },
    demonstrativo: { total: { orcado: 1000 }, semanas: [{ numero: 1, dias: [{ data: "2025-01-02", feriado: false, realizado: 500 }] }] } } });
  expect(await editar()).toMatchObject({ total: { orcado: 2000, realizado: 500, coberturaBps: 2500, diferenca: -1500 } });
  expect(rpc).toHaveBeenCalledWith("mimo_vendas_definir_valor", {
    _empresa: "empresa", _competencia: "2025-01-01", _dia: null, _esperado: 1000, _valor: 2000,
  });
});
it("recusa o salvamento a perfis sem acesso e informa conflitos de edição", async () => {
  f.acesso.mockResolvedValue({ papel: "vendedor", empresaId: "empresa" });
  await expect(editar()).rejects.toThrow("Acesso negado");
  expect(rpc).not.toHaveBeenCalled();
  f.acesso.mockResolvedValue({ papel: "administrador", empresaId: "empresa" });
  rpc.mockResolvedValue({ error: { code: "40001" } });
  await expect(editar()).rejects.toThrow("Outra pessoa");
});
