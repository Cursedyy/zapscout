import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { inscricaoInfluenciadorSchema } from "./mimo-influenciadores";
import type { InfluenciadoresDB } from "./mimo-influenciadores-db";

const resposta = (status: number, mensagem: string) =>
  Response.json({ mensagem }, { status, headers: { "Cache-Control": "no-store" } });
export async function receberInscricaoInfluenciador(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return resposta(403, "Reabra o formulário para enviar sua inscrição.");
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    return resposta(415, "Envio inválido.");
  if (Number(request.headers.get("content-length")) > 8192)
    return resposta(413, "Envio muito grande.");
  try {
    // Bound streamed bodies too, including requests without Content-Length.
    const reader = request.body?.getReader();
    if (!reader) return resposta(400, "Preencha o formulário.");
    const chunks: Uint8Array[] = [];
    let tamanho = 0;
    for (;;) {
      const parte = await reader.read();
      if (parte.done) break;
      tamanho += parte.value.length;
      if (tamanho > 8192) {
        await reader.cancel();
        return resposta(413, "Envio muito grande.");
      }
      chunks.push(parte.value);
    }
    const bytes = new Uint8Array(tamanho);
    let posicao = 0;
    for (const c of chunks) {
      bytes.set(c, posicao);
      posicao += c.length;
    }
    let bruto: unknown;
    try {
      bruto = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      return resposta(400, "Envio inválido.");
    }
    const validacao = inscricaoInfluenciadorSchema.safeParse(bruto);
    if (!validacao.success)
      return resposta(400, validacao.error.issues[0]?.message || "Confira os campos.");
    // Only trust the platform's client-IP header, never user-supplied forwarded chains.
    const ip = request.headers.get("cf-connecting-ip") || "local";
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(`${new Date().toISOString().slice(0, 10)}:${ip}`),
    );
    const hash = Array.from(new Uint8Array(digest), (n) => n.toString(16).padStart(2, "0")).join(
      "",
    );
    const { site: _site, ...dados } = validacao.data;
    const { data, error } = await (
      supabaseAdmin as unknown as SupabaseClient<InfluenciadoresDB>
    ).rpc("mimo_inscrever_influenciador", { p_dados: dados, p_ip_hash: hash });
    if (error)
      return resposta(
        503,
        "As inscrições estão temporariamente indisponíveis. Tente novamente em alguns minutos.",
      );
    if (data === "limite")
      return resposta(429, "Muitas tentativas. Aguarde uma hora antes de tentar novamente.");
    if (data !== "recebido")
      return resposta(
        503,
        "Não foi possível confirmar a inscrição. Tente novamente em alguns minutos.",
      );
    // Same response for a new or duplicate application: don't expose existing contacts.
    return resposta(
      200,
      "Inscrição recebida! A equipe MiMo entrará em contato caso seu perfil seja selecionado.",
    );
  } catch {
    return resposta(
      503,
      "Não foi possível enviar agora. Suas respostas continuam no formulário; tente novamente.",
    );
  }
}
