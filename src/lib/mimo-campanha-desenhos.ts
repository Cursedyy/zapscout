import { z } from "zod";

export const BUCKET_DESENHOS = "mimo-campanha-desenhos";
export const LIMITE_DESENHO = 25 * 1024 * 1024;
export const TIPOS_DESENHO = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
} as const;
export type MimeDesenho = keyof typeof TIPOS_DESENHO;

export const instagramDesenho = z
  .string()
  .transform((valor) => valor.trim().replace(/^@/, "").toLowerCase())
  .pipe(
    z
      .string()
      .regex(/^(?!\.)(?!.*\.\.)(?!.*\.$)[a-z0-9_.]{1,30}$/, "Informe um @ do Instagram válido."),
  );

export const podeVerDesenhos = (papel: string) =>
  ["administrador", "gestor", "marketing", "lider_marketing"].includes(papel);

export function mimeDesenho(tipo: string): tipo is MimeDesenho {
  return Object.hasOwn(TIPOS_DESENHO, tipo);
}

export function caminhoDesenho(empresa: string, id: string, hash: string, mime: MimeDesenho) {
  return `${empresa}/${id}/${hash}.${TIPOS_DESENHO[mime]}`;
}

export function tipoArquivoDesenho(arquivo: File): string {
  if (mimeDesenho(arquivo.type)) return arquivo.type;
  if (arquivo.type && arquivo.type !== "application/octet-stream") return "";
  const extensao = arquivo.name.toLowerCase().split(".").at(-1);
  if (extensao === "jpeg") return "image/jpeg";
  return Object.entries(TIPOS_DESENHO).find(([, sufixo]) => sufixo === extensao)?.[0] ?? "";
}
