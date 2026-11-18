import { z } from "zod";
import { audioAgente } from "./mimo-agente-db.server";
import { uazTranscreverAudio } from "./uazapi.server";
type Mensagem = { role: "user" | "assistant"; content: string; messageId?: string };
const audiosSchema = z.array(z.object({ id: z.string().uuid(), messageId: z.string().min(1).max(200) })).max(3);
export async function transcreverAudiosAgente(
  chave: { id: string; reserva: string }, mensagens: Mensagem[], obterToken: () => Promise<string | null>,
) {
  const ultimaSaida = mensagens.map(m => m.role).lastIndexOf("assistant");
  if (!mensagens.slice(ultimaSaida + 1).some(m => m.role === "user" && m.content === "[audio]")) return mensagens;
  const resultado = mensagens.map(m => ({ ...m }));
  try {
    const audios = audiosSchema.parse(await audioAgente(chave));
    if (!audios.length) return resultado;
    const token = await obterToken();
    if (!token) return resultado;
    for (const audio of audios) {
      const mensagem = resultado.find(m => m.role === "user" && m.messageId === audio.messageId && m.content === "[audio]");
      if (!mensagem) continue;
      try {
        const texto = await uazTranscreverAudio(token, audio.messageId);
        const salvo = z.object({ texto: z.string() }).safeParse(await audioAgente({ ...chave, evento: audio.id, texto }));
        if (salvo.success) mensagem.content = salvo.data.texto;
      } catch { /* Keep the unavailable-audio marker; never invent a transcript. */ }
    }
  } catch { /* The existing human handoff handles unavailable transcription safely. */ }
  return resultado;
}
