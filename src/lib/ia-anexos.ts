export const ANEXOS_BUCKET = "ia-vendas-anexos";
export const ANEXO_MAX_BYTES = 20 * 1024 * 1024;
export type IaAnexo = { id: string; nome: string; storage_path: string; mime_type: string; categoria: "imagem" | "catalogo"; ativo: boolean };

export function pedidoAnexo(texto: string): "imagem" | "catalogo" | null {
  const t = texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/\b(nao|dispenso|sem)\b.{0,35}\b(catalogo|pdf|foto|fotos|imagem|imagens)\b/.test(t)) return null;
  if (/\b(catalogo|catalogue|pdf)\b/.test(t) && /\b(manda|mande|envi|quero|gostaria|pode|tem|ver|preciso|catalogo)\b/.test(t)) return "catalogo";
  if (/\b(foto|fotos|imagem|imagens)\b/.test(t) && /\b(manda|mande|envia|enviar|envie|quero|gostaria|pode|tem|ver|preciso)\b/.test(t)) return "imagem";
  return null;
}

export function assinaturaAnexo(bytes: Uint8Array, mime: string): boolean {
  if (mime === "application/pdf") return new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-";
  if (mime === "image/jpeg") return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (mime === "image/png") return [137,80,78,71,13,10,26,10].every((v,i) => bytes[i] === v);
  if (mime === "image/webp") return new TextDecoder().decode(bytes.slice(0,4)) === "RIFF" && new TextDecoder().decode(bytes.slice(8,12)) === "WEBP";
  return false;
}