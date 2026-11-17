import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { revendaSchema, linkRevenda } from "./mimo-revenda";
import type { RevendaDB } from "./mimo-revenda-db";
const responder = (status: number, mensagem: string, whatsapp?: string) => Response.json({ mensagem, ...(whatsapp ? { whatsapp } : {}) }, { status, headers: { "Cache-Control": "no-store" } });
export async function receberRevenda(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return responder(403, "Reabra o formulário antes de enviar.");
  if (!request.headers.get("content-type")?.startsWith("application/json")) return responder(415, "Envio inválido.");
  if (Number(request.headers.get("content-length")) > 8192) return responder(413, "Envio muito grande.");
  try {
    const reader = request.body?.getReader();
    if (!reader) return responder(400, "Preencha o formulário.");
    const chunks: Uint8Array[] = []; let tamanho = 0;
    for (;;) {
      const parte = await reader.read(); if (parte.done) break;
      tamanho += parte.value.length;
      if (tamanho > 8192) { await reader.cancel(); return responder(413, "Envio muito grande."); }
      chunks.push(parte.value);
    }
    const bytes = new Uint8Array(tamanho); let posicao = 0;
    for (const c of chunks) { bytes.set(c, posicao); posicao += c.length; }
    let bruto: unknown;
    try { bruto = JSON.parse(new TextDecoder().decode(bytes)); } catch { return responder(400, "Envio inválido."); }
    const validacao = revendaSchema.safeParse(bruto);
    if (!validacao.success) return responder(400, "Confira os campos e confirme o pedido inicial de R$ 1.500.");
    const { site: _site, ...dados } = validacao.data;
    const ip = request.headers.get("cf-connecting-ip") || "local";
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${new Date().toISOString().slice(0,10)}:${ip}`));
    const hash = Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, "0")).join("");
    const { data, error } = await (supabaseAdmin as unknown as SupabaseClient<RevendaDB>).rpc("mimo_inscrever_revenda", { p_dados: dados, p_ip_hash: hash });
    if (error) return responder(503, "Não foi possível confirmar seu cadastro. Suas respostas continuam aqui; tente novamente.");
    const resultado = data as { estado?: string; numero?: string } | null;
    if (resultado?.estado === "limite") return responder(429, "Muitas tentativas. Aguarde antes de tentar novamente.");
    if (resultado?.estado === "conflito") return responder(409, "As respostas mudaram. Altere um campo e envie novamente.");
    if (resultado?.estado !== "recebido" || !resultado.numero) return responder(503, "O atendimento está temporariamente indisponível. Tente novamente em instantes.");
    return responder(200, "Cadastro recebido. Continue no WhatsApp para falar com nossa equipe.", linkRevenda(resultado.numero, validacao.data));
  } catch { return responder(503, "Não foi possível enviar agora. Suas respostas continuam aqui; tente novamente."); }
}

