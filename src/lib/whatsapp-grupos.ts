/** Inspect chat metadata before choosing a participant's phone as a destination. */
const registro = (valor: unknown): Record<string, unknown> =>
  valor !== null && typeof valor === "object" && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : {};
const verdadeiro = (valor: unknown) =>
  valor === true ||
  valor === 1 ||
  (typeof valor === "string" && ["true", "1"].includes(valor.trim().toLowerCase()));

export function destinoColetivoWhatsApp(valor: unknown): boolean {
  if (typeof valor === "string")
    return /@(?:g\.us|broadcast|newsletter)(?:$|[\s:])/i.test(valor.trim());
  const jid = registro(valor);
  return (
    typeof jid.server === "string" &&
    ["g.us", "broadcast", "newsletter"].includes(jid.server.trim().toLowerCase())
  );
}

export function mensagemColetivaWhatsApp(item: unknown, envelope?: unknown): boolean {
  const msg = registro(item),
    contexto = registro(envelope);
  const fontes = [
    msg,
    registro(msg.key),
    registro(msg.chat),
    registro(msg.message),
    contexto,
    registro(contexto.key),
    registro(contexto.chat),
  ];
  return fontes.some(
    (fonte) =>
      ["isGroup", "isgroup", "is_group", "wa_isGroup"].some((chave) => verdadeiro(fonte[chave])) ||
      ["remoteJid", "chatid", "chatId", "chat_id", "wa_chatid", "from", "chat", "jid"].some(
        (chave) => destinoColetivoWhatsApp(fonte[chave]),
      ),
  );
}
