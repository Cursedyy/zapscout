/** Regras iniciais confirmadas pela equipe; este módulo só calcula prévias, nunca envia. */
export const REGRA_LEMBRETE_MIMO = {
  esperaMinutos: 120,
  inicioHora: 9,
  fimHora: 18,
  fuso: "America/Sao_Paulo",
  dias: "todos",
  maximoLembretesPorCanal: 1,
  canais: ["whatsapp"],
} as const;
const horario = new Intl.DateTimeFormat("en-CA", {
  timeZone: REGRA_LEMBRETE_MIMO.fuso,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});
function partes(data: Date) {
  return Object.fromEntries(
    horario
      .formatToParts(data)
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, Number(p.value)]),
  );
}
function parede(data: Date) {
  const p = partes(data);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
}
function inicioLocal(dia: Date) {
  const alvo = Date.UTC(
    dia.getUTCFullYear(),
    dia.getUTCMonth(),
    dia.getUTCDate(),
    REGRA_LEMBRETE_MIMO.inicioHora,
  );
  let utc = alvo;
  for (let i = 0; i < 3; i++) utc += alvo - parede(new Date(utc));
  return new Date(utc);
}
export function proximoHorarioLembrete(data: Date): Date {
  if (!Number.isFinite(data.getTime())) throw Error("Data inválida para o lembrete.");
  const p = partes(data);
  if (p.hour >= REGRA_LEMBRETE_MIMO.inicioHora && p.hour < REGRA_LEMBRETE_MIMO.fimHora)
    return new Date(data);
  return inicioLocal(
    new Date(
      Date.UTC(p.year, p.month - 1, p.day + (p.hour >= REGRA_LEMBRETE_MIMO.fimHora ? 1 : 0)),
    ),
  );
}
export type PreviaLembrete = {
  previstoPara: string | null;
  motivo: string;
};
export function preverLembreteMimo(
  carrinho: { atualizadoEm: string; temContato: boolean; temLink: boolean; temPedido: boolean },
  agora = new Date(),
): PreviaLembrete {
  if (carrinho.temPedido)
    return { previstoPara: null, motivo: "Compra identificada; lembrete bloqueado." };
  if (!carrinho.temContato)
    return { previstoPara: null, motivo: "Sem contato válido para o lembrete." };
  if (!carrinho.temLink)
    return { previstoPara: null, motivo: "Sem link seguro para retomar o carrinho." };
  const atualizado = new Date(carrinho.atualizadoEm).getTime();
  if (
    !Number.isFinite(atualizado) ||
    !Number.isFinite(agora.getTime()) ||
    atualizado > agora.getTime()
  )
    return { previstoPara: null, motivo: "Horário do carrinho precisa ser conferido." };
  if (agora.getTime() - atualizado > 30 * 86400000)
    return { previstoPara: null, motivo: "Carrinho fora da janela de consulta da loja." };
  const candidato = new Date(
    Math.max(atualizado + REGRA_LEMBRETE_MIMO.esperaMinutos * 60000, agora.getTime()),
  );
  return {
    previstoPara: proximoHorarioLembrete(candidato).toISOString(),
    motivo: "Prévia de horário; carrinho não incluído em fila de envio.",
  };
}
