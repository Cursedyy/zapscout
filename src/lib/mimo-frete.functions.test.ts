import { beforeEach, expect, it, vi } from "vitest";
import { CATALOGO, itemDeProduto, novoPedido, sugerirCaixas } from "./mimo-pedido";
const f = vi.hoisted(() => ({
  exigir: vi.fn(),
  from: vi.fn(),
  privado: vi.fn(),
  tira: vi.fn(),
  frenet: vi.fn(),
  configFrenet: vi.fn(),
  jadlog: vi.fn(),
  configJadlog: vi.fn(),
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const b = { middleware: () => b, inputValidator: () => b, handler: (h: unknown) => h };
    return b;
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("./mimo-leads.server", () => ({ exigirMimo: f.exigir }));
vi.mock("./mimo-pedido-db", () => ({ tiraClient: f.tira }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from: f.privado } }));
vi.mock("./mimo-frenet.server", () => ({ configFrenet: f.configFrenet, cotarFrenet: f.frenet }));
vi.mock("./mimo-jadlog.server", () => ({ configJadlog: f.configJadlog, cotarJadlog: f.jadlog }));
import { cotarFreteMimo } from "./mimo-frete.functions";
function query(data: unknown, error: unknown = null) {
  const q = {
    select: vi.fn(() => q),
    eq: vi.fn(() => q),
    single: vi.fn(async () => ({ data, error })),
    maybeSingle: vi.fn(async () => ({ data, error })),
  };
  return q;
}
const pedido = () => {
  const itens = [itemDeProduto(CATALOGO.find((x) => x.codigo === "M001")!)];
  return {
    ...novoPedido(),
    leadId: "10000000-0000-4000-8000-000000000001",
    destinoCep: "66010000",
    endereco: "Destino sintético",
    declarado: 10000,
    itens,
    volumes: sugerirCaixas(itens).map((v) => ({ ...v, confirmado: true })),
  };
};
const executar = (p = pedido(), extra = {}) =>
  (cotarFreteMimo as unknown as (x: unknown) => Promise<any>)({
    context: { userId: "ator-verificado", supabase: { from: f.from } },
    data: { pedido: p, ...extra },
  });
beforeEach(() => {
  vi.resetAllMocks();
  f.exigir.mockResolvedValue({ empresaId: "empresa", papel: "vendedor" });
  f.from.mockReturnValue(query({ id: pedido().leadId }));
  f.privado.mockReturnValue(query(null));
  f.tira.mockImplementation((client) => client);
  f.configFrenet.mockReturnValue({ token: "sintetico" });
  f.frenet.mockResolvedValue([]);
});
it.each(["administrador", "gestor", "vendedor", "administrativo"])(
  "%s usa a conta da empresa e a identidade verificada",
  async (papel) => {
    f.exigir.mockResolvedValue({ empresaId: "empresa", papel });
    const result = await executar(pedido(), { empresaId: "outra", userId: "forjado" });
    expect(result.provedor).toBe("frenet");
    expect(f.frenet).toHaveBeenCalledWith(
      expect.anything(),
      { token: "sintetico" },
      "empresa",
      "ator-verificado",
    );
    expect(f.jadlog).not.toHaveBeenCalled();
  },
);
it("marketing é recusado antes de consultar cliente ou credencial", async () => {
  f.exigir.mockResolvedValue({ empresaId: "empresa", papel: "marketing" });
  await expect(executar()).rejects.toThrow("Acesso negado");
  expect(f.from).not.toHaveBeenCalled();
  expect(f.configFrenet).not.toHaveBeenCalled();
});
it("RLS do cliente e do pedido é conferida antes de ler dados privados ou cotar", async () => {
  f.from.mockReturnValue(query(null, { code: "denied" }));
  await expect(executar()).rejects.toThrow("Cliente indisponível");
  expect(f.privado).not.toHaveBeenCalled();
  expect(f.frenet).not.toHaveBeenCalled();
  f.from
    .mockReturnValueOnce(query({ id: pedido().leadId }))
    .mockReturnValueOnce(query(null, { code: "denied" }));
  await expect(executar(pedido(), { id: "10000000-0000-4000-8000-000000000002" })).rejects.toThrow(
    "Pedido indisponível",
  );
  expect(f.privado).not.toHaveBeenCalled();
  expect(f.frenet).not.toHaveBeenCalled();
});
it("recusa caixa com dimensões adulteradas antes de fazer uma cotação", async () => {
  const p = pedido();
  p.volumes[0].tipoCaixa = { nome: "Falsa", dimensoes: [1, 1, 1], displays: 100, misturinhas: 100 };
  await expect(executar(p)).rejects.toThrow();
  expect(f.frenet).not.toHaveBeenCalled();
});
it("erro Frenet não vira cotação Jadlog disfarçada", async () => {
  f.frenet.mockRejectedValue(Error("Frenet indisponível"));
  await expect(executar()).rejects.toThrow("Frenet indisponível");
  expect(f.jadlog).not.toHaveBeenCalled();
});
it("preserva o provedor anterior enquanto a conta Frenet não foi criada", async () => {
  f.configFrenet.mockReturnValue(null);
  f.configJadlog.mockReturnValue({ chaveAssinatura: "sintetica" });
  f.jadlog.mockResolvedValue([]);
  expect((await executar()).provedor).toBe("jadlog");
  expect(f.frenet).not.toHaveBeenCalled();
});
