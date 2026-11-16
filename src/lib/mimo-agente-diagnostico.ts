const descricoes = {
  ia_sem_credencial: "A chave da IA não está configurada no servidor.",
  ia_creditos_esgotados: "O provedor informou que os créditos da IA acabaram.",
  ia_limite_uso: "O provedor da IA limitou o uso. Aguarde antes de testar novamente.",
  ia_acesso_negado: "O provedor recusou a credencial da IA.",
  ia_modelo_indisponivel: "O modelo configurado não está disponível no provedor.",
  ia_tempo_esgotado: "A geração da resposta excedeu o tempo permitido.",
  ia_resposta_invalida: "A IA retornou uma resposta fora do formato aprovado.",
  ia_indisponivel: "Não foi possível gerar a resposta pelo provedor da IA.",
  remetente_indisponivel: "Não foi possível confirmar a conexão do WhatsApp comercial.",
  whatsapp_indisponivel: "O provedor de WhatsApp não concluiu a operação.",
  processamento_falhou: "O processamento falhou antes da confirmação de envio.",
} as const;
export type CodigoFalhaAgente = keyof typeof descricoes;
export class ErroIAAgente extends Error {
  constructor(readonly codigo: CodigoFalhaAgente) {
    super(descricoes[codigo]);
    this.name = "ErroIAAgente";
  }
}
export function descricaoFalhaAgente(codigo: string) {
  return Object.hasOwn(descricoes, codigo)
    ? descricoes[codigo as CodigoFalhaAgente]
    : "Falha sem causa detalhada registrada. Use o simulador para conferir a IA.";
}
/** Only allowlisted codes leave this boundary: never persist a provider body or prompt. */
export function codigoFalhaAgente(erro: unknown): CodigoFalhaAgente {
  if (erro instanceof ErroIAAgente) return erro.codigo;
  if (!erro || typeof erro !== "object") return "processamento_falhou";
  const e = erro as { name?: string; message?: string; statusCode?: number; cause?: unknown };
  if (e.statusCode === 402) return "ia_creditos_esgotados";
  if (e.statusCode === 429) return "ia_limite_uso";
  if (e.statusCode === 401 || e.statusCode === 403) return "ia_acesso_negado";
  if (e.statusCode === 404) return "ia_modelo_indisponivel";
  if (e.name === "TimeoutError" || e.name === "AbortError") return "ia_tempo_esgotado";
  if (["SyntaxError", "ZodError", "AI_NoObjectGeneratedError", "AI_NoOutputGeneratedError"].includes(e.name ?? ""))
    return "ia_resposta_invalida";
  if (e.message === "agente_remetente_divergente" || e.message === "agente_remetente_indisponivel")
    return "remetente_indisponivel";
  // UazApiError deliberately contains no provider response body.
  if (e.name === "Error" && e.message?.startsWith("UAZAPI ")) return "whatsapp_indisponivel";
  if (e.name === "AI_APICallError" || e.name === "AI_RetryError") return "ia_indisponivel";
  return "processamento_falhou";
}
