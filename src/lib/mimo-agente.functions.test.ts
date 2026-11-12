import { beforeEach, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({ exigir: vi.fn(), operar: vi.fn(), material: vi.fn(), responder: vi.fn(), gerar: vi.fn(), upload: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({ createServerFn: () => {
  const b = { middleware: () => b, inputValidator: () => b, handler: (h: unknown) => h };
  return b;
} }));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("./mimo-leads.server", () => ({ exigirMimo: f.exigir }));
vi.mock("./mimo-agente-db.server", () => ({ operarAgente: f.operar, registrarMaterialAgente: f.material }));
vi.mock("./mimo-agente-manual.server", () => ({ responderManualmenteAgente: f.responder }));
vi.mock("./mimo-agente-modelo.server", () => ({ gerarRespostaAgente: f.gerar }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { storage: { from: f.upload } } }));
import { painelAgenteMimo, alterarAgenteMimo, responderAgenteMimo, enviarMaterialAgenteMimo, desativarMaterialAgenteMimo, simularAgenteMimo } from "./mimo-agente.functions";
beforeEach(() => { vi.resetAllMocks(); });
const executar = (fn: unknown, data: unknown = {}) => (fn as (v: unknown) => Promise<any>)({ context: { supabase: {}, userId: "ator-verificado" }, data });
it.each(["vendedor", "marketing", "administrativo"])("%s nao acessa nenhum endpoint do agente", async papel => {
  f.exigir.mockResolvedValue({ empresaId: "empresa", papel });
  for (const fn of [painelAgenteMimo, alterarAgenteMimo, responderAgenteMimo, enviarMaterialAgenteMimo, desativarMaterialAgenteMimo, simularAgenteMimo]) {
    await expect(executar(fn, { acao: "assumir", conversa: "sua-conversa" })).rejects.toThrow("Acesso negado");
  }
  for (const spy of [f.operar, f.material, f.responder, f.gerar, f.upload]) expect(spy).not.toHaveBeenCalled();
});
it.each(["administrador", "gestor"])("%s preserva o acesso ao painel", async papel => {
  f.exigir.mockResolvedValue({ empresaId: "empresa", papel });
  f.operar.mockResolvedValue({ vinculos: [] });
  expect(await executar(painelAgenteMimo)).toEqual({ painel: { vinculos: [] }, vinculos: [] });
  expect(f.operar).toHaveBeenCalledWith("empresa", "ator-verificado", "painel");
});
