import { supabaseAdmin as db } from "@/integrations/supabase/client.server";
import { obterRemetenteAgente } from "./mimo-agente-worker.server";
import { uazTranscreverAudio, uazConfirmarChaveAudio, UazApiError } from "./uazapi.server";
import type { CodigoAudio, ResultadoAudio } from "./mimo-agente-audio-config";

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

export async function configurarAudioAgente(empresa: string, ator: string, chave: string): Promise<ResultadoAudio> {
  const falha = (codigo: CodigoAudio): ResultadoAudio => ({ ok: false, codigo });
  const vinculo = await contexto(empresa, ator);
  let token: string | null;
  try { token = await obterRemetenteAgente(empresa, vinculo); }
  catch { return falha("conexao"); }
  if (!token) return falha("conexao");
  const audio = await db.from("mimo_whatsapp_eventos").select("message_id")
    .eq("empresa_id", empresa).eq("vinculo_id", vinculo).eq("direcao", "recebida")
    .eq("texto", "[audio]").gte("created_at", new Date(Date.now() - 48 * 3600000).toISOString())
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (audio.error) return falha("consulta_audio");
  if (!audio.data?.message_id) return falha("sem_audio");
  if (await contexto(empresa, ator) !== vinculo) return falha("vinculo_alterado");
  let transcrita = false;
  let problema: CodigoAudio = "provedor";
  try {
    // The provider persists the key; neither key nor transcript is stored in our database/logs.
    await uazTranscreverAudio(token, audio.data.message_id, chave);
    transcrita = true;
  } catch (erro) {
    if (erro instanceof UazApiError && erro.tipo === "tempo") problema = "tempo";
  }
  // Read persistence even after a failed transcription; never retry the chargeable request.
  let salva: boolean;
  try { salva = await uazConfirmarChaveAudio(token, chave); }
  catch { return falha(problema); }
  if (!salva) return falha("chave_nao_salva");
  if (!transcrita) return falha(problema === "tempo" ? "tempo" : "chave_salva_sem_transcricao");
  return { ok: true };
}
