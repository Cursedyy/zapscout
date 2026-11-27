import { afterEach, beforeEach, it, expect, vi } from "vitest";
import { uazConfirmarChaveAudio, uazSendMenu, TEXTO_MAIS_OPCOES } from "./uazapi.server";
import { uazTranscreverAudio, uazConnect, uazStatus, uazInitInstance, uazSendText, uazSendMedia, uazPresence, uazBaixarImagem, uazBuscarMensagemRecebida, UazApiError, uazLocalizarGrupoQuentes, uazConfirmarGrupoQuentes, uazEnviarGrupoQuentes, uazListarReacoesGrupoQuentes } from "./uazapi.server";
const fetcher = vi.fn();
it("envia botões clicáveis ao mesmo número normalizado do atendimento", async () => {
  fetcher.mockResolvedValue(Response.json({ messageid: "menu-id" }));
  const choices = ["Quero revender|mimo_revenda", "Consumo próprio|mimo_consumo"];
  expect(await uazSendMenu("token", "(11) 99999-9999", "Como posso ajudar?", choices)).toEqual({ id: "menu-id" });
  const [url, req] = fetcher.mock.calls[0];
  expect(url).toBe("https://api.example.invalid/send/menu");
  expect(req.headers.token).toBe("token");
  expect(JSON.parse(req.body)).toMatchObject({
    number: "5511999999999", type: "button", text: "Como posso ajudar?", choices,
  });
});
const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a2ioAAAAASUVORK5CYII=";
it("mostra todas as opções abertas em botões de até três, sem lista escondida", async () => {
  fetcher.mockResolvedValueOnce(Response.json({ messageid: "pergunta-id" }))
    .mockResolvedValueOnce(Response.json({ messageid: "extra-id" }));
  const choices = ["Revenda|r", "Distribuição|d", "Representação|p", "Influência|i", "Consumo|c"];
  expect(await uazSendMenu("token", "5511999999999", "Como posso ajudar?", choices)).toEqual({ id: "pergunta-id" });
  expect(fetcher).toHaveBeenCalledTimes(2);
  const [primeira, segunda] = fetcher.mock.calls.map(([, req]) => JSON.parse(req.body));
  expect(primeira).toMatchObject({ type: "button", text: "Como posso ajudar?", choices: choices.slice(0, 3) });
  expect(primeira).not.toHaveProperty("footerText");
  expect(segunda).toMatchObject({
    type: "button", text: TEXTO_MAIS_OPCOES, choices: choices.slice(3),
    footerText: "Você também pode responder por escrito.",
  });
  for (const corpo of [primeira, segunda]) expect(corpo).not.toHaveProperty("listButton");
});
it("não trata a pergunta já entregue como falha se as opções extras falharem", async () => {
  fetcher.mockResolvedValueOnce(Response.json({ messageid: "pergunta-id" }))
    .mockResolvedValueOnce(new Response("erro", { status: 500 }));
  const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
  const choices = ["A|a", "B|b", "C|c", "D|d"];
  expect(await uazSendMenu("token", "5511999999999", "Pergunta?", choices)).toEqual({ id: "pergunta-id" });
  expect(aviso).toHaveBeenCalled();
  aviso.mockRestore();
});
it("busca o ID exato e só retorna mensagem de entrada", async () => {
  const recebida = { id: "instance:foto-id", messageid: "foto-id", fromMe: false };
  fetcher.mockResolvedValueOnce(Response.json({ messages: [recebida] }))
    .mockResolvedValueOnce(Response.json({ messages: [{ ...recebida, fromMe: true }] }));
  expect(await uazBuscarMensagemRecebida("token-sintetico", "foto-id")).toEqual(recebida);
  expect(await uazBuscarMensagemRecebida("token-sintetico", "foto-id")).toBeNull();
  expect(fetcher.mock.calls[0][0]).toBe("https://api.example.invalid/message/find");
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ id: "foto-id", limit: 2 });
});
it("baixa a imagem da mensagem original e não segue o link devolvido", async () => {
  fetcher.mockResolvedValue(Response.json({ mimetype: "image/png", base64Data: png, fileURL: "https://media.invalid/foto" }));
  const imagem = await uazBaixarImagem("token-sintetico", "instance:foto-id");
  expect(imagem).toEqual({ mime: "image/png", bytes: Uint8Array.from(atob(png), (c) => c.charCodeAt(0)) });
  expect(fetcher).toHaveBeenCalledTimes(1);
  const [url, req] = fetcher.mock.calls[0];
  expect(url).toBe("https://api.example.invalid/message/download");
  expect(req.headers.token).toBe("token-sintetico");
  expect(JSON.parse(req.body)).toEqual({ id: "instance:foto-id", return_base64: true, transcribe: false, download_quoted: false });
});
it.each([
  { mimetype: "application/pdf", base64Data: png },
  { mimetype: "image/jpeg", base64Data: png },
  { mimetype: "image/png", base64Data: "" },
  { mimetype: "image/png", base64Data: "A".repeat(6 * 1024 * 1024) },
])("recusa imagem inválida ou maior que o limite (%#)", async (retornoImagem) => {
  fetcher.mockResolvedValue(Response.json(retornoImagem));
  await expect(uazBaixarImagem("token", "foto-id")).rejects.toThrow(UazApiError);
});
it("cadastra chave somente no corpo da transcrição autenticada e confirma sem retorná-la", async () => {
  fetcher.mockResolvedValueOnce(new Response(JSON.stringify({ mimetype: "audio/ogg", transcription: "teste" })))
    .mockResolvedValueOnce(new Response(JSON.stringify({ instance: { openai_apikey: "chave-sintetica" } })));
  await uazTranscreverAudio("token", "audio-id", "chave-sintetica");
  expect(fetcher.mock.calls[0][0]).toBe("https://api.example.invalid/message/download");
  expect(JSON.parse(fetcher.mock.calls[0][1].body).openai_apikey).toBe("chave-sintetica");
  expect(await uazConfirmarChaveAudio("token", "chave-sintetica")).toBe(true);
  expect(fetcher.mock.calls[1][1]).toMatchObject({ method: "GET", body: undefined });
});
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
it.each(["120363000000000001@g.us", "5511999999999-1234567890@g.us", "120363000000000001", "status@broadcast"])(
  "bloqueia texto, mídia e presença para destino coletivo antigo ou atual: %s", async (numero) => {
    await expect(uazSendText("token", numero, "teste")).rejects.toThrow();
    await expect(uazSendMedia("token", numero, "https://example.invalid/catalogo.pdf")).rejects.toThrow();
    await expect(uazPresence("token", numero, true)).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  },
);
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

it("Digitando usa presença real por tempo limitado, sem enviar mensagem", async () => {
  fetcher.mockImplementation(async () => new Response(JSON.stringify({ response: "ok" })));
  await uazPresence("token-sintetico", "5511999999999", true);
  expect(fetcher.mock.calls[0][0]).toBe("https://api.example.invalid/message/presence");
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ number: "5511999999999", presence: "composing", delay: 15000 });
  await uazPresence("token-sintetico", "5511999999999", false);
  expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({ number: "5511999999999", presence: "paused" });
});

it("localiza somente o grupo exato sem listar participantes", async () => {
  fetcher.mockResolvedValue(
    new Response(
      JSON.stringify({
        groups: [{ JID: "120363000000000001@g.us", Name: "Leads Quentes 🔥" }],
        pagination: { hasMore: false },
      }),
    ),
  );
  expect(await uazLocalizarGrupoQuentes("token")).toBe("120363000000000001@g.us");
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({
    search: "leads quentes",
    limit: 50,
    offset: 0,
    noParticipants: true,
  });
});
it.each(
  [
    [],
    [{ JID: "120363000000000001@g.us", Name: "outro" }],
    [
      { JID: "120363000000000001@g.us", Name: "leads quentes 🔥" },
      { JID: "120363000000000002@g.us", Name: "leads quentes 🔥" },
    ],
  ].map((groups) => ({ groups })),
)("não escolhe grupo ausente ou ambíguo", async ({ groups }) => {
  fetcher.mockResolvedValue(
    new Response(JSON.stringify({ groups, pagination: { hasMore: false } })),
  );
  await expect(uazLocalizarGrupoQuentes("token")).rejects.toThrow("grupo_quentes_");
});
it("envio ao grupo exige confirmação viva da mesma conexão e preserva JID", async () => {
  const jid = "120363000000000001@g.us";
  fetcher
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ JID: jid, Name: "leads quentes 🔥", IsAnnounce: false })),
    )
    .mockResolvedValueOnce(new Response(JSON.stringify({ id: "aceite-grupo" })));
  const g = await uazConfirmarGrupoQuentes("token", jid);
  await expect(uazEnviarGrupoQuentes("outro-token", g, "aviso")).rejects.toThrow("nao_confirmado");
  await expect(uazEnviarGrupoQuentes("token", { ...g }, "aviso")).rejects.toThrow("nao_confirmado");
  expect(await uazEnviarGrupoQuentes("token", g, "aviso")).toEqual({ id: "aceite-grupo" });
  expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({ number: jid, text: "aviso" });
  await expect(uazSendText("token", jid, "aviso")).rejects.toThrow();
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it("não confirma um grupo renomeado ou com ID diferente", async () => {
  fetcher.mockResolvedValue(
    new Response(JSON.stringify({ JID: "120363000000000001@g.us", Name: "outro" })),
  );
  await expect(uazConfirmarGrupoQuentes("token", "120363000000000001@g.us")).rejects.toThrow(
    "divergente",
  );
});

it("atualiza a lista uma vez quando a participação no grupo acaba de mudar", async () => {
  fetcher.mockResolvedValue(
    new Response(
      JSON.stringify({
        groups: [{ jid: "120363000000000001@g.us", name: "leads quentes 🔥" }],
        pagination: { hasMore: false },
      }),
    ),
  );
  expect(await uazLocalizarGrupoQuentes("token", true)).toBe("120363000000000001@g.us");
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({
    search: "leads quentes",
    limit: 50,
    offset: 0,
    noParticipants: true,
    force: true,
  });
});
it("confirma identidade com campos de resumo em minúsculas", async () => {
  fetcher.mockResolvedValue(
    new Response(
      JSON.stringify({ jid: "120363000000000001@g.us", name: "Leads Quentes 🔥", IsAnnounce: false }),
    ),
  );
  expect(await uazConfirmarGrupoQuentes("token", "120363000000000001@g.us")).toEqual({
    jid: "120363000000000001@g.us",
    nome: "Leads Quentes 🔥",
  });
});

it("não confunde o grupo do convite com um grupo sem o emoji",async()=>{fetcher.mockResolvedValue(new Response(JSON.stringify({groups:[{JID:"120363000000000001@g.us",Name:"Leads Quentes"}]})));await expect(uazLocalizarGrupoQuentes("token")).rejects.toThrow("nao_encontrado");});

it("lê apenas reações humanas ao aviso no grupo confirmado e ignora remoções", async () => {
  const jid = "120363000000000001@g.us";
  const em = Date.parse("2026-11-23T16:46:00Z");
  const desde = "2026-11-23T16:44:00Z";
  const base = { chatid: jid, messageTimestamp: em, reaction: "aviso-2" };
  const json = (body: unknown) => new Response(JSON.stringify(body));
  fetcher.mockResolvedValueOnce(json({ JID: jid, Name: "Leads Quentes 🔥" }))
    .mockResolvedValueOnce(json({
      messages: [
        { ...base, messageid: "humana-1", text: "👍" },
        { ...base, messageid: "removida", text: "" },
        { ...base, messageid: "automatica", text: "👍", wasSentByApi: true },
        { ...base, messageid: "outro-chat", chatid: "120363000000000002@g.us", text: "👍" },
        { ...base, messageid: "texto", reaction: "", text: "👍" },
      ],
      pagination: { hasMore: true, nextOffset: 5 },
    })).mockResolvedValueOnce(json({
      messages: [
        { ...base, messageid: "humana-2", content: "{\"text\":\"🐒\"}" },
        { ...base, messageid: "fora-da-fila", messageTimestamp: em-300000, text: "👍" },
      ],
      pagination: { hasMore: true, nextOffset: 7 },
    }));
  const grupo = await uazConfirmarGrupoQuentes("token", jid);
  await expect(uazListarReacoesGrupoQuentes("outro-token", grupo, desde)).rejects.toThrow("nao_confirmado");
  expect(await uazListarReacoesGrupoQuentes("token", grupo, desde)).toEqual([
    { id: "humana-1", alvo: "aviso-2", em }, { id: "humana-2", alvo: "aviso-2", em },
  ]);
  expect(fetcher).toHaveBeenCalledTimes(3);
  expect(fetcher).toHaveBeenLastCalledWith(
    expect.stringContaining("/message/find"),
    expect.objectContaining({ body: JSON.stringify({ chatid: jid, limit: 100, offset: 5 }) }),
  );
});

it("transcrição usa somente ID autenticado e ignora URLs da resposta",async()=>{
 fetcher.mockResolvedValue(new Response(JSON.stringify({mimetype:"audio/ogg",transcription:" Sou Ana ",fileURL:"https://media.invalid/privado"})));
 expect(await uazTranscreverAudio("token","audio-id")).toBe("Sou Ana");
 expect(fetcher).toHaveBeenCalledTimes(1);
 expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({id:"audio-id",transcribe:true,return_base64:false,generate_mp3:false,download_quoted:false});
});
it.each([{mimetype:"audio/ogg",transcription:""},{mimetype:"image/png",transcription:"fala"},{mimetype:"audio/ogg",transcription:42}])("recusa transcrição inválida %s",async value=>{
 fetcher.mockResolvedValue(new Response(JSON.stringify(value)));await expect(uazTranscreverAudio("token","audio-id")).rejects.toThrow(UazApiError);
});
