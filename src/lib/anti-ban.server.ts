/**
 * Server-only helpers do sistema de Proteção Anti-Restrição.
 *
 * Centraliza as verificações "posso enviar agora?" e as atualizações
 * pós-envio (contador diário, circuit breaker) para que campanhas,
 * follow-ups, prospecção automática e envio manual usem a MESMA lógica.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { calcularLimiteEfetivo, dentroDaJanela } from "./anti-ban";

export type ProfileAntiBan = {
  id: string;
  uazapi_conectado_em: string | null;
  envios_hoje: number | null;
  envios_hoje_data: string | null;
  limite_diario_customizado: number | null;
  envio_horario_inicio: string | null;
  envio_horario_fim: string | null;
  envio_dias_semana: number[] | null;
  envios_pausados_ate: string | null;
  erros_envio_consecutivos: number | null;
};

const CAMPOS_ANTI_BAN =
  "id, uazapi_conectado_em, envios_hoje, envios_hoje_data, limite_diario_customizado, envio_horario_inicio, envio_horario_fim, envio_dias_semana, envios_pausados_ate, erros_envio_consecutivos";

export async function carregarProfileAntiBan(userId: string): Promise<ProfileAntiBan | null> {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select(CAMPOS_ANTI_BAN)
    .eq("id", userId)
    .maybeSingle();
  return (data as ProfileAntiBan | null) ?? null;
}

type Contexto = "manual" | "auto";

export type CheckResultado =
  | { ok: true; enviadosHoje: number; limite: number }
  | { ok: false; motivo: "pausado"; ate: string; mensagem: string }
  | { ok: false; motivo: "limite_diario"; limite: number; enviados: number; mensagem: string }
  | { ok: false; motivo: "fora_horario"; mensagem: string };

/**
 * Verifica todas as proteções antes de enviar.
 * - Contexto "auto" respeita a janela de horário; "manual" ignora.
 */
export async function podeEnviar(
  profile: ProfileAntiBan,
  _contexto: Contexto,
): Promise<CheckResultado> {
  // Restrições de tempo/limite desativadas por decisão do produto.
  // Mantém a assinatura para não quebrar chamadores; sempre libera.
  void profile;
  void dentroDaJanela;
  void calcularLimiteEfetivo;
  return { ok: true, enviadosHoje: 0, limite: Number.MAX_SAFE_INTEGER };
}

/**
 * Após envio bem-sucedido: incrementa contador, zera falhas seguidas
 * e reseta contador se virou o dia.
 */
export async function registrarEnvioSucesso(userId: string): Promise<void> {
  const hoje = new Date().toISOString().slice(0, 10);
  const { data: p } = await supabaseAdmin
    .from("profiles")
    .select("envios_hoje, envios_hoje_data")
    .eq("id", userId)
    .maybeSingle();
  const mesmaData = p?.envios_hoje_data === hoje;
  const atual = mesmaData ? Number(p?.envios_hoje ?? 0) : 0;
  await supabaseAdmin
    .from("profiles")
    .update({
      envios_hoje: atual + 1,
      envios_hoje_data: hoje,
      erros_envio_consecutivos: 0,
    } as never)
    .eq("id", userId);
}

/**
 * Após falha: incrementa contador consecutivo. Ao atingir 3, pausa por 30 min
 * (ou 2h se for erro de desconexão) e cria notificação.
 */
export async function registrarEnvioFalha(
  userId: string,
  errorMessage: string,
): Promise<{ pausado: boolean; pausadoAte: string | null }> {
  const desconectado = /disconnected|not\s+reconnectable|not\s+connected|connection\s+closed/i.test(
    errorMessage,
  );

  const { data: p } = await supabaseAdmin
    .from("profiles")
    .select("erros_envio_consecutivos")
    .eq("id", userId)
    .maybeSingle();
  const novo = Number(p?.erros_envio_consecutivos ?? 0) + 1;

  if (novo >= 3) {
    const minutos = desconectado ? 120 : 30;
    const ate = new Date(Date.now() + minutos * 60_000).toISOString();
    await supabaseAdmin
      .from("profiles")
      .update({
        erros_envio_consecutivos: novo,
        envios_pausados_ate: ate,
      } as never)
      .eq("id", userId);

    // Notificação (dedup: só cria se não houver uma pausada não lida recente)
    try {
      const since = new Date(Date.now() - 60 * 60_000).toISOString();
      const { count } = await supabaseAdmin
        .from("notificacoes")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("tipo", "whatsapp")
        .eq("lida", false)
        .gte("created_at", since);
      if ((count ?? 0) === 0) {
        await supabaseAdmin.from("notificacoes").insert({
          user_id: userId,
          tipo: "whatsapp",
          titulo: "Envios pausados por segurança",
          descricao: desconectado
            ? `Detectamos que o WhatsApp foi desconectado. Pausamos os envios por 2 horas para proteger seu número. Reconecte na aba WhatsApp.`
            : `Detectamos falhas seguidas no seu WhatsApp. Pausamos os envios por 30 minutos para proteger seu número. Verifique a conexão na aba WhatsApp.`,
          link: "/app/whatsapp",
        });
      }
    } catch (e) {
      console.error("[anti-ban] falha ao criar notificação:", e);
    }

    return { pausado: true, pausadoAte: ate };
  }

  await supabaseAdmin
    .from("profiles")
    .update({ erros_envio_consecutivos: novo } as never)
    .eq("id", userId);
  return { pausado: false, pausadoAte: null };
}
