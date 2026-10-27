import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ANEXOS_BUCKET, ANEXO_MAX_BYTES, assinaturaAnexo, type IaAnexo } from "./ia-anexos";

export const listarIaAnexos = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { data, error } = await context.supabase.from("ia_anexos").select("id,nome,storage_path,mime_type,categoria,ativo").eq("user_id", context.userId).order("created_at", { ascending: false });
  if (error) throw new Error("Não foi possível carregar os anexos.");
  return (data ?? []) as IaAnexo[];
});

export const subirIaAnexo = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    if (!(input instanceof FormData)) throw new Error("Arquivo inválido.");
    const file = input.get("arquivo");
    if (!(file instanceof File) || !file.size || file.size > ANEXO_MAX_BYTES) throw new Error("Envie um arquivo de até 20 MB.");
    const mime = z.enum(["image/jpeg", "image/png", "image/webp", "application/pdf"]).parse(file.type);
    const categoria = z.enum(["imagem", "catalogo"]).parse(input.get("categoria"));
    if (mime === "application/pdf" && categoria !== "catalogo") throw new Error("PDF deve ser cadastrado como catálogo.");
    return { file, mime, categoria };
  }).handler(async ({ data, context }) => {
    const bytes = new Uint8Array(await data.file.arrayBuffer());
    if (!assinaturaAnexo(bytes, data.mime)) throw new Error("O conteúdo não corresponde a uma imagem ou PDF válido.");
    const ext = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" }[data.mime];
    const path = `${context.userId}/${crypto.randomUUID()}.${ext}`;
    const storage = context.supabase.storage.from(ANEXOS_BUCKET);
    const { error: uploadError } = await storage.upload(path, bytes, { contentType: data.mime, upsert: false });
    if (uploadError) throw new Error("Não foi possível subir o arquivo.");
    const { error } = await context.supabase.from("ia_anexos").insert({ user_id: context.userId, nome: data.file.name.slice(0, 160), storage_path: path, mime_type: data.mime, categoria: data.categoria });
    if (error) { await storage.remove([path]); throw new Error("Não foi possível salvar o anexo."); }
    return { ok: true };
  });

export const alterarIaAnexo = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid(), ativo: z.boolean() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("ia_anexos").update({ ativo: data.ativo }).eq("id", data.id).eq("user_id", context.userId);
    if (error) throw new Error("Não foi possível atualizar o anexo.");
    return { ok: true };
  });

export const removerIaAnexo = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.string().uuid().parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error: readError } = await context.supabase.from("ia_anexos").select("storage_path").eq("id", data).eq("user_id", context.userId).single();
    if (readError || !row) throw new Error("Anexo não encontrado.");
    const { error: fileError } = await context.supabase.storage.from(ANEXOS_BUCKET).remove([row.storage_path]);
    if (fileError) throw new Error("Não foi possível remover o arquivo.");
    const { error } = await context.supabase.from("ia_anexos").delete().eq("id", data).eq("user_id", context.userId);
    if (error) throw new Error("Não foi possível remover o anexo.");
    return { ok: true };
  });