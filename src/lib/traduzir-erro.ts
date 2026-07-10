/**
 * Traduz mensagens de erro (geralmente vindas dos provedores de WhatsApp:
 * UAZAPI, Evolution, Meta) para português amigável ao usuário final.
 *
 * Uso: `traduzirErro(msg)` — recebe qualquer string (ou null/undefined) e
 * devolve uma versão em português. Se não reconhecer o padrão, mantém
 * a original.
 */

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
