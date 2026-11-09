import { z } from "zod";
import { supabaseAdmin as db } from "@/integrations/supabase/client.server";
import {
  configAgenteSchema,
  dadosAgenteSchema,
  materialSolicitadoAgente,
  ultimoBlocoAgente,
  respostaEncaminhamento,
  type ResultadoAgente,
} from "./mimo-agente";
import { workerAgente } from "./mimo-agente-db.server";
import { gerarRespostaAgente } from "./mimo-agente-modelo.server";
import { processarRespostaAgente } from "./mimo-agente-processador.server";
import { hashTokenMimo, numeroConectadoMimo } from "./mimo-whatsapp";
import { uazStatus, uazSendText, uazSendMedia, uazPresence } from "./uazapi.server";
const tarefaSchema = z.object({
  id: z.string().uuid(),
  reserva: z.string().uuid(),
  empresa: z.string().uuid(),
  conversa: z.string().uuid(),
  telefone: z.string(),
  vinculo: z.string().uuid(),
  config: configAgenteSchema,
  dados: dadosAgenteSchema,
  mensagens: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() }))
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
export async function executarAgenteMimo() {
  const bruto = await workerAgente("reservar");
  if (!bruto) return "ocioso";
  const t = tarefaSchema.parse(bruto),
    chave = { id: t.id, reserva: t.reserva };
  const materiais = materiaisSchema.parse((bruto as { materiais?: unknown }).materiais ?? []);
  let material: z.infer<typeof materiaisSchema>[number] | undefined,
    url: string | null = null;
  let token: string | null = null;
  await processarRespostaAgente({
    config: t.config,
    gerar: async () => {
      const r = await gerarRespostaAgente(t.config, t.mensagens, t.dados);
      const pedido = materialSolicitadoAgente(
        ultimoBlocoAgente(t.mensagens),
        t.mensagens.filter((m) => m.role === "assistant").at(-1)?.content ?? "",
      );
      if (pedido && (r.estado === "agente" || r.motivo === "pre_qualificacao_pendente_revisao")) {
        material = materiais.find(
          (m) =>
            m.tipo === pedido &&
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
    validar: async () => (await workerAgente("validar", chave)) === true,
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

export async function obterRemetenteAgente(
  empresa: string,
  vinculo: string,
): Promise<string | null> {
  const t = { empresa, vinculo };

  const r = await db
    .from("mimo_whatsapp_vinculos")
    .select("*")
    .eq("empresa_id", t.empresa)
    .eq("id", t.vinculo)
    .eq("ativo", true)
    .maybeSingle();
  const v = r.data;
  if (r.error || !v) return null;
  const [p, i] = await Promise.all([
    db.from("profiles").select("id,uazapi_instance_token").eq("id", v.owner_id).maybeSingle(),
    v.instancia_id
      ? db
          .from("uazapi_instancias")
          .select("id,user_id,token")
          .eq("id", v.instancia_id)
          .eq("user_id", v.owner_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  const atual = v.instancia_id ? i.data?.token : p.data?.uazapi_instance_token;
  if (p.error || i.error || !atual || (await hashTokenMimo(atual)) !== v.token_sha256) return null;
  const [ps, is] = await Promise.all([
    db.from("profiles").select("id").eq("uazapi_instance_token", atual),
    db.from("uazapi_instancias").select("user_id").eq("token", atual),
  ]);
  const donos = new Set([
    ...(ps.data ?? []).map((x) => x.id),
    ...(is.data ?? []).map((x) => x.user_id),
  ]);
  if (ps.error || is.error || donos.size !== 1 || !donos.has(v.owner_id)) return null;
  const s = await uazStatus(atual, AbortSignal.timeout(7000));
  if (
    s.status !== "connected" ||
    !numeroConectadoMimo(s.profileNumber) ||
    numeroConectadoMimo(s.profileNumber) !== numeroConectadoMimo(v.numero_comercial)
  )
    return null;
  return atual;
}
