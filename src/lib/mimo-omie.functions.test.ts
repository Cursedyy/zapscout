import { beforeEach, expect, it, vi } from "vitest";
import {
  confirmarCfopMimo,
  consultarOmieMimo,
  prepararCfopMimo,
  statusOmieMimo,
} from "./mimo-omie.functions";
const f = vi.hoisted(() => ({
  acesso: vi.fn(),
  cfg: vi.fn(),
  consultar: vi.fn(),
  versao: vi.fn(),
  ler: vi.fn(),
  rpc: vi.fn(),
  eq: vi.fn(),
}));
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
vi.mock("./mimo-omie.server", () => ({
  configOmie: f.cfg,
  consultarPedidoOmie: f.consultar,
  versaoOmie: f.versao,
}));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { rpc: f.rpc } }));
const empresaId = "10000000-0000-4000-8000-000000000001";
const usuarioId = "20000000-0000-4000-8000-000000000001";
const previaId = "30000000-0000-4000-8000-000000000001";
const hash = "a".repeat(64);
const pedido = {
  cabecalho: { codigo_pedido: 123, numero_pedido: "PV-1" },
  infoCadastro: { faturado: "N", cancelado: "N" },
  det: [
    {
      ide: { codigo_item: 1 },
      produto: { cfop: "5.102", descricao: "Sintético" },
      imposto: { icms: { aliq_icms: 18 } },
    },
  ],
};
const context = {
  userId: usuarioId,
  supabase: {
    from: () => {
      const query = {
        select: () => query,
        eq: f.eq,
        single: f.ler,
        limit: async () => ({ error: null }),
      };
      f.eq.mockReturnValue(query);
      return query;
    },
  },
};
const chamar = (fn: unknown, data?: unknown) =>
  (fn as (args: { context: typeof context; data?: unknown }) => Promise<unknown>)({
    context,
    data,
  });
beforeEach(() => {
  vi.resetAllMocks();
  f.acesso.mockResolvedValue({ empresaId, papel: "administrador", usuarioId });
  f.cfg.mockReturnValue({
    empresaId,
    appKey: "app-sintetico",
    secret: "segredo-sintetico",
    modo: "simulacao",
  });
  f.consultar.mockResolvedValue(pedido);
  f.versao.mockResolvedValue(hash);
  f.ler.mockResolvedValue({
    data: {
      id: previaId,
      pedido_id: 123,
      versao: hash,
      estado: "previa",
      expira_em: "2026-12-01T12:00:00Z",
      mudancas: [{ itemId: 1, anterior: "5.102", novo: "6.102" }],
    },
    error: null,
  });
  f.rpc.mockResolvedValue({ data: previaId, error: null });
});
it.each(["vendedor", "marketing", "administrativo"])(
  "nega todas as operações ao cargo %s antes de consultar o OMIE",
  async (papel) => {
    f.acesso.mockResolvedValue({ empresaId, papel, usuarioId });
    for (const [fn, data] of [
      [statusOmieMimo, undefined],
      [consultarOmieMimo, { pedidoId: 123 }],
      [prepararCfopMimo, { pedidoId: 123, versao: hash, mudancas: [{ itemId: 1, cfop: "6102" }] }],
      [confirmarCfopMimo, { previaId, confirmar: true }],
    ] as const)
      await expect(chamar(fn, data)).rejects.toThrow(/exclusivo/);
    expect(f.consultar).not.toHaveBeenCalled();
    expect(f.rpc).not.toHaveBeenCalled();
  },
);
it("nega associação revogada e credencial de outra empresa", async () => {
  f.acesso.mockRejectedValueOnce(Error("Acesso negado."));
  await expect(chamar(consultarOmieMimo, { pedidoId: 123 })).rejects.toThrow(/Acesso negado/);
  f.cfg.mockReturnValue({ empresaId: "outra" });
  await expect(chamar(consultarOmieMimo, { pedidoId: 123 })).rejects.toThrow(/indisponível/);
  expect(f.consultar).not.toHaveBeenCalled();
});
it("retorna apenas resumo de itens e nenhuma credencial ou bloco de imposto", async () => {
  const r = await chamar(consultarOmieMimo, { pedidoId: 123 });
  expect(r).toEqual({
    pedidoId: 123,
    numero: "PV-1",
    versao: hash,
    editavel: true,
    itens: [{ itemId: 1, descricao: "Sintético", cfop: "5.102" }],
  });
});
it("reconsulta a versão e audita a prévia com ator verificado", async () => {
  await chamar(prepararCfopMimo, {
    pedidoId: 123,
    versao: hash,
    mudancas: [{ itemId: 1, cfop: "6102" }],
  });
  expect(f.rpc).toHaveBeenCalledWith("mimo_omie_preparar", {
    p_empresa: empresaId,
    p_ator: usuarioId,
    p_pedido: 123,
    p_versao: hash,
    p_mudancas: [{ itemId: 1, anterior: "5.102", novo: "6.102" }],
  });
  expect(f.eq).toHaveBeenCalledWith("ator_id", usuarioId);
  expect(f.eq).toHaveBeenCalledWith("empresa_id", empresaId);
});
it("recusa prévia desatualizada e falha de auditoria sem sucesso falso", async () => {
  await expect(
    chamar(prepararCfopMimo, {
      pedidoId: 123,
      versao: "b".repeat(64),
      mudancas: [{ itemId: 1, cfop: "6102" }],
    }),
  ).rejects.toThrow(/mudou/);
  expect(f.rpc).not.toHaveBeenCalled();
  f.rpc.mockResolvedValue({ data: null, error: { message: "detalhe sensível" } });
  await expect(
    chamar(prepararCfopMimo, {
      pedidoId: 123,
      versao: hash,
      mudancas: [{ itemId: 1, cfop: "6102" }],
    }),
  ).rejects.toThrow(/registrar a prévia/);
});
it("confirma somente após reconsulta, com escopo por empresa/ator e auditoria", async () => {
  f.rpc.mockResolvedValue({ data: "simulada", error: null });
  expect(await chamar(confirmarCfopMimo, { previaId, confirmar: true })).toEqual({
    estado: "simulada",
  });
  expect(f.consultar).toHaveBeenCalledTimes(1);
  expect(f.rpc).toHaveBeenCalledWith("mimo_omie_confirmar", {
    p_empresa: empresaId,
    p_ator: usuarioId,
    p_id: previaId,
    p_versao: hash,
  });
  expect(f.eq.mock.calls).toEqual(
    expect.arrayContaining([
      ["empresa_id", empresaId],
      ["ator_id", usuarioId],
      ["id", previaId],
    ]),
  );
});
it("audita a obsolescência, recusa falta de confirmação e aceita repetição já concluída", async () => {
  await expect(chamar(confirmarCfopMimo, { previaId, confirmar: false })).rejects.toThrow();
  expect(f.consultar).not.toHaveBeenCalled();
  f.versao.mockResolvedValue("b".repeat(64));
  f.rpc.mockResolvedValue({ data: "obsoleta", error: null });
  await expect(chamar(confirmarCfopMimo, { previaId, confirmar: true })).rejects.toThrow(
    /expirou ou o pedido mudou/,
  );
  f.ler.mockResolvedValue({ data: { estado: "simulada" }, error: null });
  expect(await chamar(confirmarCfopMimo, { previaId, confirmar: true })).toEqual({
    estado: "simulada",
  });
  expect(f.consultar).toHaveBeenCalledTimes(1);
});
