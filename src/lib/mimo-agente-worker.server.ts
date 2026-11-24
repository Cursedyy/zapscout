import { z } from "zod";
import { supabaseAdmin as db } from "@/integrations/supabase/client.server";
import {
  assuntoCriativoAgente,
  followupNoPrazoAgente,
  configAgenteSchema,
  dadosAgenteSchema,
  encerramentoRevendaAgente,
  esclarecimentoMarketingAgente,
  esclarecimentoMarketingPendenteAgente,
  parceriaInfluenciaAgente,
  pendenciaComercialAgente,
  motivoObrigatorioAgente,
  respostaContingenciaAgente,
  respostaEncaminhamento,
  revisaoRespostaAgente,
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
  parceriaInfluencia: z.literal(true).optional(),
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

/** Latest provider-attested ad reference for this conversation's lead, scoped to the company. */
async function criativoConversaAgente(empresa: string, conversa: string) {
  try {
    const c = await db.from("mimo_agente_conversas").select("lead_id").eq("empresa_id", empresa).eq("id", conversa).maybeSingle();
    const lead = c.data?.lead_id;
    if (c.error || !lead) return null;
    const e = await db.from("mimo_whatsapp_eventos").select("referencia_anuncio").eq("empresa_id", empresa)
      .eq("lead_id", lead).eq("direcao", "recebida").not("referencia_anuncio", "is", null)
      .order("contato_em", { ascending: false }).limit(1).maybeSingle();
    return e.error ? null : assuntoCriativoAgente(e.data?.referencia_anuncio);
  } catch {
    return null; // Missing metadata never blocks the reply; the agent asks instead.
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
      // A generic reminder never replaces an unanswered commercial question or a pending handoff.
      if (t.followup && pendenciaComercialAgente(t.config, t.mensagens)) return null;
      // Resale reminders stay suspended while the marketing subject is being clarified.
      if (t.followup && esclarecimentoMarketingPendenteAgente(t.mensagens)) return null;
      // Rows scheduled under the old 40-minute rule (or retried) never send before 1h/3h of silence.
      if (t.followup) {
        const envio = await db.from("mimo_agente_followup_envios").select("etapa,silencio_em")
          .eq("empresa_id", t.empresa).eq("fila_id", t.id).maybeSingle();
        if (envio.error || !followupNoPrazoAgente(envio.data?.etapa, envio.data?.silencio_em)) return null;
      }
      if (t.followup) {
        const primeiroNome = t.dados.nome?.valor.split(/\s+/)[0];
        const saudacao = primeiroNome && /^[\p{L}\p{M}][\p{L}\p{M}'’.-]{0,39}$/u.test(primeiroNome)
          ? `Olá, ${primeiroNome}!`
          : "Olá!";
        const lembrete = t.dados.revenda
          ? "Ficou alguma dúvida sobre a revenda? Podemos retomar de onde paramos."
          : t.followupEtapa === 2
            ? "Ainda tem interesse em conhecer a revenda MiMo? Se quiser continuar nossa conversa, estou por aqui para ajudar."
            : "Ficou alguma dúvida sobre a revenda MiMo? Se ainda tiver interesse, estou por aqui para te ajudar.";
        return {
          resposta: `${saudacao} ${lembrete}`,
          dados: t.dados,
          estado: "agente" as const,
          encaminhar: false,
          motivo: "",
          resumo: t.resumo,
        };
      }
      // Terminal commercial outcomes need the database capability; without it nothing is sent.
      const terminal = (m: typeof t.mensagens) => {
        const recusa = encerramentoRevendaAgente(m, t.dados);
        if (recusa) return t.encerramentoRevenda ? recusa : false;
        const parceria = parceriaInfluenciaAgente(m, t.dados);
        if (parceria) return t.parceriaInfluencia ? parceria : false;
        return undefined;
      };
      const marketing = (m: typeof t.mensagens) => esclarecimentoMarketingAgente(m, t.dados);
      const finalTexto = terminal(t.mensagens);
      if (finalTexto !== undefined) return finalTexto || null;
      const perguntaMarketing = marketing(t.mensagens);
      if (perguntaMarketing) return perguntaMarketing;
      const transcritas = await transcreverAudiosAgente(chave, t.mensagens, () => obterRemetenteAgente(t.empresa, t.vinculo));
      const finalAudio = terminal(transcritas);
      if (finalAudio !== undefined) return finalAudio || null;
      const mensagens = await carregarImagensAgente(t, transcritas);
      // Management-only learning is retrieved privately; arbitrary historical content is
      // excluded by the model adapter's allowlist. Published commercial rules still win.
      const ficha = await lerFichaRevendaAgente(t.empresa, t.telefone);
      const dados = dadosFichaRevendaAgente(ficha, t.dados);
      const perfil=await lerAprendizadoAgente(t.empresa);
      if (mensagens.some((m) => m.imagem) && !(await validar())) return null;
      let r: ResultadoAgente;
      try {
        r = await gerarRespostaAgente(t.config, mensagens, dados, perfil, t.catalogoApresentado, await criativoConversaAgente(t.empresa, t.conversa));
      } catch (error) {
        // Log only the exception class; provider errors can contain request or account details.
        console.error("[mimo-agente] falha ao gerar resposta", {
          name: error instanceof Error ? error.name : "UnknownError",
        });
        r = respostaContingenciaAgente(t.config, mensagens, dados, t.catalogoApresentado, mensagens.some((m) => m.imagem));
      }
      // Only the explicit text/transcript checks above can authorize a commercial loss.
      if (r.motivo === "falta_interesse" || r.motivo === "parceria_influencia") return null;
      if (revisaoRespostaAgente(mensagens, r)) {
        r = respostaContingenciaAgente(t.config, mensagens, r.dados, t.catalogoApresentado, mensagens.some((m) => m.imagem));
        if (r.motivo === "falta_interesse" || r.motivo === "parceria_influencia" || revisaoRespostaAgente(mensagens, r)) return null;
      }
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
    concluir: async (estado, messageId, motivo) => {
      await workerAgente(estado, { ...chave, messageId: messageId ?? null, ...(motivo ? { motivo } : {}) });
    },
  });
  return "processada";
}
