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
    const lead = await context.supabase
      .from("mimo_leads")
      .select("id")
      .eq("empresa_id", a.empresaId)
      .eq("id", data.leadId)
      .single();
    if (lead.error || !lead.data) throw Error("Lead indisponível.");
    const r = await context.supabase
      .from("mimo_whatsapp_eventos")
      .select("id,direcao,texto,contato_em")
      .eq("empresa_id", a.empresaId)
      .eq("lead_id", data.leadId)
      .order("contato_em", { ascending: false })
      .order("id", { ascending: false })
      .range(data.pagina * 30, data.pagina * 30 + 30);
    if (r.error) throw Error("Não foi possível carregar as mensagens deste lead.");
    return { mensagens: (r.data ?? []).slice(0, 30), mais: (r.data?.length ?? 0) > 30 };
  });
