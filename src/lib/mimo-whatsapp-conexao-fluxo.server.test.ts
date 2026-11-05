import { beforeEach, afterEach, it, expect, vi } from "vitest";
const f = vi.hoisted(() => ({
  status: vi.fn(),
  connect: vi.fn(),
  webhook: vi.fn(),
  init: vi.fn(),
  exigir: vi.fn(),
  from: vi.fn(),
}));
vi.mock("./uazapi.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./uazapi.server")>()),
  uazStatus: f.status,
  uazConnect: f.connect,
  uazUpdateWebhook: f.webhook,
  uazInitInstance: f.init,
}));
vi.mock("./mimo-leads.server", () => ({ exigirMimo: f.exigir }));
vi.mock("./whatsapp.functions", () => ({
  publicWebhookUrl: () => "https://example.invalid/webhook",
}));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from: f.from } }));
import { estadoConexaoMimo, iniciarConexaoMimo } from "./mimo-whatsapp-conexao.server";
import { UazApiError } from "./uazapi.server";
const context = { userId: "ator", supabase: { from: f.from } } as unknown as Parameters<
  typeof iniciarConexaoMimo
>[0];
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("UAZAPI_BASE_URL", "https://api.example.invalid");
  vi.stubEnv("UAZAPI_WEBHOOK_SECRET", "segredo-sintetico");
  f.exigir.mockResolvedValue({ empresaId: "empresa", papel: "administrador" });
  f.from.mockImplementation((table: string) => {
    const result = { data: table === "profiles" ? [{ id: "ator" }] : [], error: null };
    const b: any = {
      select: () => b,
      eq: () => b,
      update: () => b,
      order: async () => result,
      single: async () => ({
        data: { uazapi_instance_token: "token-sintetico", wa_provider: null, wa_method: null },
        error: null,
      }),
      then: (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject),
    };
    return b;
  });
  f.status.mockResolvedValue({ status: "disconnected" });
  f.webhook.mockResolvedValue(undefined);
  f.connect.mockResolvedValue({ status: "connecting", qrcode: "c3ludGhldGlj" });
});
afterEach(() => vi.unstubAllEnvs());
it("configura webhook antes do pareamento e preserva instância cadastrada", async () => {
  expect(await iniciarConexaoMimo(context)).toEqual({
    status: "connecting",
    qrcode: "data:image/png;base64,c3ludGhldGlj",
  });
  expect(f.webhook.mock.invocationCallOrder[0]).toBeLessThan(f.connect.mock.invocationCallOrder[0]);
  expect(f.init).not.toHaveBeenCalled();
});
it("não inicia pareamento quando o webhook falha e distingue a etapa", async () => {
  f.webhook.mockRejectedValue(new UazApiError("http", "/webhook", 401));
  await expect(iniciarConexaoMimo(context)).rejects.toThrow("recebimento");
  expect(f.connect).not.toHaveBeenCalled();
  expect(f.init).not.toHaveBeenCalled();
});
it("retorna QR que ficou pronto posteriormente na consulta de status", async () => {
  f.status.mockResolvedValue({ status: "connecting", qrcode: "c3ludGhldGlj" });
  expect(await estadoConexaoMimo(context)).toMatchObject({
    status: "connecting",
    qrcode: "data:image/png;base64,c3ludGhldGlj",
  });
});
it("status indisponível continua desconhecido e distingue credencial recusada", async () => {
  f.status.mockRejectedValue(new UazApiError("http", "/instance/status", 401));
  const r = await estadoConexaoMimo(context);
  expect(r.status).toBe("unknown");
  expect(r.erro).toContain("HTTP 401");
  expect(r.qrcode).toBeNull();
});
it("sessão já conectada não é reiniciada nem gera nova instância", async () => {
  f.status.mockResolvedValue({ status: "connected" });
  expect(await iniciarConexaoMimo(context)).toEqual({ status: "connected", qrcode: null });
  expect(f.connect).not.toHaveBeenCalled();
  expect(f.init).not.toHaveBeenCalled();
  expect(f.webhook).not.toHaveBeenCalled();
});
