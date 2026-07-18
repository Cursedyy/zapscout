/**
 * Tradutor central de erros de API/cron e helpers de captura.
 *
 * - `traduzirErro(msg)` — traduz uma string de erro (provedores de WhatsApp
 *   como UAZAPI, Evolution, Meta) para PT-BR. Mantém a original se nada bater.
 * - `mensagemErro(e, fallback)` — extrai a `.message` de um `unknown` do catch.
 * - `traduzirErroDe(e, fallback)` — combina os dois; use para exibir.
 * - `toastErro(e, fallback, opts)` — `toast.error` já traduzido.
 *
 * Todo componente / mutation / server-fn client-side deve usar esses helpers
 * — não montar `e instanceof Error ? e.message : "..."` na mão.
 */
import { toast as sonnerToast } from "sonner";

type Regra = { re: RegExp; traduzir: (m: RegExpMatchArray) => string };

const REGRAS: Regra[] = [
  // "the number 55...@s.whatsapp.net is not on WhatsApp"
  {
    re: /the number\s+(\d+)(?:@s\.whatsapp\.net)?\s+is not on WhatsApp/i,
    traduzir: (m) => `O número ${m[1]} não está no WhatsApp.`,
  },
  {
    re: /number.*not.*on WhatsApp|not a WhatsApp user|not.*registered.*whatsapp/i,
    traduzir: () => "Este número não está no WhatsApp.",
  },
  {
    re: /invalid\s+(phone\s+)?number|numero invalido|invalid recipient/i,
    traduzir: () => "Número inválido.",
  },
  {
    re: /rate\s*limit|too many requests|429/i,
    traduzir: () => "Muitas mensagens em pouco tempo — aguarde antes de tentar novamente.",
  },
  {
    re: /unauthorized|invalid token|token.*(invalid|expired)|forbidden|401|403/i,
    traduzir: () => "Sessão do WhatsApp expirada ou token inválido — reconecte o número.",
  },
  {
    re: /whatsapp\s+disconnected|session\s+is\s+not\s+reconnectable|not\s+connected|instance\s+disconnected|connection\s+closed|disconnected/i,
    traduzir: () => "WhatsApp desconectado no provedor — reconecte o número para a fila continuar.",
  },
  {
    re: /timeout|timed out|ETIMEDOUT/i,
    traduzir: () => "Tempo esgotado ao contatar o WhatsApp — tentaremos novamente.",
  },
  {
    re: /network|ECONNREFUSED|ENOTFOUND|fetch failed/i,
    traduzir: () => "Falha de conexão com o provedor de WhatsApp — tentaremos novamente.",
  },
  {
    re: /instance\s+not\s+found|no\s+instance/i,
    traduzir: () => "Instância do WhatsApp não encontrada — refaça a conexão.",
  },
  {
    re: /blocked|banned|banido/i,
    traduzir: () => "Este número foi bloqueado pelo WhatsApp.",
  },
  {
    re: /media\s+not\s+found|file too large|arquivo.*grande/i,
    traduzir: () => "Arquivo de mídia inválido ou muito grande.",
  },
  {
    re: /internal server error|500/i,
    traduzir: () => "Erro interno no provedor de WhatsApp — tentaremos novamente.",
  },
];

// Extrai o corpo de erro do provedor quando vem envelopado, ex.:
//   UAZAPI [500]: {"error":"the number 55...@s.whatsapp.net is not on WhatsApp"}
function extrairMensagemInterna(msg: string): string {
  // JSON com {"error":"..."} ou {"message":"..."}
  const j = msg.match(/\{[^}]*"(?:error|message|reason)"\s*:\s*"([^"]+)"/i);
  if (j?.[1]) return j[1];
  // "PROVIDER [500]: texto"
  const p = msg.match(/^[A-Za-z]+\s*\[\d+\]\s*:\s*(.+)$/);
  if (p?.[1]) return p[1];
  return msg;
}

export function traduzirErro(msg?: string | null): string {
  if (!msg) return "";
  const raw = String(msg).trim();
  if (!raw) return "";

  const alvo = extrairMensagemInterna(raw);

  for (const r of REGRAS) {
    const m = alvo.match(r.re);
    if (m) return r.traduzir(m);
    const m2 = raw.match(r.re);
    if (m2) return r.traduzir(m2);
  }

  // Se sobrou só o envelope tipo "UAZAPI [500]:", devolve algo legível.
  if (/^[A-Za-z]+\s*\[\d+\]\s*:?\s*$/.test(raw)) {
    return "Erro no provedor de WhatsApp.";
  }

  return alvo;
}

/**
 * Extrai a mensagem "crua" de um `unknown` capturado num `catch`. Não traduz —
 * útil para logs, gravação em `ultimo_erro` no banco e outros lugares onde o
 * texto original é depois traduzido no momento da exibição.
 */
export function mensagemErro(e: unknown, fallback = "Erro inesperado"): string {
  if (e instanceof Error) return e.message || fallback;
  if (typeof e === "string" && e.trim()) return e;
  if (e && typeof e === "object") {
    const anyE = e as { message?: unknown; error?: unknown };
    if (typeof anyE.message === "string" && anyE.message.trim()) return anyE.message;
    if (typeof anyE.error === "string" && anyE.error.trim()) return anyE.error;
    try {
      return JSON.stringify(e);
    } catch {
      return fallback;
    }
  }
  return fallback;
}

/**
 * `mensagemErro` + `traduzirErro` em um passo. Use sempre que for exibir
 * um erro capturado para o usuário — em toasts, `Notification`, dialogs, etc.
 */
export function traduzirErroDe(e: unknown, fallback = "Erro inesperado"): string {
  return traduzirErro(mensagemErro(e, fallback));
}

type ToastOptions = Parameters<typeof sonnerToast.error>[1];

/**
 * Atalho para `toast.error(traduzirErroDe(e, fallback))`. Aceita `unknown`
 * direto do `catch` e mostra a versão traduzida.
 */
export function toastErro(e: unknown, fallback = "Erro inesperado", opts?: ToastOptions): void {
  sonnerToast.error(traduzirErroDe(e, fallback), opts);
}

/**
 * Categoriza um erro para decidir política de reenvio automático.
 *
 * - `disconnected` — WhatsApp caiu; reagendar sem consumir tentativa.
 * - `rate_limit`   — provedor pediu para desacelerar; backoff longo.
 * - `permanent`    — número inválido / não é WhatsApp / bloqueado / banido /
 *                    mídia inválida / auth. Falha imediata sem retry.
 * - `transient`    — timeout / network / 5xx / demais falhas passageiras.
 */
export type CategoriaErro = "disconnected" | "rate_limit" | "permanent" | "transient";

export type RestricaoInstancia = "confirmada" | "ambigua" | null;

/**
 * Tenta identificar se um erro de envio indica que a PRÓPRIA instância
 * (número remetente) foi restringida/bloqueada pelo WhatsApp/Meta — diferente
 * de um erro sobre o destinatário (ex.: "number is not on WhatsApp", que é
 * sobre o lead, não sobre a nossa conta). Usado só pelo cron de campanhas
 * (`process-campaigns.ts`) para decidir pausa automática + alerta.
 *
 * Caso real confirmado em produção (2026-07-18, instância 555391635302):
 * a UAZAPI retornou repetidamente "WhatsApp disconnected: session is not
 * reconnectable" (503) nos minutos antes de uma restrição de 24h da
 * Meta/WhatsApp aparecer no próprio app. Esse texto NÃO batia em nenhum
 * padrão abaixo — caía no bucket genérico "disconnected" (transitório,
 * `categoriaErro`), então o cron só reagendava retry, sem pausar nem
 * alertar. "session is not reconnectable" é mais específico que um
 * "connection closed"/timeout comum: em libs Baileys/multi-device esse
 * texto só aparece pra motivos de desconexão TERMINAIS (logged-out, sessão
 * substituída, banido) — não pra quedas de rede/wifi normais, que são
 * reconectáveis e continuam tratadas como transitório de propósito (não
 * queremos pausar campanha toda vez que o celular perde wifi).
 *
 * Demais sinais abaixo continuam heurísticos (terminologia comum de
 * provedores Baileys/WhatsApp multi-device) — por isso existe o nível
 * "ambigua": erros que PODEM ser restrição mas não batem com certeza não
 * pausam nada, só alertam — evita falso positivo derrubando campanhas
 * saudáveis. Ajuste os padrões aqui assim que outro caso real aparecer em
 * produção (ver `campanha_dispatch_logs.error_message`).
 */
export function detectarRestricaoInstancia(msg: string, httpStatus: number): RestricaoInstancia {
  const raw = (msg ?? "").toString();

  // Nunca classifica como restrição de conta um erro que já é sabidamente
  // sobre o DESTINATÁRIO (número não é do whatsapp, jid inválido, etc.).
  if (
    /is not on whatsapp|not.*whatsapp.*user|number.*not.*exist|invalid.*(number|jid)/i.test(raw)
  ) {
    return null;
  }

  // Sinais fortes de banimento/restrição da PRÓPRIA conta/instância.
  if (
    /\b(banned|banido|conta\s+suspensa|account\s+(banned|suspended|restricted)|n[uú]mero\s+banido|logged\s*out|loggedout|session\s+banned|conta\s+restrita)\b/i.test(
      raw,
    )
  ) {
    return "confirmada";
  }

  // "session is not reconnectable" — mais específico que um "disconnected"
  // genérico (que pode ser só rede/wifi caindo, reconectável, e continua
  // transitório). Em libs Baileys/multi-device esse texto só aparece pra
  // motivos de desconexão TERMINAIS (logged-out, sessão substituída,
  // banido) — caso real confirmado em produção (ver comentário acima).
  if (/session\s+is\s+not\s+reconnectable|not\s*reconnectable/i.test(raw)) {
    return "confirmada";
  }

  // 429: mesmo sem certeza se é throttle da própria UAZAPI ou repasse da
  // Meta, continuar disparando durante um 429 ativo é sempre arriscado —
  // decisão de produto: tratar como confirmado por cautela.
  if (httpStatus === 429) return "confirmada";

  // "blocked/bloqueado" isolado é ambíguo — pode ser bloqueio de conta real
  // ou tradução ruidosa de outro erro. E 403 fora dos casos já conhecidos
  // (401 já cobre token/sessão expirada à parte) também é ambíguo.
  if (/\bblocked\b|\bbloqueado\b/i.test(raw)) return "ambigua";
  if (httpStatus === 403) return "ambigua";

  return null;
}

export function categoriaErro(msg?: string | null): CategoriaErro {
  const raw = (msg ?? "").toString();
  if (!raw) return "transient";
  if (
    /whatsapp\s+disconnected|session\s+is\s+not\s+reconnectable|not\s+connected|instance\s+disconnected|connection\s+closed|disconnected|WA_NAO_CONECTADO/i.test(
      raw,
    )
  ) {
    return "disconnected";
  }
  if (/rate\s*limit|too many requests|\b429\b/i.test(raw)) return "rate_limit";
  if (
    /number.*not.*on WhatsApp|not a WhatsApp user|not.*registered.*whatsapp|invalid\s+(phone\s+)?number|numero invalido|invalid recipient|blocked|banned|banido|media\s+not\s+found|file too large|arquivo.*grande|unauthorized|invalid token|token.*(invalid|expired)|forbidden|\b401\b|\b403\b|instance\s+not\s+found|no\s+instance/i.test(
      raw,
    )
  ) {
    return "permanent";
  }
  return "transient";
}
