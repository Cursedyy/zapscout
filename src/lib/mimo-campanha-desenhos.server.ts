import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  BUCKET_DESENHOS,
  caminhoDesenho,
  instagramDesenho,
  LIMITE_DESENHO,
  mimeDesenho,
  type MimeDesenho,
} from "./mimo-campanha-desenhos";
import type { DesenhosDB } from "./mimo-campanha-desenhos-db";

const dadosSchema = z.object({ id: z.uuid(), instagram: instagramDesenho });
const reservaSchema = z.object({
  estado: z.enum(["reservado", "recebido", "limite", "conflito", "indisponivel"]),
  empresa: z.uuid().optional(),
});
const indisponivel =
  "Não foi possível enviar agora. Seu formulário continua preenchido. Tente novamente.";
const resposta = (status: number, mensagem: string) =>
  Response.json({ mensagem }, { status, headers: { "Cache-Control": "no-store" } });

function assinaturaValida(bytes: Uint8Array, mime: MimeDesenho) {
  if (bytes.length < 16) return false;
  const texto = (inicio: number, fim: number) =>
    String.fromCharCode(...bytes.subarray(inicio, fim));
  switch (mime) {
    case "image/jpeg":
      return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    case "image/png":
      return [137, 80, 78, 71, 13, 10, 26, 10].every((n, i) => bytes[i] === n);
    case "image/webp":
      return texto(0, 4) === "RIFF" && texto(8, 12) === "WEBP";
    case "video/quicktime":
      return texto(4, 12) === "ftypqt  ";
    case "video/mp4":
      return (
        texto(4, 8) === "ftyp" && /^(?:iso[m2-9]|mp4[12]|avc1|M4V |MSNV|dash)$/.test(texto(8, 12))
      );
  }
}

async function lerArquivo(corpo: ReadableStream<Uint8Array>) {
  const leitor = corpo.getReader();
  const partes: Uint8Array[] = [];
  let tamanho = 0;
  for (;;) {
    const parte = await leitor.read();
    if (parte.done) break;
    tamanho += parte.value.byteLength;
    if (tamanho > LIMITE_DESENHO) {
      await leitor.cancel().catch(() => {});
      return null;
    }
    partes.push(parte.value);
  }
  const bytes = new Uint8Array(tamanho);
  let inicio = 0;
  for (const parte of partes) {
    bytes.set(parte, inicio);
    inicio += parte.byteLength;
  }
  return bytes;
}

async function sha256(bytes: BufferSource) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (n) => n.toString(16).padStart(2, "0")).join("");
}

export async function receberDesenhoMimo(
  request: Request,
  db = supabaseAdmin as unknown as SupabaseClient<DesenhosDB>,
) {
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return resposta(403, "Reabra o formulário para enviar seu desenho.");
  const dados = dadosSchema.safeParse({
    id: request.headers.get("x-envio-id"),
    instagram: request.headers.get("x-instagram"),
  });
  if (!dados.success) return resposta(400, "Informe um @ do Instagram válido.");
  const mime = request.headers.get("content-type") ?? "";
  if (!mimeDesenho(mime))
    return resposta(415, "Use uma foto JPG, PNG ou WebP, ou um vídeo MP4 ou MOV.");
  if (!request.body) return resposta(400, "Selecione uma foto ou um vídeo.");
  if (Number(request.headers.get("content-length")) > LIMITE_DESENHO)
    return resposta(413, "O arquivo precisa ter até 25 MB.");

  try {
    const bytes = await lerArquivo(request.body);
    if (!bytes) return resposta(413, "O arquivo precisa ter até 25 MB.");
    if (!assinaturaValida(bytes, mime))
      return resposta(415, "O arquivo não corresponde ao formato selecionado.");

    const { id, instagram } = dados.data;
    const ip = request.headers.get("cf-connecting-ip") || "local";
    const [hash, ipHash] = await Promise.all([
      sha256(bytes),
      sha256(new TextEncoder().encode(`${new Date().toISOString().slice(0, 10)}:desenhos:${ip}`)),
    ]);
    const reserva = await db.rpc("mimo_reservar_desenho", {
      p_id: id,
      p_instagram: instagram,
      p_mime: mime,
      p_tamanho: bytes.byteLength,
      p_hash: hash,
      p_ip_hash: ipHash,
    });
    const resultado = reservaSchema.safeParse(reserva.data);
    if (reserva.error || !resultado.success) return resposta(503, indisponivel);
    const { estado, empresa } = resultado.data;
    if (estado === "limite")
      return resposta(429, "Muitas tentativas. Aguarde antes de enviar novamente.");
    if (estado === "conflito")
      return resposta(409, "O envio mudou. Selecione o arquivo novamente.");
    if (!empresa || estado === "indisponivel") return resposta(503, indisponivel);
    const sucesso = "Seu desenho foi recebido pela MiMo!";
    if (estado === "recebido") return resposta(200, sucesso);

    const storage = db.storage.from(BUCKET_DESENHOS);
    const caminho = caminhoDesenho(empresa, id, hash, mime);
    const upload = await storage.upload(caminho, bytes, { contentType: mime, upsert: false });
    if (upload.error && !(await storage.exists(caminho)).data) return resposta(503, indisponivel);

    const salvo = await db
      .from("mimo_campanha_desenhos")
      .update({ recebido_em: new Date().toISOString() })
      .eq("empresa_id", empresa)
      .eq("id", id)
      .is("recebido_em", null)
      .select("id")
      .maybeSingle();
    if (salvo.error) return resposta(503, indisponivel);
    if (salvo.data) return resposta(201, sucesso);
    const concluido = await db
      .from("mimo_campanha_desenhos")
      .select("id")
      .eq("empresa_id", empresa)
      .eq("id", id)
      .not("recebido_em", "is", null)
      .maybeSingle();
    return concluido.data && !concluido.error
      ? resposta(200, sucesso)
      : resposta(503, indisponivel);
  } catch {
    return resposta(503, indisponivel);
  }
}
