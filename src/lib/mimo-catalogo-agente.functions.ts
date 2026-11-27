import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { podeAbrirPagina } from "./mimo-acesso";

// Catalog PDF sent by the attendance agent. Marketing manages only this file; every call rechecks
// the caller's active membership and the service-only RPC repeats the role check in the database.
const BUCKET = "mimo-agente-materiais";
export const LIMITE_CATALOGO_BYTES = 50 * 1024 * 1024;

async function acessoCatalogo(context: { supabase: Parameters<typeof import("./mimo-leads.server").exigirMimo>[0]; userId: string }) {
  const { exigirMimo } = await import("./mimo-leads.server");
  const a = await exigirMimo(context.supabase, context.userId);
  if (!podeAbrirPagina(a.papel, "/mimo/catalogo")) throw Error("Acesso negado.");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // Agent tables are service-only and outside the generated types.
  const admin = supabaseAdmin as unknown as import("@supabase/supabase-js").SupabaseClient;
  return { empresa: a.empresaId as string, admin };
}

export const carregarCatalogoAgenteMimo = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { empresa, admin } = await acessoCatalogo(context);
    const r = await admin
      .from("mimo_agente_materiais")
      .select("id,nome,ativo,created_at,path")
      .eq("empresa_id", empresa)
      .eq("tipo", "catalogo")
      .order("created_at", { ascending: false })
      .limit(10);
    if (r.error) throw Error("Catálogo indisponível.");
    const lista = z
      .array(z.object({ id: z.string(), nome: z.string(), ativo: z.boolean(), created_at: z.string(), path: z.string() }))
      .parse(r.data ?? []);
    const atual = lista.find((m) => m.ativo) ?? null;
    let url: string | null = null;
    if (atual) {
      const s = await admin.storage.from(BUCKET).createSignedUrl(atual.path, 600);
      url = s.data?.signedUrl ?? null;
    }
    return {
      atual: atual ? { id: atual.id, nome: atual.nome, enviadoEm: atual.created_at, url } : null,
      anteriores: lista.filter((m) => !m.ativo).map((m) => ({ id: m.id, nome: m.nome, enviadoEm: m.created_at })),
    };
  });

export const prepararEnvioCatalogoMimo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v) => z.object({ tamanho: z.number().int().min(8).max(LIMITE_CATALOGO_BYTES) }).parse(v))
  .handler(async ({ context }) => {
    const { empresa, admin } = await acessoCatalogo(context);
    const id = crypto.randomUUID();
    const path = `${empresa}/${id}.pdf`;
    const s = await admin.storage.from(BUCKET).createSignedUploadUrl(path);
    if (s.error || !s.data?.token) throw Error("Não foi possível preparar o envio do catálogo.");
    return { id, path, token: s.data.token };
  });

export const ativarCatalogoMimo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v) => z.object({ id: z.string().uuid(), nome: z.string().trim().min(1).max(120) }).parse(v))
  .handler(async ({ context, data }) => {
    const { empresa, admin } = await acessoCatalogo(context);
    const path = `${empresa}/${data.id}.pdf`;
    const descartar = async () => {
      await admin.storage.from(BUCKET).remove([path]);
    };
    // Only a real PDF becomes the catalog: check the uploaded bytes, not the browser's claim.
    const s = await admin.storage.from(BUCKET).createSignedUrl(path, 60);
    const inicio = s.data?.signedUrl
      ? await fetch(s.data.signedUrl, { headers: { Range: "bytes=0-4" } }).then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null)
      : null;
    if (!inicio || new TextDecoder().decode(new Uint8Array(inicio).slice(0, 5)) !== "%PDF-") {
      await descartar();
      throw Error("Envie o catálogo em PDF.");
    }
    const r = await admin.rpc("mimo_agente_catalogo_trocar", {
      _empresa: empresa,
      _ator: context.userId,
      _id: data.id,
      _nome: data.nome,
      _path: path,
    });
    if (r.error) {
      await descartar();
      throw Error(
        /function .* does not exist|Could not find the function/i.test(r.error.message)
          ? "A troca de catálogo ainda não foi liberada no banco. Avise a gestão."
          : "Não foi possível publicar o catálogo.",
      );
    }
    return { ok: true };
  });
