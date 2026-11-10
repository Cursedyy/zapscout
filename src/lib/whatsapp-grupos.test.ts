import { expect, it } from "vitest";
import { destinoColetivoWhatsApp, mensagemColetivaWhatsApp } from "./whatsapp-grupos";
it.each([
  { chatid: "120363000000000001@g.us", sender_pn: "5511999999999@s.whatsapp.net" },
  { key: { remoteJid: "5511999999999@s.whatsapp.net" }, chatid: "120363000000000001@g.us" },
  { isGroup: true, chatid: "5511999999999" },
  { isGroup: "true", chatid: "5511999999999" },
  { is_group: 1, from: "5511999999999" },
  { chat: { wa_isGroup: true, wa_chatid: "120363000000000001@g.us" } },
  { key: { remoteJid: { user: "120363000000000001", server: "g.us" } } },
  { chatid: "status@broadcast" },
])("detecta conversa coletiva sem usar o telefone do participante: %j", (msg) => {
  expect(mensagemColetivaWhatsApp(msg)).toBe(true);
});
it("considera os metadados do chat no envelope autenticado", () => {
  expect(
    mensagemColetivaWhatsApp({ chatid: "5511999999999" }, { chat: { wa_isGroup: true } }),
  ).toBe(true);
});
it("não usa texto nem grupo citado para classificar uma conversa individual", () => {
  expect(
    mensagemColetivaWhatsApp({
      chatid: "5511999999999",
      isGroup: false,
      message: {
        conversation: "nosso grupo",
        contextInfo: { remoteJid: "120363000000000001@g.us" },
      },
    }),
  ).toBe(false);
  expect(destinoColetivoWhatsApp("5511999999999@s.whatsapp.net")).toBe(false);
});
