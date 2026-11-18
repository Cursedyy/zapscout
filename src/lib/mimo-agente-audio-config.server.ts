import { supabaseAdmin as db } from "@/integrations/supabase/client.server";
import { obterRemetenteAgente } from "./mimo-agente-worker.server";
import { uazTranscreverAudio, uazConfirmarChaveAudio } from "./uazapi.server";

async function contexto(empresa: string, ator: string) {
  const membro = await db.from("empresa_membros").select("papel,ativo")
    .eq("empresa_id", empresa).eq("user_id", ator).maybeSingle();
  if (membro.error || !membro.data?.ativo || !["administrador", "gestor"].includes(membro.data.papel))
    throw Error("Acesso negado.");
  const config = await db.from("mimo_agente_config").select("vinculo_id")
    .eq("empresa_id", empresa).maybeSingle();
  if (config.error || !config.data?.vinculo_id) throw Error("Configure primeiro o número de atendimento.");
  return config.data.vinculo_id;
}

export async function configurarAudioAgente(empresa: string, ator: string, chave: string) {
  const vinculo = await contexto(empresa, ator);
  const token = await obterRemetenteAgente(empresa, vinculo);
  if (!token) throw Error("Confira a conexão e a identidade do número de atendimento.");
  const audio = await db.from("mimo_whatsapp_eventos").select("message_id")
    .eq("empresa_id", empresa).eq("vinculo_id", vinculo).eq("direcao", "recebida")
    .eq("texto", "[audio]").gte("created_at", new Date(Date.now() - 48 * 3600000).toISOString())
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (audio.error || !audio.data?.message_id)
    throw Error("Envie um áudio curto ao WhatsApp de atendimento e tente novamente. A chave ainda não foi enviada.");
  if (await contexto(empresa, ator) !== vinculo) throw Error("O número de atendimento mudou. Reabra o painel.");
  try {
    // The provider persists the key; neither key nor transcript is stored in our database/logs.
    await uazTranscreverAudio(token, audio.data.message_id, chave);
    if (!(await uazConfirmarChaveAudio(token, chave))) throw Error("provider_key_not_persisted");
    return { ok: true as const };
  } catch {
    // The provider may have saved the key before failing. Do not auto-retry or expose its body.
    throw Error("Não foi possível confirmar a transcrição. A chave pode ter sido salva na UazAPI. Confira se ela é válida, tem acesso à transcrição e saldo disponível antes de tentar novamente.");
  }
}
