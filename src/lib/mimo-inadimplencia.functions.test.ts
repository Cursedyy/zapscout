import { beforeEach, expect, it, vi } from "vitest";
import {
  MENSAGEM_OMIE_INDISPONIVEL,
  consultarInadimplenciaMimo,
} from "./mimo-inadimplencia.functions";
import { PERIODO_FIXTURE } from "./mimo-inadimplencia.fixtures";

const f = vi.hoisted(() => ({ acesso: vi.fn(), cfg: vi.fn(), consultar: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let schema: { parse: (v: unknown) => unknown } | undefined;
    const builder = {
      middleware: () => builder,
      inputValidator: (v: typeof schema) => {
        schema = v;
        return builder;
      },
      handler:
        (fn: (args: { context: unknown; data: unknown }) => unknown) =>
        async (args: { context: unknown; data: unknown }) =>
          fn({ ...args, data: schema ? schema.parse(args.data) : args.data }),
    };
    return builder;
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("./mimo-leads.server", () => ({ exigirMimo: f.acesso }));
vi.mock("./mimo-omie.server", () => ({ configOmie: f.cfg }));
vi.mock("./mimo-inadimplencia.server", () => ({ consultarInadimplenciaOmie: f.consultar }));

const empresaId = "10000000-0000-4000-8000-000000000001";
const context = { userId: "20000000-0000-4000-8000-000000000001", supabase: {} };
const chamar = (data: unknown) =>
  (
    consultarInadimplenciaMimo as unknown as (a: {
      context: unknown;
      data: unknown;
    }) => Promise<unknown>
  )({
    context,
    data,
  });

beforeEach(() => {
  vi.resetAllMocks();
  f.acesso.mockResolvedValue({ empresaId, papel: "gestor", usuarioId: context.userId });
  f.cfg.mockReturnValue({ appKey: "k", secret: "s", empresaId, modo: "simulacao" });
  f.consultar.mockResolvedValue({ indiceValor: 10 });
});

it("revalida vínculo ativo a cada chamada e consulta com a configuração do servidor", async () => {
  await expect(chamar(PERIODO_FIXTURE)).resolves.toEqual({
    disponivel: true,
    resultado: { indiceValor: 10 },
  });
  expect(f.acesso).toHaveBeenCalledWith(context.supabase, context.userId);
  expect(f.consultar).toHaveBeenCalledWith(expect.objectContaining({ empresaId }), PERIODO_FIXTURE);
});

it.each(["vendedor", "marketing", "lider_marketing", "administrativo"])(
  "nega %s antes de qualquer consulta ao Omie",
  async (papel) => {
    f.acesso.mockResolvedValue({ empresaId, papel, usuarioId: context.userId });
    await expect(chamar(PERIODO_FIXTURE)).rejects.toThrow(/administração e gestão/);
    expect(f.cfg).not.toHaveBeenCalled();
    expect(f.consultar).not.toHaveBeenCalled();
  },
);

it("propaga a negação de vínculo inativo", async () => {
  f.acesso.mockRejectedValue(Error("Acesso negado."));
  await expect(chamar(PERIODO_FIXTURE)).rejects.toThrow("Acesso negado.");
  expect(f.consultar).not.toHaveBeenCalled();
});

it.each([
  ["sem credenciais", null],
  [
    "credenciais de outra empresa",
    {
      appKey: "k",
      secret: "s",
      empresaId: "30000000-0000-4000-8000-000000000001",
      modo: "simulacao",
    },
  ],
])("informa indisponibilidade honesta quando %s", async (_, cfg) => {
  f.cfg.mockReturnValue(cfg);
  await expect(chamar(PERIODO_FIXTURE)).resolves.toEqual({
    disponivel: false,
    mensagem: MENSAGEM_OMIE_INDISPONIVEL,
  });
  expect(f.consultar).not.toHaveBeenCalled();
});

it("valida o período antes de autenticar no Omie", async () => {
  await expect(chamar({ de: "2026-12-01", ate: "2026-01-01" })).rejects.toThrow();
  expect(f.consultar).not.toHaveBeenCalled();
});
