import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  BUCKET_DESENHOS,
  caminhoDesenho,
  podeVerDesenhos,
  TIPOS_DESENHO,
} from "./mimo-campanha-desenhos";
import type { DesenhosDB } from "./mimo-campanha-desenhos-db";

const POR_PAGINA = 25;
const cursorSchema = z.object({ id: z.uuid(), recebido_em: z.iso.datetime({ offset: true }) });

export const listarDesenhosMimo = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ cursor: cursorSchema.nullable() }))
  .handler(async ({ context, data: { cursor } }) => {
    const { exigirMimo } = await import("./mimo-leads.server");
    const acesso = await exigirMimo(context.supabase, context.userId);
    if (!podeVerDesenhos(acesso.papel)) throw new Error("Acesso negado.");
    const db = context.supabase as unknown as SupabaseClient<DesenhosDB>;
    const consulta = db
      .from("mimo_campanha_desenhos")
      .select("id,instagram,mime,tamanho,recebido_em")
      .eq("empresa_id", acesso.empresaId)
      .not("recebido_em", "is", null)
      .order("recebido_em", { ascending: false })
      .order("id", { ascending: false })
      .limit(POR_PAGINA + 1);
    if (cursor)
      consulta.or(
        `recebido_em.lt.${cursor.recebido_em},and(recebido_em.eq.${cursor.recebido_em},id.lt.${cursor.id})`,
      );
    const { data, error } = await consulta;
    if (error) throw new Error("Não foi possível carregar os envios.");
    const envios = data.slice(0, POR_PAGINA);
    const ultimo = envios.at(-1);
    return {
      envios,
      proximo:
        data.length > POR_PAGINA && ultimo?.recebido_em
          ? { id: ultimo.id, recebido_em: ultimo.recebido_em }
          : null,
    };
  });

export const baixarDesenhoMimo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.uuid())
  .handler(async ({ context, data: id }) => {
    const { exigirMimo } = await import("./mimo-leads.server");
    const acesso = await exigirMimo(context.supabase, context.userId);
    if (!podeVerDesenhos(acesso.papel)) throw new Error("Acesso negado.");
    const db = context.supabase as unknown as SupabaseClient<DesenhosDB>;
    const { data: desenho, error } = await db
      .from("mimo_campanha_desenhos")
      .select("instagram,mime,hash_arquivo")
      .eq("empresa_id", acesso.empresaId)
      .eq("id", id)
      .not("recebido_em", "is", null)
      .maybeSingle();
    if (!desenho || error) throw new Error("Não foi possível localizar o arquivo.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const caminho = caminhoDesenho(acesso.empresaId, id, desenho.hash_arquivo, desenho.mime);
    const assinatura = await supabaseAdmin.storage
      .from(BUCKET_DESENHOS)
      .createSignedUrl(caminho, 60, {
        download: `desenho-${desenho.instagram}.${TIPOS_DESENHO[desenho.mime]}`,
      });
    if (assinatura.error) throw new Error("Não foi possível preparar o arquivo para download.");
    return assinatura.data.signedUrl;
  });
