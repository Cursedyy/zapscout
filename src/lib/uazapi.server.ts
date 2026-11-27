/**
 * UAZAPI HTTP client (server-only).
 * Docs: https://docs.uazapi.com/
 *
 * Endpoints usados:
 *  - POST {base}/instance/init  (admintoken)  → cria instância, retorna { token }
 *  - POST {base}/instance/connect (token)     → retorna QR code base64
 *  - GET  {base}/instance/status  (token)     → { instance: { status: connected|connecting|... , profileName, profileNumber } }
 *  - POST {base}/send/text       (token)      → { number, text }
 *  - POST {base}/send/media      (token)      → { number, type, file (URL ou base64), text? }
 *  - POST {base}/webhook (token) → { url, events, enabled }
 *  - POST {base}/instance/disconnect (token)
 */

import { destinoColetivoWhatsApp } from "./whatsapp-grupos";
import { TEXTO_MAIS_OPCOES } from "./mimo-agente-opcoes";

export class UazApiError extends Error {
  constructor(
    readonly tipo: "http" | "rede" | "tempo" | "configuracao" | "resposta",
    readonly operacao: string,
    readonly status?: number,
    desconectado = false,
  ) {
    super(
      `UAZAPI ${operacao}${status ? ` [${status}]` : ""}: ${desconectado ? "WhatsApp disconnected" : tipo}`,
    );
  }
}
const baseUrl = () => {
  const u = process.env.UAZAPI_BASE_URL;
  if (!u?.trim()) throw new UazApiError("configuracao", "servidor");
  return u.trim().replace(/\/+$/, "");
};

const adminToken = () => {
  const t = process.env.UAZAPI_ADMIN_TOKEN;
  if (!t) throw new UazApiError("configuracao", "credencial administrativa");
  return t;
};

async function lerRespostaLimitada(res: Response, limite: number, operacao: string) {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  let total = 0;
  let texto = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return texto + decoder.decode();
      total += value.byteLength;
      if (total > limite) {
        await reader.cancel().catch(() => {});
        throw new UazApiError("resposta", operacao);
      }
      texto += decoder.decode(value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }
}

async function call<T = unknown>(
  path: string,
  opts: {
    method?: "GET" | "POST";
    token?: string;
    useAdmin?: boolean;
    body?: unknown;
    signal?: AbortSignal;
    limiteResposta?: number;
  } = {},
): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.useAdmin) headers["admintoken"] = adminToken();
  if (opts.token) headers["token"] = opts.token;

  const url = `${baseUrl()}${path}`;
  const signal = opts.signal ?? AbortSignal.timeout(15000);
  let res: Response, text: string;
  try {
    res = await fetch(url, {
      method: opts.method ?? "POST",
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal,
      redirect: "manual",
    });
    text = opts.limiteResposta
      ? await lerRespostaLimitada(res, opts.limiteResposta, path)
      : await res.text();
  } catch (erro) {
    if (erro instanceof UazApiError) throw erro;
    throw new UazApiError(signal.aborted ? "tempo" : "rede", path);
  }
  if (res.status >= 300 && res.status < 400) {
    throw new UazApiError("http", path, res.status);
  }
  if (!res.ok) {
    const desconectado =
      /whatsapp\s+disconnected|session\s+is\s+not\s+reconnectable|not\s+connected|instance\s+disconnected|connection\s+closed/i.test(
        text,
      );
    throw new UazApiError("http", path, res.status, desconectado);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as unknown as T;
  }
}

export async function uazInitInstance(name: string): Promise<{ token: string }> {
  type Init = { token?: string; instance?: { token?: string } };
  let data: Init;
  try {
    data = await call<Init>("/instance/init", { useAdmin: true, body: { name } });
  } catch (error) {
    if (!(error instanceof UazApiError) || ![404, 405].includes(error.status ?? 0)) throw error;
    data = await call<Init>("/instance/create", { useAdmin: true, body: { name } });
  }
  const token = data.token ?? data.instance?.token;
  if (typeof token !== "string" || !token) throw new UazApiError("resposta", "criar instância");
  return { token };
}

export type ImagemWhatsApp = {
  bytes: Uint8Array;
  mime: "image/jpeg" | "image/png" | "image/webp";
};

export async function uazBuscarMensagemRecebida(token: string, messageId: string) {
  if (!messageId || messageId.length > 200) throw new UazApiError("resposta", "buscar mensagem");
  const r = await call<{ messages?: unknown }>("/message/find", {
    token, body: { id: messageId, limit: 2 },
    signal: AbortSignal.timeout(7000), limiteResposta: 96 * 1024,
  });
  if (!Array.isArray(r?.messages) || r.messages.length !== 1) return null;
  const m = r.messages[0] as Record<string, unknown> | null;
  return m?.fromMe === false && (m.id === messageId || m.messageid === messageId) ? m : null;
}

const limiteImagemBytes = 4 * 1024 * 1024;
const limiteImagemBase64 = 4 * Math.ceil(limiteImagemBytes / 3);

export async function uazBaixarImagem(token: string, messageId: string): Promise<ImagemWhatsApp> {
  const invalida = () => new UazApiError("resposta", "baixar imagem");
  if (!messageId || messageId.length > 200) throw invalida();
  const r = await call<{ base64Data?: unknown; mimetype?: unknown }>("/message/download", {
    token,
    body: { id: messageId, return_base64: true, transcribe: false, download_quoted: false },
    signal: AbortSignal.timeout(12000),
    limiteResposta: limiteImagemBase64 + 8192,
  });
  const mime = typeof r?.mimetype === "string" ? r.mimetype.trim().toLowerCase() : "";
  if (mime !== "image/jpeg" && mime !== "image/png" && mime !== "image/webp") throw invalida();
  const base64 = r?.base64Data;
  if (typeof base64 !== "string" || !base64 || base64.length > limiteImagemBase64) throw invalida();
  let binario: string;
  try {
    binario = atob(base64);
  } catch {
    throw invalida();
  }
  if (binario.length > limiteImagemBytes) throw invalida();
  const assinaturaValida = mime === "image/jpeg"
    ? binario.startsWith("\xff\xd8\xff")
    : mime === "image/png"
      ? binario.startsWith("\x89PNG\r\n\x1a\n")
      : binario.startsWith("RIFF") && binario.slice(8, 12) === "WEBP";
  if (!assinaturaValida) throw invalida();
  return { bytes: Uint8Array.from(binario, (caractere) => caractere.charCodeAt(0)), mime };
}

/** Transcribe by authenticated message ID; never fetch a URL supplied by a contact. */
export async function uazTranscreverAudio(token: string, messageId: string, chave?: string): Promise<string> {
  if (!messageId || messageId.length > 200) throw new UazApiError("resposta", "transcrever áudio");
  const r = await call<{ transcription?: unknown; mimetype?: unknown }>("/message/download", {
    token,
    body: { id: messageId, transcribe: true, return_base64: false, generate_mp3: false, download_quoted: false, ...(chave ? { openai_apikey: chave } : {}) },
    signal: AbortSignal.timeout(20000),
  });
  if (typeof r.transcription !== "string" || !r.transcription.trim() || r.transcription.length > 8000 ||
      typeof r.mimetype !== "string" || !r.mimetype.toLowerCase().startsWith("audio/")) {
    throw new UazApiError("resposta", "transcrever áudio");
  }
  return r.transcription.trim();
}

export async function uazConfirmarChaveAudio(token: string, chave: string): Promise<boolean> {
  const r = await call<{ instance?: { openai_apikey?: unknown } }>("/instance/status", { method: "GET", token });
  return typeof r?.instance?.openai_apikey === "string" && r.instance.openai_apikey === chave;
}

export type UazStatus = {
  status: "disconnected" | "connecting" | "connected" | string;
  qrcode?: string; // base64 (data:image/png;base64,...)
  profileNumber?: string;
  profileName?: string;
};

export async function uazConnect(token: string): Promise<UazStatus> {
  const data = await call<{ qrcode?: string; instance?: { status?: string; qrcode?: string } }>(
    "/instance/connect",
    { token, body: {} },
  );
  if (!data || typeof data !== "object") throw new UazApiError("resposta", "pareamento");
  return {
    status: data.instance?.status ?? "connecting",
    qrcode: data.qrcode ?? data.instance?.qrcode,
  };
}

function numeroIdentidadeUazapi(valor: unknown): string | undefined {
  if (typeof valor !== "string") return undefined;
  const texto = valor.trim();
  const partes = texto.split("@");
  if (partes.length > 2 || (partes[1] && !["s.whatsapp.net", "c.us"].includes(partes[1])))
    return undefined;
  const identificador = partes[0].split(":")[0];
  if (!/^\+?[0-9 ()-]+$/.test(identificador)) return undefined;
  const numero = identificador.replace(/[+ ()-]/g, "");
  return /^[1-9]\d{9,14}$/.test(numero) ? numero : undefined;
}
export async function uazStatus(token: string, signal?: AbortSignal): Promise<UazStatus> {
  const data = await call<{
    instance?: {
      status?: string;
      profileNumber?: string;
      profileName?: string;
      qrcode?: string;
      owner?: string;
    };
    status?: { connected?: boolean; jid?: string | { user?: string; server?: string } | null };
  }>("/instance/status", { method: "GET", token, signal });
  if (!data || typeof data !== "object") throw new UazApiError("resposta", "status");
  const i = data.instance ?? {};
  const jid = data.status?.jid;
  const numeroJid =
    typeof jid === "string"
      ? numeroIdentidadeUazapi(jid)
      : jid && (!jid.server || ["s.whatsapp.net", "c.us"].includes(jid.server))
        ? numeroIdentidadeUazapi(jid.user)
        : undefined;
  const numeros = [
    ...new Set(
      [numeroJid, numeroIdentidadeUazapi(i.profileNumber), numeroIdentidadeUazapi(i.owner)].filter(
        (n): n is string => !!n,
      ),
    ),
  ];
  if (numeros.length > 1) throw new UazApiError("resposta", "identidade da instância");
  return {
    status:
      (i.status as UazStatus["status"]) ?? (data.status?.connected ? "connected" : "disconnected"),
    qrcode: i.qrcode,
    profileNumber: numeros[0],
    profileName: i.profileName,
  };
}

export async function uazDisconnect(token: string): Promise<void> {
  await call("/instance/disconnect", { token });
}

/**
 * Garante prefixo 55 (código Brasil) para números locais de 10/11 dígitos.
 * UAZAPI pode rejeitar ou entregar errado quando o número vai sem DDI.
 */
export function normalizeBrWhatsappNumber(raw: string): string {
  if (destinoColetivoWhatsApp(raw)) throw Error("Envios para grupos não são permitidos.");
  const d = raw.replace(/\D+/g, "");
  // Numeric group IDs from old queues must not be sent as if they were phone numbers.
  if (!/^[1-9]\d{7,14}$/.test(d)) throw Error("Número de WhatsApp inválido.");
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) return d;
  if (d.length === 10 || d.length === 11) return `55${d}`;
  return d;
}

export async function uazSendText(
  token: string,
  number: string,
  text: string,
  opts: { delay?: number } = {},
): Promise<{ id?: string }> {
  const clean = normalizeBrWhatsappNumber(number);
  // `delay` (ms): a UAZAPI mostra "digitando..." ao contato durante a espera.
  const body: Record<string, unknown> = { number: clean, text };
  if (opts.delay && opts.delay > 0) body.delay = Math.round(opts.delay);
  const data = await call<{ messageid?: string; id?: string; key?: { id?: string } }>(
    "/send/text",
    { token, body },
  );
  return { id: data.messageid ?? data.id ?? data.key?.id };
}

export { TEXTO_MAIS_OPCOES };
const RODAPE_MENU = "Você também pode responder por escrito.";

/** WhatsApp shows at most 3 reply buttons per message; a list hides options behind
 * "Ver opções". To keep every option visible, choices are split into button messages
 * of up to 3. The first carries the question and its id is returned. A later chunk
 * failing after the question was delivered is logged, not thrown, so an accepted
 * question is never treated as unsent (the lead can still answer in writing). */
export async function uazSendMenu(token: string, number: string, text: string, choices: string[]) {
  const destino = normalizeBrWhatsappNumber(number);
  const grupos: string[][] = [];
  for (let i = 0; i < choices.length; i += 3) grupos.push(choices.slice(i, i + 3));
  const enviar = (texto: string, opcoes: string[], ultimo: boolean) =>
    call<{ messageid?: string; id?: string }>("/send/menu", {
      token,
      body: {
        number: destino,
        text: texto,
        type: "button",
        choices: opcoes,
        ...(ultimo ? { footerText: RODAPE_MENU } : {}),
      },
    });
  const data = await enviar(text, grupos[0] ?? [], grupos.length <= 1);
  for (let i = 1; i < grupos.length; i++) {
    try {
      await enviar(TEXTO_MAIS_OPCOES, grupos[i], i === grupos.length - 1);
    } catch (e) {
      console.warn("uazSendMenu: opções complementares não enviadas", e instanceof Error ? e.message : e);
      break;
    }
  }
  return { id: data.messageid ?? data.id };
}

/** Independent, bounded chat presence; never couples typing to a delayed send.
 * Contract: https://docs.uazapi.com/openapi-bundled.json#/paths/~1message~1presence
 */
export async function uazPresence(token: string, number: string, ativa: boolean): Promise<void> {
  await call("/message/presence", { token, signal: AbortSignal.timeout(4000),
    body: { number: normalizeBrWhatsappNumber(number), presence: ativa ? "composing" : "paused", ...(ativa ? { delay: 15000 } : {}) } });
}

const jidGrupoInterno = /^\d{5,25}(?:-\d{5,20})?@g\.us$/;
const nomeGrupoQuentes = (nome: string) =>
  nome.trim().toLocaleLowerCase("pt-BR") === "leads quentes 🔥";
type GrupoQuentes = { jid: string; nome: string };
const gruposQuentesConfirmados = new WeakMap<GrupoQuentes, string>();
/** Only the owner-requested internal group is eligible. No participants are listed. */
export async function uazLocalizarGrupoQuentes(token: string, atualizar = false): Promise<string> {
  const r = await call<{
    groups?: { JID?: string; Name?: string; jid?: string; name?: string }[];
    pagination?: { hasMore?: boolean };
  }>("/group/list", {
    token,
    body: {
      search: "leads quentes",
      limit: 50,
      offset: 0,
      noParticipants: true,
      ...(atualizar ? { force: true } : {}),
    },
  });
  if (!Array.isArray(r.groups)) throw Error("grupo_quentes_resposta_invalida");
  const encontrados = r.groups
    .map((g) => ({ JID: g.JID ?? g.jid, Name: g.Name ?? g.name }))
    .filter(
      (g) =>
        typeof g.Name === "string" &&
        nomeGrupoQuentes(g.Name) &&
        typeof g.JID === "string" &&
        jidGrupoInterno.test(g.JID),
    );
  if (r.pagination?.hasMore || encontrados.length > 1) throw Error("grupo_quentes_ambiguo");
  if (encontrados.length !== 1) throw Error("grupo_quentes_nao_encontrado");
  return encontrados[0].JID!;
}
export async function uazConfirmarGrupoQuentes(token: string, jid: string): Promise<GrupoQuentes> {
  if (!jidGrupoInterno.test(jid)) throw Error("grupo_quentes_invalido");
  const bruto = await call<{
    JID?: string;
    Name?: string;
    jid?: string;
    name?: string;
    IsAnnounce?: boolean;
    Participants?: { JID?: string; IsAdmin?: boolean }[];
  }>("/group/info", { token, body: { groupjid: jid } });
  const g = { ...bruto, JID: bruto.JID ?? bruto.jid, Name: bruto.Name ?? bruto.name };
  if (g.JID !== jid || !g.Name || !nomeGrupoQuentes(g.Name))
    throw Error("grupo_quentes_identidade_divergente");
  if (g.IsAnnounce) {
    const s = await uazStatus(token);
    const numero = s.profileNumber?.replace(/\D/g, "");
    if (
      s.status !== "connected" ||
      !numero ||
      !g.Participants?.some((p) => p.IsAdmin && p.JID?.split("@")[0].split(":")[0] === numero)
    )
      throw Error("grupo_quentes_sem_permissao");
  }
  const grupo = Object.freeze({ jid, nome: g.Name });
  gruposQuentesConfirmados.set(grupo, token);
  return grupo;
}
/** Separate capability-bound transport; ordinary campaign/AI sends still reject groups. */
export async function uazEnviarGrupoQuentes(
  token: string,
  grupo: GrupoQuentes,
  texto: string,
): Promise<{ id?: string }> {
  if (gruposQuentesConfirmados.get(grupo) !== token || !jidGrupoInterno.test(grupo.jid))
    throw Error("grupo_quentes_nao_confirmado");
  const r = await call<{ messageid?: string; id?: string; key?: { id?: string } }>("/send/text", {
    token,
    body: { number: grupo.jid, text: texto },
  });
  return { id: r.messageid ?? r.id ?? r.key?.id };
}

// The provider exposes the reacted message ID on a reaction's own message record.
export async function uazListarReacoesGrupoQuentes(token: string, grupo: GrupoQuentes, desde: string) {
  if (gruposQuentesConfirmados.get(grupo) !== token || !jidGrupoInterno.test(grupo.jid))
    throw Error("grupo_quentes_nao_confirmado");
  const inicio = Date.parse(desde) - 1000;
  if (!Number.isFinite(inicio)) throw Error("grupo_quentes_data_invalida");

  const limite = 100, signal = AbortSignal.timeout(10000);
  const idValido = /^[a-zA-Z0-9_.:-]{1,200}$/;
  const emoji = /[\p{Extended_Pictographic}\p{Regional_Indicator}\u20e3]/u;
  const reacoes = new Map<string, { id: string; alvo: string; em: number }>();
  let offset = 0;
  for (let pagina = 0; pagina < 5; pagina++) {
    const r = await call<{
      messages?: unknown;
      pagination?: { hasMore?: boolean; nextOffset?: number };
    }>("/message/find", {
      token, signal, limiteResposta: 2_000_000,
      body: { chatid: grupo.jid, limit: limite, offset },
    });
    if (!Array.isArray(r?.messages)) throw Error("grupo_quentes_resposta_invalida");

    let passouDoInicio = false;
    for (const m of r.messages) {
      if (!m || typeof m !== "object" || m.chatid !== grupo.jid || !Number.isSafeInteger(m.messageTimestamp))
        continue;
      if (m.messageTimestamp < inicio) {
        passouDoInicio = true;
        continue;
      }
      if (m.wasSentByApi === true || typeof m.reaction !== "string" || !idValido.test(m.reaction))
        continue;
      const id = m.messageid || m.id;
      if (typeof id !== "string" || !idValido.test(id)) continue;
      let conteudo = m.content;
      if (typeof conteudo === "string" && conteudo.startsWith("{")) {
        try { conteudo = JSON.parse(conteudo); } catch { conteudo = undefined; }
      }
      const texto = [m.text, conteudo?.text, conteudo?.Text, conteudo]
        .find(t => typeof t === "string" && t.length <= 32 && emoji.test(t));
      if (texto) reacoes.set(id, { id, alvo: m.reaction, em: m.messageTimestamp });
    }

    const proximo = r.pagination?.nextOffset;
    if (passouDoInicio || r.pagination?.hasMore === false || r.messages.length === 0) break;
    if (typeof proximo === "number" && Number.isSafeInteger(proximo) && proximo > offset) {
      offset = proximo;
    } else if (r.messages.length === limite) {
      offset += limite;
    } else break;
  }
  return [...reacoes.values()];
}

/**
 * Envia mídia (imagem/vídeo/documento/áudio/sticker) via UAZAPI.
 * `file` aceita URL pública OU base64 (mesmo campo — a API detecta o
 * formato). Confirmado no spec real da UAZAPI (POST /send/media,
 * operationId sendMedia): campos obrigatórios são number/type/file.
 */
export async function uazSendMedia(
  token: string,
  number: string,
  fileUrl: string,
  opts: { type?: "image" | "video" | "document" | "audio" | "sticker"; caption?: string } = {},
): Promise<{ id?: string }> {
  const clean = normalizeBrWhatsappNumber(number);
  const data = await call<{ messageid?: string; id?: string; key?: { id?: string } }>(
    "/send/media",
    {
      token,
      body: {
        number: clean,
        type: opts.type ?? "image",
        file: fileUrl,
        ...(opts.caption ? { text: opts.caption } : {}),
      },
    },
  );
  return { id: data.messageid ?? data.id ?? data.key?.id };
}

export async function uazUpdateWebhook(
  token: string,
  url: string,
  events: string[] = ["messages"],
  opts: { incluirEnviosApi?: boolean } = {},
): Promise<void> {
  await call("/webhook", {
    token,
    body: { url, events, enabled: true, excludeMessages: opts.incluirEnviosApi ? ["isGroupYes"] : ["wasSentByApi", "isGroupYes"] },
  });
}
