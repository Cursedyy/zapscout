import { beforeEach, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({ from: vi.fn(), select: vi.fn(), eq: vi.fn(), gte: vi.fn(), lte: vi.fn(), order: vi.fn(), limit: vi.fn(), maybeSingle: vi.fn(), abortSignal: vi.fn() }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from: f.from } }));
import { lerFichaRevendaAgente } from "./mimo-agente-revenda.server";
beforeEach(() => { vi.resetAllMocks(); for (const fn of Object.values(f)) fn.mockReturnValue(f); f.abortSignal.mockResolvedValue({ data: null, error: null }); });
it("consulta a empresa e o telefone canônico com prazo e resultado limitados", async () => {
  await lerFichaRevendaAgente("empresa-a", "551188887777", new Date("2026-11-17T20:00:00Z"));
  expect(f.from).toHaveBeenCalledWith("mimo_revenda_inscricoes");
  expect(f.eq.mock.calls).toEqual([["empresa_id", "empresa-a"], ["telefone", "5511988887777"]]);
  expect(f.limit).toHaveBeenCalledWith(1);
  expect(f.gte).toHaveBeenCalledWith("created_at", "2026-10-18T20:00:00.000Z");
  expect(f.abortSignal).toHaveBeenCalledWith(expect.any(AbortSignal));
});
it("rejeita números inválidos antes de consultar", async () => {
  expect(await lerFichaRevendaAgente("empresa", "12036300001@g.us")).toBeNull();
  expect(f.from).not.toHaveBeenCalled();
});
it("indisponibilidade opcional não bloqueia o encaminhamento existente", async () => {
  f.abortSignal.mockRejectedValue(Error("timeout"));
  expect(await lerFichaRevendaAgente("empresa-a", "5511988887777")).toBeNull();
});
