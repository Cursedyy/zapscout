import { beforeEach, expect, it, vi } from "vitest";
import {
  MENSAGEM_OMIE_INDISPONIVEL_REPRESENTANTES,
  faturamentoOmieRepresentantesComerciais,
} from "./mimo-representantes-comerciais.functions";
import { PERIODO_OMIE, R_SEC, U_MANUAL, U_PR } from "./mimo-representantes-omie.fixtures";

const f = vi.hoisted(() => ({ acesso: vi.fn(), cfg: vi.fn(), consultar: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validar: ((v: unknown) => unknown) | undefined;
    const builder = {
      middleware: () => builder,
      inputValidator: (v: (v: unknown) => unknown) => {
        validar = v;
        return builder;
      },
      handler:
        (fn: (args: { context: unknown; data: unknown }) => unknown) =>
        async (args: { context: unknown; data: unknown }) =>
          fn({ ...args, data: validar ? validar(args.data) : args.data }),
    };
    return builder;
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("./mimo-leads.server", () => ({ exigirMimo: f.acesso }));
vi.mock("./mimo-omie.server", () => ({ configOmie: f.cfg }));
vi.mock("./mimo-representantes-omie.server", () => ({ consultarFaturamentoOmie: f.consultar }));

const empresaId = "10000000-0000-4000-8000-000000000001";
const tabelas: Record<string, unknown[]> = {
  mimo_rep_comerciais: [],
  mimo_rep_comerciais_territorios: [],
  mimo_rep_comerciais_clientes: [
    { unidade_id: U_MANUAL, representante_id: R_SEC },
    { unidade_id: U_PR, representante_id: null },
  ],
  mimo_carteira_unidades: [
    { id: U_MANUAL, nome: "Loja", cidade: "", uf: "PR", cnpj: "11222333000181" },
  ],
};
const consultasTabela: Array<{ tabela: string; filtros: unknown[][] }> = [];
/** Supabase sintético: cada consulta encadeável resolve com as linhas da tabela. */
const supabase = {
  from(tabela: string) {
    const registro = { tabela, filtros: [] as unknown[][] };
    consultasTabela.push(registro);
    const q: Record<string, unknown> = {};
    for (const m of ["select", "eq", "order", "limit", "range", "in"])
      q[m] = (...args: unknown[]) => {
        registro.filtros.push([m, ...args]);
        return q;
      };
    q.then = (ok: (v: unknown) => unknown, erro: (e: unknown) => unknown) =>
      Promise.resolve({ data: tabelas[tabela] ?? [], error: null }).then(ok, erro);
    return q;
  },
};
const context = { userId: "20000000-0000-4000-8000-000000000001", supabase };
const chamar = (data: unknown) =>
  (
    faturamentoOmieRepresentantesComerciais as unknown as (a: {
      context: unknown;
      data: unknown;
    }) => Promise<unknown>
  )({ context, data });

beforeEach(() => {
  vi.resetAllMocks();
  consultasTabela.length = 0;
  f.acesso.mockResolvedValue({ empresaId, papel: "gestor", usuarioId: context.userId });
  f.cfg.mockReturnValue({ appKey: "k", secret: "s", empresaId, modo: "simulacao" });
  f.consultar.mockResolvedValue({ total: { faturamento: 1 } });
});

it("revalida o papel e consulta o Omie com a base e o CNPJ das unidades manuais", async () => {
  await expect(chamar(PERIODO_OMIE)).resolves.toEqual({
    disponivel: true,
    resultado: { total: { faturamento: 1 } },
  });
  expect(f.acesso).toHaveBeenCalledWith(supabase, context.userId);
  const [cfg, periodo, base] = f.consultar.mock.calls[0];
  expect(cfg).toMatchObject({ empresaId });
  expect(periodo).toEqual(PERIODO_OMIE);
  expect(base.unidadesManuais).toEqual([{ unidade_id: U_MANUAL, cnpj: "11222333000181" }]);
  // CNPJ lido só para as unidades com atribuição manual, na empresa do vínculo.
  const cnpj = consultasTabela.find((c) =>
    c.filtros.some((x) => x[0] === "select" && x[1] === "id,cnpj"),
  );
  expect(cnpj?.filtros).toContainEqual(["eq", "empresa_id", empresaId]);
  expect(cnpj?.filtros).toContainEqual(["in", "id", [U_MANUAL]]);
});

it.each(["vendedor", "marketing", "lider_marketing", "administrativo"])(
  "nega %s antes de qualquer consulta ao Omie",
  async (papel) => {
    f.acesso.mockResolvedValue({ empresaId, papel, usuarioId: context.userId });
    await expect(chamar(PERIODO_OMIE)).rejects.toThrow("Acesso negado.");
    expect(f.cfg).not.toHaveBeenCalled();
    expect(f.consultar).not.toHaveBeenCalled();
  },
);

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
  await expect(chamar(PERIODO_OMIE)).resolves.toEqual({
    disponivel: false,
    mensagem: MENSAGEM_OMIE_INDISPONIVEL_REPRESENTANTES,
  });
  expect(f.consultar).not.toHaveBeenCalled();
});

it("valida o período (máximo de um ano) antes de consultar", async () => {
  await expect(chamar({ de: "2025-01-01", ate: "2026-11-27" })).rejects.toThrow();
  expect(f.acesso).not.toHaveBeenCalled();
  expect(f.consultar).not.toHaveBeenCalled();
});

it("propaga erros do Omie sem transformar em zero", async () => {
  f.consultar.mockRejectedValue(Error("O Omie recusou as credenciais configuradas."));
  await expect(chamar(PERIODO_OMIE)).rejects.toThrow(/credenciais/);
});
