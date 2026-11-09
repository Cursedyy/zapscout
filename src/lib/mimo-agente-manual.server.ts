import { z } from "zod";
import { operarAgente, workerAgente } from "./mimo-agente-db.server";
import { obterRemetenteAgente } from "./mimo-agente-worker.server";
import { uazSendText } from "./uazapi.server";
const tarefa = z.object({
  id: z.string().uuid(),
  reserva: z.string().uuid(),
  empresa: z.string().uuid(),
  conversa: z.string().uuid(),
  telefone: z.string(),
  vinculo: z.string().uuid(),
});
export async function responderManualmenteAgente(
  empresa: string,
  ator: string,
  conversa: string,
  texto: string,
  solicitacao: string,
) {
  const raw = await operarAgente(empresa, ator, "responder_reservar", {
    conversa,
    texto,
    solicitacao,
  });
  if ((raw as { duplicada?: boolean })?.duplicada) return { estado: "ja_registrada" };
  const t = tarefa.parse(raw);
  let autorizada = false;
  try {
    const token = await obterRemetenteAgente(empresa, t.vinculo);
    if (!token) throw Error("agente_remetente_indisponivel");
    const ok = await operarAgente(empresa, ator, "responder_autorizar", {
      conversa,
      id: t.id,
      reserva: t.reserva,
    });
    if (ok !== true) {
      await workerAgente("cancelar", t);
      return { estado: "cancelada" };
    }
    autorizada = true;
    const id = (await uazSendText(token, t.telefone, texto.trim())).id;
    await workerAgente(id ? "enviada" : "incerta", { ...t, messageId: id ?? null });
    return { estado: id ? "enviada" : "incerta" };
  } catch {
    await workerAgente(autorizada ? "incerta" : "falha", t);
    return { estado: autorizada ? "incerta" : "falha" };
  }
}
