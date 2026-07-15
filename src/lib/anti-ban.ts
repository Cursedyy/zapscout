/**
 * Utilidades client-safe do sistema de Proteção Anti-Restrição.
 * Server-only helpers ficam em `anti-ban.server.ts`.
 */

/**
 * Limite diário de envios baseado em quantos dias o número está conectado.
 * Estratégia de "aquecimento progressivo" — números novos enviam pouco,
 * ganham mais volume à medida que o histórico com o WhatsApp cresce.
 */
export function limiteDiarioPorMaturidade(conectadoEm: Date | null | undefined): number {
  if (!conectadoEm) return 20;
  const dias = Math.floor((Date.now() - conectadoEm.getTime()) / 86_400_000);
  if (dias < 3) return 20;
  if (dias < 7) return 40;
  if (dias < 14) return 80;
  if (dias < 30) return 150;
  return 300;
}

/**
 * Aplica variação aleatória de ±35% ao intervalo base para evitar padrão
 * detectável de robô (envios espaçados em intervalos matematicamente iguais).
 */
export function intervaloComJitter(_baseSegundos: number): number {
  // Restrição de intervalo entre envios desativada — sempre 0.
  return 0;
}

/**
 * Descobre o dia da semana (0=domingo, 6=sábado) e a hora atual em
 * America/Sao_Paulo — independente do fuso do servidor.
 */
export function agoraSaoPaulo(): { dia: number; hhmm: string } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(new Date());
  const wk = parts.find((p) => p.type === "weekday")?.value ?? "Mon";
  const h = parts.find((p) => p.type === "hour")?.value ?? "00";
  const m = parts.find((p) => p.type === "minute")?.value ?? "00";
  const mapa: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { dia: mapa[wk] ?? 1, hhmm: `${h}:${m}` };
}

/**
 * Verifica se o horário atual (São Paulo) está dentro da janela permitida.
 * Aceita janelas normais (08:00–20:00) e que atravessam meia-noite (22:00–06:00).
 */
export function dentroDaJanela(
  inicio: string,
  fim: string,
  diasSemana: number[],
): boolean {
  const { dia, hhmm } = agoraSaoPaulo();
  if (!diasSemana.includes(dia)) return false;
  const [hi, mi] = inicio.slice(0, 5).split(":").map(Number);
  const [hf, mf] = fim.slice(0, 5).split(":").map(Number);
  const [ha, ma] = hhmm.split(":").map(Number);
  const now = ha * 60 + ma;
  const start = hi * 60 + mi;
  const end = hf * 60 + mf;
  if (start <= end) return now >= start && now < end;
  // Janela atravessa meia-noite
  return now >= start || now < end;
}

export function calcularLimiteEfetivo(
  conectadoEm: Date | null | undefined,
  limiteCustomizado: number | null | undefined,
): number {
  const base = limiteDiarioPorMaturidade(conectadoEm);
  if (limiteCustomizado == null || limiteCustomizado <= 0) return base;
  return Math.min(base, limiteCustomizado);
}
