import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
export const estadoWhatsAppMimo = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { estadoConexaoMimo } = await import("./mimo-whatsapp-conexao.server");
    return estadoConexaoMimo(context);
  });
export const conectarWhatsAppMimo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { iniciarConexaoMimo } = await import("./mimo-whatsapp-conexao.server");
    return iniciarConexaoMimo(context);
  });
export const ativarWhatsAppMimo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v) =>
    z
      .object({
        numero: z.string().regex(/^\d{12,15}$/),
        desafio: z.string().max(160),
        confirmado: z.literal(true),
      })
      .strict()
      .parse(v),
  )
  .handler(async ({ context, data }) => {
    const { ativarConexaoMimo } = await import("./mimo-whatsapp-conexao.server");
    return ativarConexaoMimo(context, data.numero, data.desafio);
  });
export const trocarWhatsAppMimo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v) =>
    z
      .object({
        numero: z.string().regex(/^\d{12,15}$/),
        desafio: z.string().max(160),
        confirmado: z.literal(true),
      })
      .strict()
      .parse(v),
  )
  .handler(async ({ context, data }) => {
    const { iniciarConexaoMimo } = await import("./mimo-whatsapp-conexao.server");
    return iniciarConexaoMimo(context, data);
  });
export const pausarWhatsAppMimo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v) => z.object({ id: z.string().uuid() }).strict().parse(v))
  .handler(async ({ context, data }) => {
    const { pausarConexaoMimo } = await import("./mimo-whatsapp-conexao.server");
    return pausarConexaoMimo(context, data.id);
  });
export const mensagensLeadWhatsAppMimo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v) =>
    z.object({ leadId: z.string().uuid(), pagina: z.number().int().min(0).max(10000) }).parse(v),
  )
  .handler(async ({ context, data }) => {
    const { exigirMimo } = await import("./mimo-leads.server");
    const a = await exigirMimo(context.supabase, context.userId);
    if (!["administrador", "gestor", "vendedor"].includes(a.papel)) throw Error("Acesso negado.");
    if (a.papel === "vendedor") {
      const { CONVERSA_PESSOAL_LIBERADA } = await import("./mimo-agente-db.server");
      // Fail closed before any reservation: no fallback to the shared entry line.
      if (!CONVERSA_PESSOAL_LIBERADA) throw Error("Atendimento pessoal indisponível; nenhuma mensagem foi enviada.");
    }
    const r = await context.supabase
      .from("mimo_leads")
      .select("id,qualificacao,mensagens:mimo_whatsapp_eventos!mimo_whatsapp_eventos_lead_id_fkey(id,direcao,texto,contato_em,message_id,vinculo_id)")
      .eq("empresa_id", a.empresaId)
      .eq("id", data.leadId)
      .eq("mensagens.empresa_id", a.empresaId)
      .order("contato_em", { ascending: false, referencedTable: "mensagens" })
      .order("id", { ascending: false, referencedTable: "mensagens" })
      .range(data.pagina * 30, data.pagina * 30 + 30, { referencedTable: "mensagens" })
      .maybeSingle();
    if (r.error) throw Error("Não foi possível carregar as mensagens deste lead.");
    if (!r.data) throw Error("Lead indisponível.");
    return { mensagens: r.data.mensagens.slice(0, 30), mais: r.data.mensagens.length > 30, qualificacao: r.data.qualificacao };
  });

const destinatarioEnvioMimo = z.object({ leadId: z.string().uuid(), solicitacao: z.string().uuid() });
export const enviarMensagemLeadMimo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v) => z.union([
    destinatarioEnvioMimo.extend({ texto: z.string().trim().min(1).max(2000) }).strict(),
    destinatarioEnvioMimo.extend({ tipo: z.literal("catalogo") }).strict(),
  ]).parse(v))
  .handler(async ({ context, data }) => {
    const { exigirMimo } = await import("./mimo-leads.server");
    const a = await exigirMimo(context.supabase, context.userId);
    if (!["administrador", "gestor", "vendedor"].includes(a.papel)) throw Error("Acesso negado.");
    if (a.papel === "vendedor") {
      const { CONVERSA_PESSOAL_LIBERADA } = await import("./mimo-agente-db.server");
      // Fail closed before any reservation: no fallback to the shared entry line.
      if (!CONVERSA_PESSOAL_LIBERADA) throw Error("Atendimento pessoal indisponível; nenhuma mensagem foi enviada.");
    }
    const lead = await context.supabase.from("mimo_leads").select("id")
      .eq("empresa_id", a.empresaId).eq("id", data.leadId).maybeSingle();
    if (lead.error || !lead.data) throw Error("Lead indisponível.");

    const { enviarMensagemComercialMimo } = await import("./mimo-whatsapp-envio.server");
    const conteudo = "tipo" in data ? { tipo: data.tipo } : { texto: data.texto };
    return enviarMensagemComercialMimo(a.empresaId, context.userId, lead.data.id, conteudo, data.solicitacao, a.papel === "vendedor");
  });
