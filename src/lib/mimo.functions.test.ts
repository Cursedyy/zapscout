import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: {}, middleware: vi.fn() }));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: mocks.auth }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    middleware: mocks.middleware.mockImplementation(() => ({ handler: (fn: unknown) => fn })),
  }),
}));

import { obterAcessoMimo } from "./mimo.functions";

type Handler = (input: { context: { supabase: unknown; userId: string; claims: { email: string } } }) => Promise<unknown>;
const executar = obterAcessoMimo as unknown as Handler;

function banco(papel: string | null, ativo = true, erro = false) {
  const filtros: [string, string, unknown][] = [];
  return {
    filtros,
    from: (tabela: string) => {
      const query = {
        select: () => query,
        eq: (campo: string, valor: unknown) => { filtros.push([tabela, campo, valor]); return query; },
        maybeSingle: async () => ({
          error: erro ? { code: "42501" } : null,
          data: tabela === "empresas"
            ? (papel ? { id: "empresa-mimo", nome: "MiMo", ativa: true } : null)
            : tabela === "empresa_membros" ? { papel, ativo } : { nome: "Ana" },
        }),
      };
      return query;
    },
  };
}

describe("servidor MiMo", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each(["administrador", "gestor", "vendedor"])("lê acesso %s usando apenas o usuário autenticado", async (papel) => {
    const supabase = banco(papel);
    const resultado = await executar({ context: { supabase, userId: "usuario-autenticado", claims: { email: "" } } });
    expect(resultado).toEqual({ autorizado: true, empresa: "MiMo", nome: "Ana", papel });
    expect(supabase.filtros).toContainEqual(["empresas", "slug", "mimo"]);
    expect(supabase.filtros).toContainEqual(["empresa_membros", "empresa_id", "empresa-mimo"]);
    expect(supabase.filtros).toContainEqual(["empresa_membros", "user_id", "usuario-autenticado"]);
    expect(supabase.filtros).toContainEqual(["profiles", "id", "usuario-autenticado"]);
  });

  it("não retorna nome nem dados da empresa a usuário sem vínculo", async () => {
    const resultado = await executar({ context: { supabase: banco(null), userId: "sem-vinculo", claims: { email: "" } } });
    expect(resultado).toEqual({ autorizado: false });
  });

  it("nega membro desativado", async () => {
    expect(await executar({ context: { supabase: banco("vendedor", false), userId: "u", claims: { email: "" } } })).toEqual({ autorizado: false });
  });

  it("falha de permissão no banco nunca libera acesso", async () => {
    await expect(executar({ context: { supabase: banco("administrador", true, true), userId: "u", claims: { email: "" } } })).rejects.toThrow("Não foi possível verificar o acesso.");
  });
});