import { z } from "zod";
import { supabaseAdmin as db } from "@/integrations/supabase/client.server";
import {
  configAgenteSchema,
  dadosAgenteSchema,
  encerramentoRevendaAgente,
  motivoObrigatorioAgente,
  respostaEncaminhamento,
  ultimoBlocoAgente,
  type ResultadoAgente,
} from "./mimo-agente";
import { workerAgente } from "./mimo-agente-db.server";
import { transcreverAudiosAgente } from "./mimo-agente-audio.server";
import {lerAprendizadoAgente} from './mimo-agente-aprendizado.server';
import { gerarRespostaAgente, type MensagemAgenteComImagem } from "./mimo-agente-modelo.server";
import { lerFichaRevendaAgente } from "./mimo-agente-revenda.server";
import { dadosFichaRevendaAgente } from "./mimo-agente-revenda";
import { processarRespostaAgente } from "./mimo-agente-processador.server";
import { obterRemetenteAgente } from "./mimo-whatsapp-remetente.server";
import { conteudoRecebidoMimo, marcadorImagemWhatsApp, mensagemMimo } from "./mimo-whatsapp";
export { obterRemetenteAgente } from "./mimo-whatsapp-remetente.server";
import { uazBaixarImagem, uazBuscarMensagemRecebida, uazSendText, uazSendMedia, uazPresence } from "./uazapi.server";
const tarefaSchema = z.object({
  encerramentoRevenda: z.literal(true).optional(),
  followup: z.boolean().default(false),
  followupEtapa: z.number().int().min(1).max(2).nullish(),
  catalogoApresentado: z.boolean().default(false),
  resumo: z.string().default(""),
  id: z.string().uuid(),
  reserva: z.string().uuid(),
  empresa: z.string().uuid(),
  conversa: z.string().uuid(),
  telefone: z.string(),
  vinculo: z.string().uuid(),
  config: configAgenteSchema,
  dados: dadosAgenteSchema,
  mensagens: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string(), messageId: z.string().optional() }))
    .max(40),
});
const materiaisSchema = z
  .array(
    z.object({
      id: z.string().uuid(),
      empresa_id: z.string().uuid(),
      path: z.string(),
      mime: z.enum(["application/pdf", "image/png", "image/jpeg"]),
      tipo: z.enum(["catalogo", "apresentacao"]),
    }),
  )
  .max(20);
async function carregarImagensAgente(
  tarefa: z.infer<typeof tarefaSchema>,
  mensagens: z.infer<typeof tarefaSchema>["mensagens"],
): Promise<MensagemAgenteComImagem[]> {
  const ultimaSaida = mensagens.map((m) => m.role).lastIndexOf("assistant");
  const fotos = mensagens.slice(ultimaSaida + 1).filter((m) => m.role === "user" && (
    m.content === marcadorImagemWhatsApp || m.content.startsWith(`${marcadorImagemWhatsApp} `)
  ));
  if (!fotos.length || fotos.length > 3) return mensagens;
  if (motivoObrigatorioAgente(ultimoBlocoAgente(mensagens), tarefa.config) !== "anexo_indisponivel")
    return mensagens;
  const ids = fotos.map((m) => m.messageId ?? "");
  if (ids.some((id) => !/^[A-Za-z0-9_:@+.-]{1,200}$/.test(id))) return mensagens;

  try {
    const token = await obterRemetenteAgente(tarefa.empresa, tarefa.vinculo);
    if (!token) return mensagens;
    const downloads = await Promise.allSettled(ids.map(async (id) => {
      // History may span multiple connections. Confirm the exact incoming photo on this chat.
      const original = await uazBuscarMensagemRecebida(token, id);
      const recebido = mensagemMimo(original, "");
      const conteudo = conteudoRecebidoMimo(original, "");
      if (recebido?.telefone !== tarefa.telefone ||
          (conteudo !== marcadorImagemWhatsApp && !conteudo.startsWith(`${marcadorImagemWhatsApp} `))) return null;
      return uazBaixarImagem(token, id);
    }));
    const imagens = new Map(fotos.map((foto, i) => [foto, downloads[i]]));
    return mensagens.map((m) => {
      const download = imagens.get(m);
      if (download?.status !== "fulfilled" || !download.value) return m;
      return { ...m, content: m.content.slice(marcadorImagemWhatsApp.length).trim(), imagem: download.value };
    });
  } catch {
    // Keep the unavailable-attachment handoff if the source could not be verified.
    return mensagens;
  }
}

export async function executarAgenteMimo() {
  const bruto = await workerAgente("reservar");
  if (!bruto) return "ocioso";
  const t = tarefaSchema.parse(bruto),
    chave = { id: t.id, reserva: t.reserva };
  const materiais = materiaisSchema.parse((bruto as { materiais?: unknown }).materiais ?? []);
  let material: z.infer<typeof materiaisSchema>[number] | undefined,
    url: string | null = null;
  let token: string | null = null;
  const validar = async () => (await workerAgente("validar", chave)) === true;
  await processarRespostaAgente({
    config: t.config,
    gerar: async () => {
      if(t.followup) return {
        resposta: t.dados.revenda
          ? "Olá! Ficou alguma dúvida sobre a revenda? Podemos retomar de onde paramos."
          : t.followupEtapa === 2
          ? "Olá! Ainda tem interesse em conhecer a revenda MiMo? Se quiser continuar nossa conversa, estou por aqui para ajudar."
          : "Olá! Ficou alguma dúvida sobre a revenda MiMo? Se ainda tiver interesse, estou por aqui para te ajudar.",
        dados:t.dados, estado:"agente" as const, encaminhar:false, motivo:"", resumo:t.resumo,
      };
      const recusaTexto = encerramentoRevendaAgente(t.mensagens, t.dados);
      if (recusaTexto) return t.encerramentoRevenda ? recusaTexto : null;
      const transcritas = await transcreverAudiosAgente(chave, t.mensagens, () => obterRemetenteAgente(t.empresa, t.vinculo));
      const recusaAudio = encerramentoRevendaAgente(transcritas, t.dados);
      if (recusaAudio) return t.encerramentoRevenda ? recusaAudio : null;
      const mensagens = await carregarImagensAgente(t, transcritas);
      // Management-only learning is retrieved privately; arbitrary historical content is
      // excluded by the model adapter's allowlist. Published commercial rules still win.
      const ficha = await lerFichaRevendaAgente(t.empresa, t.telefone);
      const dados = dadosFichaRevendaAgente(ficha, t.dados);
      const perfil=await lerAprendizadoAgente(t.empresa);
      if (mensagens.some((m) => m.imagem) && !(await validar())) return null;
      const r = await gerarRespostaAgente(t.config, mensagens, dados,perfil,t.catalogoApresentado);
      // Only the explicit text/transcript checks above can authorize a commercial loss.
      if (r.motivo === "falta_interesse") return null;
      if (r.materialSolicitado === "apresentacao" && r.estado === "agente") {
        material = materiais.find(
          (m) =>
            m.tipo === "apresentacao" &&
            m.empresa_id === t.empresa &&
            t.config.materiais.includes(m.id) &&
            m.path.startsWith(`${t.empresa}/${m.id}.`),
        );
        if (!material)
          return {
            ...r,
            estado: "humano" as const,
            encaminhar: true,
            motivo: "material_indisponivel",
            resposta: respostaEncaminhamento(t.config, "material_indisponivel"),
          };
        return { ...r, materialId: material.id } as ResultadoAgente;
      }
      return r;
    },
    validar,
    presenca: async (ativa) => {
      if (token) await uazPresence(token, t.telefone, ativa);
    },
    esperar: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    remetente: async () => {
      token = await obterRemetenteAgente(t.empresa, t.vinculo);
      if (material && token) {
        const s = await db.storage.from("mimo-agente-materiais").createSignedUrl(material.path, 60);
        if (s.error || !s.data?.signedUrl) return false;
        url = s.data.signedUrl;
      }
      return !!token;
    },
    autorizar: async (resultado) =>
      (await workerAgente("autorizar", { ...chave, resultado })) === true,
    enviar: async (texto) => {
      if (!token) throw Error("agente_sem_remetente");
      if (material) {
        if (!url) throw Error("agente_material_indisponivel");
        return (
          (
            await uazSendMedia(token, t.telefone, url, {
              type: material.mime === "application/pdf" ? "document" : "image",
              caption: texto,
            })
          ).id ?? null
        );
      }
      return (await uazSendText(token, t.telefone, texto)).id ?? null;
    },
    concluir: async (estado, messageId) => {
      await workerAgente(estado, { ...chave, messageId: messageId ?? null });
    },
  });
  return "processada";
}
