import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { configAgenteSchema, dadosAgenteSchema } from "./mimo-agente";
import { podeAbrirPagina } from "./mimo-acesso";
export const acaoAgenteSchema = z.object({
  acao: z.enum([
    "salvar",
    "publicar",
    "ativar",
    "pausar_geral",
    "assumir",
    "pausar",
    "devolver",
    "revisar",
  ]),
  revisao: z.number().int().positive().optional(),
  config: configAgenteSchema.optional(),
  publicada: z.number().int().positive().optional(),
  conversa: z.string().uuid().optional(),
  modo: z.enum(["piloto", "ativo"]).optional(),
  vinculo: z.string().uuid().optional(),
  revisaoHumana: z.enum(["confirmada", "rejeitada"]).optional(),
});
export const painelAgenteMimo = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { exigirMimo } = await import("./mimo-leads.server");
    const { operarAgente } = await import("./mimo-agente-db.server");
    const a = await exigirMimo(context.supabase, context.userId);
    if (!podeAbrirPagina(a.papel, "/mimo/agente")) throw Error("Acesso negado.");
    const painel = await operarAgente(a.empresaId, context.userId, "painel");
    // Binding metadata is safe, credentials never leave the server.
    const vinculos =
      (painel as { vinculos?: { id: string; numero_comercial: string; ativo: boolean }[] })
        ?.vinculos ?? [];
    return { painel, vinculos };
  });
export const alterarAgenteMimo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v) => acaoAgenteSchema.parse(v))
  .handler(async ({ context, data }) => {
    const { exigirMimo } = await import("./mimo-leads.server");
    const { operarAgente } = await import("./mimo-agente-db.server");
    const a = await exigirMimo(context.supabase, context.userId);
    if (!podeAbrirPagina(a.papel, "/mimo/agente")) throw Error("Acesso negado.");
    if (data.acao === "salvar" && !data.config) throw Error("Informe a configuração.");
    if (data.acao === "ativar") {
      if (!["administrador", "gestor"].includes(a.papel) || !data.vinculo)
        throw Error("Somente gestão pode ativar o agente.");
      const { obterRemetenteAgente } = await import("./mimo-agente-worker.server");
      const { uazUpdateWebhook } = await import("./uazapi.server");
      const { publicWebhookUrl } = await import("./whatsapp.functions");
      const token = await obterRemetenteAgente(a.empresaId, data.vinculo);
      if (!token) throw Error("Confira a identidade e a conexão do número comercial.");
      await uazUpdateWebhook(token, publicWebhookUrl(), ["messages"], { incluirEnviosApi: true });
    }
    return operarAgente(a.empresaId, context.userId, data.acao, data);
  });
export const responderAgenteMimo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v) =>
    z
      .object({
        conversa: z.string().uuid(),
        texto: z.string().trim().min(1).max(2000),
        solicitacao: z.string().uuid(),
      })
      .parse(v),
  )
  .handler(async ({ context, data }) => {
    const { exigirMimo } = await import("./mimo-leads.server");
    const { responderManualmenteAgente } = await import("./mimo-agente-manual.server");
    const a = await exigirMimo(context.supabase, context.userId);
    if (!podeAbrirPagina(a.papel, "/mimo/agente")) throw Error("Acesso negado.");
    return responderManualmenteAgente(
      a.empresaId,
      context.userId,
      data.conversa,
      data.texto,
      data.solicitacao,
    );
  });
export const enviarMaterialAgenteMimo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v) =>
    z
      .object({
        nome: z.string().trim().min(1).max(120),
        tipo: z.enum(["catalogo", "apresentacao"]),
        base64: z.string().max(7_000_000),
        mime: z.enum(["application/pdf", "image/png", "image/jpeg"]),
      })
      .parse(v),
  )
  .handler(async ({ context, data }) => {
    const { exigirMimo } = await import("./mimo-leads.server");
    const { registrarMaterialAgente } = await import("./mimo-agente-db.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const a = await exigirMimo(context.supabase, context.userId);
    if (!podeAbrirPagina(a.papel, "/mimo/agente")) throw Error("Acesso negado.");
    if (!["administrador", "gestor"].includes(a.papel))
      throw Error("Somente gestão pode enviar materiais.");
    const bytes = Uint8Array.from(atob(data.base64), (c) => c.charCodeAt(0));
    if (bytes.length < 8 || bytes.length > 5242880) throw Error("Envie um arquivo de até 5 MB.");
    const assinatura =
      data.mime === "application/pdf"
        ? new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-"
        : data.mime === "image/png"
          ? bytes.slice(0, 8).join(",") === "137,80,78,71,13,10,26,10"
          : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    if (!assinatura) throw Error("Formato de arquivo inválido.");
    const id = crypto.randomUUID(),
      ext = data.mime === "application/pdf" ? "pdf" : data.mime === "image/png" ? "png" : "jpg",
      path = `${a.empresaId}/${id}.${ext}`;
    const r = await supabaseAdmin.storage
      .from("mimo-agente-materiais")
      .upload(path, bytes, { contentType: data.mime, upsert: false });
    if (r.error) throw Error("Não foi possível guardar o arquivo privado.");
    try {
      await registrarMaterialAgente(a.empresaId, context.userId, id, {
        nome: data.nome,
        tipo: data.tipo,
        path,
        mime: data.mime,
      });
    } catch (error) {
      await supabaseAdmin.storage.from("mimo-agente-materiais").remove([path]);
      throw error;
    }
    return { id };
  });
export const desativarMaterialAgenteMimo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ context, data }) => {
    const { exigirMimo } = await import("./mimo-leads.server");
    const { registrarMaterialAgente } = await import("./mimo-agente-db.server");
    const a = await exigirMimo(context.supabase, context.userId);
    if (!podeAbrirPagina(a.papel, "/mimo/agente")) throw Error("Acesso negado.");
    await registrarMaterialAgente(a.empresaId, context.userId, data.id);
    return { ok: true };
  });
export const simularAgenteMimo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v) =>
    z
      .object({
        revisao: z.number().int().positive(),
        mensagens: z
          .array(
            z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(2000) }),
          )
          .min(1)
          .max(30),
        dados: dadosAgenteSchema,
      })
      .parse(v),
  )
  .handler(async ({ context, data }) => {
    const { exigirMimo } = await import("./mimo-leads.server");
    const { operarAgente } = await import("./mimo-agente-db.server");
    const { gerarRespostaAgente } = await import("./mimo-agente-modelo.server");
    const a = await exigirMimo(context.supabase, context.userId);
    if (!podeAbrirPagina(a.papel, "/mimo/agente")) throw Error("Acesso negado.");
    if (!["administrador", "gestor"].includes(a.papel))
      throw Error("Somente gestão pode usar o simulador.");
    const painel = (await operarAgente(a.empresaId, context.userId, "painel")) as {
      config?: { rascunho: unknown; revisao: number };
    };
    if (!painel.config || painel.config.revisao !== data.revisao)
      throw Error("Salve o rascunho e recarregue antes de simular.");
    await operarAgente(a.empresaId, context.userId, "simulacao_reservar", {
      revisao: data.revisao,
    });
    const r = await gerarRespostaAgente(
      configAgenteSchema.parse(painel.config.rascunho),
      data.mensagens,
      data.dados,
    );
    await operarAgente(a.empresaId, context.userId, "simulacao", { revisao: data.revisao });
    return r;
  });
