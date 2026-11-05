/** Regras iniciais confirmadas pela equipe; este módulo só calcula prévias, nunca envia. */
export const REGRA_LEMBRETE_MIMO = {
  esperaMinutos: 120,
  inicioHora: 0,
  fimHora: 24,
  fuso: "America/Sao_Paulo",
  dias: "todos",
  maximoLembretesPorCanal: 1,
  canais: ["whatsapp"],
} as const;
export function proximoHorarioLembrete(data: Date): Date {
  if (!Number.isFinite(data.getTime())) throw Error("Data inválida para o lembrete.");
  return new Date(data);
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
    motivo: "Estimativa pela data do carrinho; o envio depende da elegibilidade e da fila.",
  };
}
