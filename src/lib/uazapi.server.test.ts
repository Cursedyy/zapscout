import { afterEach, beforeEach, it, expect, vi } from "vitest";
import { uazConnect, uazStatus, uazInitInstance, uazSendText, UazApiError } from "./uazapi.server";
const fetcher = vi.fn();
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("UAZAPI_BASE_URL", "https://api.example.invalid/");
  vi.stubEnv("UAZAPI_ADMIN_TOKEN", "admin-sintetico");
  vi.stubGlobal("fetch", fetcher);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it("pareamento envia JSON vazio e credencial apenas no cabeçalho", async () => {
  fetcher.mockResolvedValue(
    new Response(JSON.stringify({ instance: { status: "connecting", qrcode: "c3ludGhldGlj" } })),
  );
  expect(await uazConnect("instancia-sintetica")).toMatchObject({ qrcode: "c3ludGhldGlj" });
  expect(fetcher.mock.calls[0][0]).toBe("https://api.example.invalid/instance/connect");
  expect(fetcher.mock.calls[0][1]).toMatchObject({
    body: "{}",
    redirect: "manual",
    headers: { token: "instancia-sintetica" },
  });
});
it("mantém GET de status sem corpo", async () => {
  fetcher.mockResolvedValue(
    new Response(
      JSON.stringify({ instance: { status: "connected", profileNumber: "5511999999999" } }),
    ),
  );
  expect((await uazStatus("token")).status).toBe("connected");
  expect(fetcher.mock.calls[0][1]).toMatchObject({ method: "GET", body: undefined });
});
it.each([401, 403, 404, 429, 500])(
  "classifica HTTP %s sem expor resposta sensível",
  async (status) => {
    fetcher.mockResolvedValue(new Response("token-privado e dado-do-cliente", { status }));
    try {
      await uazStatus("token");
      throw Error("expected failure");
    } catch (e) {
      expect(e).toBeInstanceOf(UazApiError);
      expect(e).toMatchObject({ status, tipo: "http" });
      expect((e as Error).message).not.toMatch(/token-privado|dado-do-cliente/);
    }
  },
);
it("não repete mutação quando a rede falha", async () => {
  fetcher.mockRejectedValue(new TypeError("secret"));
  await expect(uazConnect("token")).rejects.toMatchObject({ tipo: "rede" });
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("usa rota atual de criação somente após rota legada não suportada", async () => {
  fetcher
    .mockResolvedValueOnce(new Response("missing", { status: 404 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ token: "nova-sintetica" })));
  expect(await uazInitInstance("teste")).toEqual({ token: "nova-sintetica" });
  expect(fetcher.mock.calls.map((c) => c[0])).toEqual([
    "https://api.example.invalid/instance/init",
    "https://api.example.invalid/instance/create",
  ]);
});
it.each([401, 429, 500])("não tenta criar instância novamente após HTTP %s", async (status) => {
  fetcher.mockResolvedValue(new Response("error", { status }));
  await expect(uazInitInstance("teste")).rejects.toMatchObject({ status });
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("preserva sinal de sessão desconectada para os fluxos de envio existentes", async () => {
  fetcher.mockResolvedValue(new Response("WhatsApp disconnected; dado-privado", { status: 400 }));
  await expect(uazSendText("token", "5511999999999", "teste")).rejects.toThrow(
    "WhatsApp disconnected",
  );
});
it("não interpreta HTML de login como estado desconectado", async () => {
  fetcher.mockResolvedValue(new Response("<html>login</html>"));
  await expect(uazStatus("token")).rejects.toMatchObject({ tipo: "resposta" });
});

it("é compatível com Workers e recusa redirecionamento sem encaminhar tokens", async () => {
  fetcher.mockImplementation(async (_url, init) => {
    if (init.redirect === "error") throw new TypeError("Invalid redirect value");
    return new Response(null, {
      status: 302,
      headers: { location: "https://evil.example.invalid" },
    });
  });
  await expect(uazStatus("token-sintetico")).rejects.toMatchObject({ tipo: "http", status: 302 });
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0][1].redirect).toBe("manual");
});

it.each([
  { status: { connected: true, jid: "5511999999999:12@s.whatsapp.net" } },
  { status: { connected: true, jid: { user: "5511999999999", server: "s.whatsapp.net" } } },
  { instance: { owner: "5511999999999" } },
  { instance: { profileNumber: "5511999999999" } },
])("identifica número em formatos de sessão suportados: %j", async (extra) => {
  fetcher.mockResolvedValue(
    new Response(
      JSON.stringify({
        ...extra,
        instance: { status: "connected", ...extra.instance },
      }),
    ),
  );
  expect(await uazStatus("token")).toMatchObject({
    status: "connected",
    profileNumber: "5511999999999",
  });
});
it("aceita JID textual e owner concordantes sem depender de profileNumber ausente", async () => {
  fetcher.mockResolvedValue(
    new Response(
      JSON.stringify({
        instance: { status: "connected", owner: "5511999999999" },
        status: { connected: true, jid: "5511999999999@s.whatsapp.net" },
      }),
    ),
  );
  expect((await uazStatus("token")).profileNumber).toBe("5511999999999");
});
it("não usa e-mail, grupo ou LID numérico como telefone do remetente", async () => {
  fetcher.mockResolvedValue(
    new Response(
      JSON.stringify({
        instance: { status: "connected", owner: "pessoa@example.invalid" },
        status: { connected: true, jid: "123456789012345@lid" },
      }),
    ),
  );
  expect((await uazStatus("token")).profileNumber).toBeUndefined();
  fetcher.mockResolvedValue(
    new Response(
      JSON.stringify({
        instance: { status: "connected" },
        status: { connected: true, jid: { user: "123456789012345", server: "g.us" } },
      }),
    ),
  );
  expect((await uazStatus("token")).profileNumber).toBeUndefined();
});
it("divergência entre campos de identidade impede confirmação do número", async () => {
  fetcher.mockResolvedValue(
    new Response(
      JSON.stringify({
        instance: { status: "connected", owner: "5511888888888" },
        status: { connected: true, jid: "5511999999999@s.whatsapp.net" },
      }),
    ),
  );
  await expect(uazStatus("token")).rejects.toMatchObject({ tipo: "resposta" });
});

it("preserva telefones formatados legados sem inferir nono dígito", async () => {
  fetcher.mockResolvedValue(
    new Response(
      JSON.stringify({ instance: { status: "connected", profileNumber: "+55 (11) 99999-9999" } }),
    ),
  );
  expect((await uazStatus("token")).profileNumber).toBe("5511999999999");
  fetcher.mockResolvedValue(
    new Response(JSON.stringify({ instance: { status: "connected", owner: "551199999999" } })),
  );
  expect((await uazStatus("token")).profileNumber).toBe("551199999999");
});
