import { z } from "zod";

export const diagnosticoCarrinhoSchema = z.object({
  id: z.string(),
  estado: z.string().nullable(),
  motivo: z.string(),
  podeEnviar: z.boolean(),
  enviadaEm: z.string().nullable(),
  manual: z.boolean(),
});
export type DiagnosticoCarrinho = z.infer<typeof diagnosticoCarrinhoSchema>;

const motivos: Record<string, string> = {
  historico: "Anterior à ativação: fora da automação. Pode receber um lembrete manual.",
  enviada: "Lembrete aceito pelo WhatsApp. Não será reenviado.",
  incerta: "Envio incerto: exige revisão para evitar mensagem duplicada.",
  reservada: "Envio em processamento. Uma reserva interrompida ficará incerta para revisão.",
  enviando: "Envio em processamento. Uma reserva interrompida ficará incerta para revisão.",
  bloqueada: "Envio bloqueado pela verificação de segurança. Não será reenviado.",
  compra: "Compra identificada: lembrete bloqueado.",
  resposta: "Cliente já respondeu: lembretes interrompidos para atendimento da equipe.",
  sem_destino: "Sem telefone válido ou link de carrinho disponível.",
  expirado: "Carrinho sem atualização há 30 dias: envio indisponível.",
  aguardando: "Aguardando duas horas desde a última atualização do carrinho.",
  sem_configuracao: "Configure a recuperação e o WhatsApp comercial antes de enviar.",
  pausada: "Automação pausada. O envio manual continua disponível.",
  fila: "Elegível para a fila automática. O envio manual usa o mesmo lembrete, sem duplicar.",
};
export function motivoRecuperacaoCarrinho(motivo?: string) {
  return motivos[motivo ?? ""] ?? "Diagnóstico de envio indisponível. Atualize a página.";
}
