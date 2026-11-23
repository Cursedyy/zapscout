import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { catalogoChatMimo, operarConversaComercial, suportaConversaPessoal, workerAgente } from "./mimo-agente-db.server";
import { obterRemetenteAgente } from "./mimo-whatsapp-remetente.server";
import { CATALOGO_CHAT_MIMO, hashTokenMimo, idEnvioMimo } from "./mimo-whatsapp";
import { uazSendMedia, uazSendText } from "./uazapi.server";

const resultado = z.discriminatedUnion("estado", [
  z.object({
    estado: z.literal("reservada"),
    id: z.string().uuid(),
    reserva: z.string().uuid(),
    telefone: z.string(),
    vinculo: z.string().uuid(),
    numeroComercial: z.string(),
  }),
  z.object({
    estado: z.enum([
      "enviada", "incerta", "falha", "cancelada", "em_andamento", "envio_pendente",
      "linha_indisponivel", "destino_indisponivel", "bloqueada", "indisponivel",
    ]),
  }),
]);

type ResultadoEnvio = {
  estado: Exclude<z.infer<typeof resultado>["estado"], "reservada"> | "catalogo_indisponivel";
  identidade?: { messageId: string; vinculoId: string };
};

export async function enviarMensagemComercialMimo(
  empresa: string,
  ator: string,
  lead: string,
  conteudo: { texto: string } | { tipo: "catalogo" },
  solicitacao: string,
  pessoal = false,
): Promise<ResultadoEnvio> {
  if (pessoal && !(await suportaConversaPessoal(empresa, ator))) return { estado: "indisponivel" };
  const mensagem = "texto" in conteudo ? conteudo.texto.trim() : CATALOGO_CHAT_MIMO;
  let arquivo: { path: string; url: string } | undefined;
  if ("tipo" in conteudo) {
    try {
      const path = await catalogoChatMimo(empresa, ator, lead);
      if (!path) return { estado: "catalogo_indisponivel" };
      const { data, error } = await supabaseAdmin.storage.from("mimo-agente-materiais")
        .createSignedUrl(path, 90, { download: "Catalogo-MiMo.pdf" });
      if (error || !data?.signedUrl) return { estado: "catalogo_indisponivel" };
      arquivo = { path, url: data.signedUrl };
    } catch {
      return { estado: "catalogo_indisponivel" };
    }
  }
  const r = resultado.parse(await operarConversaComercial(empresa, ator, lead, "reservar", {
    texto: mensagem, solicitacao,
  }));
  if (r.estado !== "reservada") return { estado: r.estado };

  const tarefa = { id: r.id, reserva: r.reserva };
  let tentouEnviar = false;
  let identidade: ResultadoEnvio["identidade"];
  try {
    const token = pessoal
      ? await obterRemetenteAgente(empresa, r.vinculo, ator)
      : await obterRemetenteAgente(empresa, r.vinculo);
    if (!token) {
      await workerAgente("falha", tarefa);
      return { estado: "linha_indisponivel" as const };
    }
    if (arquivo && await catalogoChatMimo(empresa, ator, lead) !== arquivo.path) {
      await workerAgente("cancelar", tarefa);
      return { estado: "catalogo_indisponivel" };
    }
    const autorizada = await operarConversaComercial(empresa, ator, lead, "autorizar", {
      ...tarefa, tokenHash: await hashTokenMimo(token),
    });
    if (autorizada !== true) {
      await workerAgente("cancelar", tarefa);
      return { estado: "cancelada" as const };
    }

    tentouEnviar = true;
    const { id } = arquivo
      ? await uazSendMedia(token, r.telefone, arquivo.url, { type: "document", caption: mensagem })
      : await uazSendText(token, r.telefone, mensagem);
    if (!id) {
      await workerAgente("incerta", tarefa);
      return { estado: "incerta" as const };
    }
    identidade = { messageId: idEnvioMimo(id, r.numeroComercial), vinculoId: r.vinculo };
    const registrada = await workerAgente("enviada", { ...tarefa, messageId: identidade.messageId });
    return { estado: registrada === true ? "enviada" : "incerta", identidade };
  } catch {
    // A provider timeout can happen after acceptance. The reservation is never reused to send again.
    await workerAgente(tentouEnviar ? "incerta" : "falha", tarefa).catch(() => undefined);
    return { estado: tentouEnviar ? "incerta" : "falha", ...(identidade ? { identidade } : {}) };
  }
}
