import { beforeEach, describe, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({ from: vi.fn(), select: vi.fn(), eq: vi.fn(), gte: vi.fn(), lte: vi.fn(), order: vi.fn(), limit: vi.fn(), maybeSingle: vi.fn(), abortSignal: vi.fn() }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from: f.from } }));
import { lerFichaRevendaAgente } from "./mimo-agente-revenda.server";
import { revendaSchema } from "./mimo-revenda";
beforeEach(() => { vi.resetAllMocks(); for (const fn of Object.values(f)) fn.mockReturnValue(f); f.maybeSingle.mockResolvedValue({ data: null, error: null }); });
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
  f.maybeSingle.mockRejectedValue(Error("timeout"));
  expect(await lerFichaRevendaAgente("empresa-a", "5511988887777")).toBeNull();
});
describe("vínculo da ficha com o lead", () => {
  const agora = new Date("2026-11-17T20:00:00Z");
  const id = "00000000-0000-4000-8000-000000000001";
  const respostas = revendaSchema.parse({ envio_id: id, interesse: "revenda", canal: "loja", cidade: "Cidade de Teste", uf: "RJ", investimento: "sim", prazo: "pesquisando", nome: "Cliente Sintético", whatsapp: "11988887777", consentimento: true });
  const ficha = { id, empresa_id: "empresa-a", lead_id: "lead-a", telefone: "5511988887777", respostas: { ...respostas, whatsapp: "5511988887777" }, minimo_centavos: 150000, created_at: "2026-11-17T19:59:00Z" };
  const lead = (telefone_normalizado: string | null) => f.maybeSingle
    .mockResolvedValueOnce({ data: ficha, error: null })
    .mockResolvedValueOnce({ data: { telefone_normalizado }, error: null });
  it("usa a ficha enquanto o lead ainda tem o telefone (com ou sem o 9)", async () => {
    lead("551188887777");
    expect((await lerFichaRevendaAgente("empresa-a", "5511988887777", agora))?.id).toBe(id);
    expect(f.from).toHaveBeenLastCalledWith("mimo_leads");
    expect(f.eq).toHaveBeenCalledWith("id", "lead-a");
  });
  it("ignora a ficha antiga quando o telefone do lead foi apagado ou trocado", async () => {
    lead(null);
    expect(await lerFichaRevendaAgente("empresa-a", "5511988887777", agora)).toBeNull();
    lead("5521977776666");
    expect(await lerFichaRevendaAgente("empresa-a", "5511988887777", agora)).toBeNull();
  });
});
