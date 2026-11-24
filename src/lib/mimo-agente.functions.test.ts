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

it("exibe a qualificação do CRM somente para leads da empresa fora do piloto", async () => {
  f.exigir.mockResolvedValue({ empresaId: "empresa", papel: "gestor" });
  f.operar.mockResolvedValue({
    conversas: [
      { lead_id: "lead-1", piloto: false },
      { lead_id: "lead-2", piloto: false },
      { lead_id: "lead-1", piloto: true },
    ],
  });
  const consultar = vi.fn().mockResolvedValue({
    data: [{ id: "lead-1", qualificacao: "qualificado" }, { id: "lead-2", qualificacao: "nao_qualificado" }],
    error: null,
  });
  const filtrar = vi.fn().mockReturnValue({ in: consultar });
  const selecionar = vi.fn().mockReturnValue({ eq: filtrar });
  const from = vi.fn().mockReturnValue({ select: selecionar });
  const painel = painelAgenteMimo as unknown as (args: unknown) => Promise<{
    painel: { conversas: { qualificacao: string | null }[] };
  }>;
  const result = await painel({ context: { supabase: { from }, userId: "ator-verificado" } });

  expect(from).toHaveBeenCalledWith("mimo_leads");
  expect(filtrar).toHaveBeenCalledWith("empresa_id", "empresa");
  expect(consultar).toHaveBeenCalledWith("id", ["lead-1", "lead-2"]);
  expect(result.painel.conversas.map((c) => c.qualificacao))
    .toEqual(["qualificado", "nao_qualificado", null]);
});
