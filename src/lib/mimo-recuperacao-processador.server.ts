import { proximoHorarioLembrete } from "./mimo-carrinhos-recuperacao";

export type TrabalhoRecuperacao = { id: string; reserva: string };
export type DestinoRecuperacao = { telefone: string; texto: string };
/** Cada operação de estado é atômica no banco; nenhum envio depende da memória do processo. */
export type DependenciasRecuperacao = {
  reservar(): Promise<TrabalhoRecuperacao | null>;
  conferirCompra(trabalho: TrabalhoRecuperacao): Promise<boolean>;
  preparar(trabalho: TrabalhoRecuperacao): Promise<DestinoRecuperacao | null>;
  autorizar(trabalho: TrabalhoRecuperacao): Promise<boolean>;
  bloquear(trabalho: TrabalhoRecuperacao, motivo: string): Promise<void>;
  enviar(destino: DestinoRecuperacao): Promise<{ messageId: string | null }>;
  concluir(trabalho: TrabalhoRecuperacao, messageId: string): Promise<void>;
  incerto(trabalho: TrabalhoRecuperacao): Promise<void>;
};

/** Um envio por execução. Falha após autorizar nunca provoca repetição automática. */
export async function processarLembreteMimo(
  deps: DependenciasRecuperacao,
  agora = new Date(),
): Promise<"fora_horario" | "vazia" | "bloqueada" | "enviada" | "incerta"> {
  if (proximoHorarioLembrete(agora).getTime() !== agora.getTime()) return "fora_horario";
  const trabalho = await deps.reservar();
  if (!trabalho) return "vazia";
  // Preparar texto/identidade antes da consulta final reduz o intervalo entre consulta e envio.
  const destino = await deps.preparar(trabalho);
  if (!destino) {
    await deps.bloquear(trabalho, "destino_indisponivel");
    return "bloqueada";
  }
  // Falha na consulta propaga e impede qualquer envio.
  if (await deps.conferirCompra(trabalho)) {
    await deps.bloquear(trabalho, "compra_identificada");
    return "bloqueada";
  }
  // RPC final revalida ativação, reserva, janela, supressão e pedido sob lock.
  if (!(await deps.autorizar(trabalho))) return "bloqueada";
  try {
    const r = await deps.enviar(destino);
    if (!r.messageId) throw Error("aceite_sem_identificador");
    await deps.concluir(trabalho, r.messageId);
    return "enviada";
  } catch {
    // O provedor pode ter aceitado mesmo se a resposta/persistência falhou.
    // Guardar como incerta exige revisão; repetir aqui poderia duplicar o contato.
    await deps.incerto(trabalho);
    return "incerta";
  }
}
