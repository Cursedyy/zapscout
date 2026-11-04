import { z } from "zod";
import { pedidoSchema } from "./mimo-pedido";
export type EscopoRascunho = {
  empresaId: string;
  usuarioId: string;
  papel: string;
  pedidoRef: string | null;
};
export const telaRascunhoSchema = z.object({
  tab: z.string().max(40),
  modelo: z.string().max(200),
  produto: z.string().max(200),
  brinde: z.string().max(200),
  manual: z.string().max(200),
  brindeReutilizavel: z.string().max(200),
  buscaCliente: z.string().max(200),
});
const documentoRascunhoSchema = pedidoSchema
  .innerType()
  .extend({ origemCep: z.string().regex(/^\d{0,8}$/), destinoCep: z.string().regex(/^\d{0,8}$/) });
export const rascunhoSchema = z.object({
  pedidoId: z.string().uuid(),
  documento: documentoRascunhoSchema,
  tela: telaRascunhoSchema,
});
export type RascunhoPedido = z.infer<typeof rascunhoSchema>;
export const envelopeRascunhoSchema = z.object({
  v: z.literal(1),
  leadId: z.string().uuid().nullable(),
  versaoBase: z.number().int().min(0),
  atualizadoEm: z.string().datetime(),
  iv: z.string().max(100),
  dados: z.string().max(2_000_000),
});
export type EnvelopeRascunho = z.infer<typeof envelopeRascunhoSchema>;
export const chaveLocalRascunho = (e: EscopoRascunho) =>
  `mimo:rascunho:1:${e.empresaId}:${e.usuarioId}:${e.papel}:${e.pedidoRef ?? "novo"}`;
const bytes = (b: string) => Uint8Array.from(atob(b), (c) => c.charCodeAt(0));
const base64 = (b: Uint8Array) => {
  let s = "";
  for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode(...b.subarray(i, i + 8192));
  return btoa(s);
};
export const importarChaveRascunho = (chave: string) =>
  crypto.subtle.importKey("raw", bytes(chave), "AES-GCM", false, ["encrypt", "decrypt"]);
const aad = (escopo: EscopoRascunho, e: Omit<EnvelopeRascunho, "dados">) =>
  new TextEncoder().encode(JSON.stringify({ escopo: chaveLocalRascunho(escopo), ...e }));
export async function cifrarRascunho(
  p: RascunhoPedido,
  escopo: EscopoRascunho,
  chave: CryptoKey,
  versaoBase: number,
): Promise<EnvelopeRascunho> {
  const documento = rascunhoSchema.parse(p);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const header = {
    v: 1 as const,
    leadId: documento.documento.leadId,
    versaoBase,
    atualizadoEm: new Date().toISOString(),
    iv: base64(iv),
  };
  const dados = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: aad(escopo, header) },
    chave,
    new TextEncoder().encode(JSON.stringify(documento)),
  );
  return { ...header, dados: base64(new Uint8Array(dados)) };
}
export async function decifrarRascunho(
  valor: EnvelopeRascunho,
  escopo: EscopoRascunho,
  chave: CryptoKey,
) {
  const { dados, ...header } = envelopeRascunhoSchema.parse(valor);
  const aberto = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: bytes(header.iv), additionalData: aad(escopo, header) },
    chave,
    bytes(dados),
  );
  const p = rascunhoSchema.parse(JSON.parse(new TextDecoder().decode(aberto)));
  if (p.documento.leadId !== header.leadId || (escopo.pedidoRef && p.pedidoId !== escopo.pedidoRef))
    throw Error("Rascunho incompatível com este pedido.");
  return p;
}
export function temRascunhoPedido(e: EscopoRascunho) {
  try {
    return typeof window !== "undefined" && !!localStorage.getItem(chaveLocalRascunho(e));
  } catch {
    return false;
  }
}
