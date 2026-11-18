import { beforeEach, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({ exigir: vi.fn(), configurar: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({ createServerFn: () => {
  const b = { middleware: () => b, inputValidator: () => b, handler: (h: unknown) => h }; return b;
} }));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("./mimo-leads.server", () => ({ exigirMimo: f.exigir }));
vi.mock("./mimo-agente-audio-config.server", () => ({ configurarAudioAgente: f.configurar }));
import { configurarAudioAgenteMimo, chaveAudioSchema } from "./mimo-agente-audio-config.functions";
beforeEach(() => vi.resetAllMocks());
const chave = "sk-" + "x".repeat(40);
const executar = () => (configurarAudioAgenteMimo as unknown as (p: unknown) => Promise<unknown>)({ context: { supabase: {}, userId: "ator" }, data: { chave } });
it.each(["vendedor", "marketing", "administrativo"])("%s não configura credenciais", async papel => {
  f.exigir.mockResolvedValue({ empresaId: "empresa", papel });
  await expect(executar()).rejects.toThrow("Acesso negado"); expect(f.configurar).not.toHaveBeenCalled();
});
it("usa empresa e ator verificados e rejeita campos de destino enviados pelo navegador", async () => {
  f.exigir.mockResolvedValue({ empresaId: "empresa", papel: "gestor" }); f.configurar.mockResolvedValue({ ok: true });
  expect(await executar()).toEqual({ ok: true }); expect(f.configurar).toHaveBeenCalledWith("empresa", "ator", chave, {});
  expect(chaveAudioSchema.safeParse({ chave, empresa: "outra" }).success).toBe(false);
  expect(chaveAudioSchema.safeParse({ chave: "https://example.invalid" }).success).toBe(false);
});
