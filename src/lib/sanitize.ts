/**
 * Sanitização de inputs de busca antes de mandar pra APIs externas (Apify, Serpapi)
 * ou usar em filtros. Supabase usa parâmetros parametrizados, mas defesa em profundidade.
 */

const SQL_INJECTION_PATTERNS = [
  /--/g,
  /\/\*/g,
  /\*\//g,
  /;/g,
  /\bUNION\b/gi,
  /\bSELECT\b/gi,
  /\bINSERT\b/gi,
  /\bUPDATE\b/gi,
  /\bDELETE\b/gi,
  /\bDROP\b/gi,
  /\bEXEC\b/gi,
];

/** Remove caracteres de controle, normaliza espaços, aplica corte de tamanho. */
export function sanitizeSearchQuery(input: unknown, maxLen = 200): string {
  if (typeof input !== "string") return "";
  let s = input.normalize("NFC");
  // Remove caracteres de controle (exceto espaço comum)
  s = s.replace(/[\u0000-\u001f\u007f-\u009f]/g, " ");
  // Remove padrões suspeitos de SQL injection (defesa em profundidade)
  for (const re of SQL_INJECTION_PATTERNS) s = s.replace(re, " ");
  // Normaliza espaços
  s = s.replace(/\s+/g, " ").trim();
  // Limita tamanho
  if (s.length > maxLen) s = s.slice(0, maxLen);
  return s;
}

/** Lista de user-agents conhecidos de bots/scrapers a serem bloqueados em rotas públicas. */
const BOT_UA_PATTERNS = [
  /scrapy/i,
  /python-requests/i,
  /python-urllib/i,
  /wget/i,
  /\bcurl\//i,
  /go-http-client/i,
  /java\//i,
  /ahrefs/i,
  /semrush/i,
  /mj12bot/i,
  /dotbot/i,
  /petalbot/i,
  /bytespider/i,
  /headlesschrome/i,
  /phantomjs/i,
  /puppeteer/i,
];

export function isSuspiciousBot(userAgent: string | null | undefined): boolean {
  if (!userAgent) return true; // UA vazio em rota pública = suspeito
  const ua = userAgent.toLowerCase();
  if (ua.length < 10) return true;
  return BOT_UA_PATTERNS.some((re) => re.test(userAgent));
}
