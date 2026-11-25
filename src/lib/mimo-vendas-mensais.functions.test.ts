import { beforeEach, expect, it, vi } from "vitest";
import { consultarVendasMensais } from "./mimo-vendas-mensais.functions";
const f = vi.hoisted(() => ({ acesso: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({ createServerFn: () => ({
  middleware: () => ({ handler: (fn: unknown) => fn }),
}) }));
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
