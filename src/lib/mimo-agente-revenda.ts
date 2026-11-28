import {
  assuntoAtendimentoAgente, horarioHumanoAberto, motivoObrigatorioAgente,
  ultimoBlocoAgente, type ConfigAgente, type DadosAgente, type MensagemAgente,
  type ResultadoAgente,
} from "./mimo-agente";
import { formularioAgente } from "./mimo-agente-formularios";
import { CANAIS_REVENDA, PRAZOS_REVENDA, formatarMinimoRevenda, revendaSchema, type RevendaInput } from "./mimo-revenda";
import type { FichaRevenda } from "./mimo-revenda-db";

export type ContextoRevendaAgente = { id: string; preenchidoEm: string; minimoCentavos: number; respostas: RevendaInput };
/** Persisted form statements retain explicit provenance; conversation corrections win. */
export function dadosFichaRevendaAgente(ficha: ContextoRevendaAgente | null, dados: DadosAgente): DadosAgente {
  if (!ficha) return dados;
  const r = ficha.respostas;
  const valores = { nome:r.nome, cidade_uf:`${r.cidade}/${r.uf}`, estabelecimento:CANAIS_REVENDA[r.canal], revenda:r.interesse };
  return { ...Object.fromEntries(Object.entries(valores).map(([k,valor])=>[k,{valor,evidencia:`[Formulário de revenda verificado] ${valor}`} ])), ...dados };
}
export function telefoneRevendaAgente(telefone: string) {
  if (!/^55[1-9]{2}\d{8,9}$/.test(telefone)) return null;
  return /^55[1-9]{2}[6-9]\d{7}$/.test(telefone)
    ? telefone.slice(0, 4) + "9" + telefone.slice(4) : telefone;
}
/** Only a persisted, same-company/same-phone form is trusted as a form submission. */
export function validarFichaRevendaAgente(
  ficha: FichaRevenda | null, empresa: string, telefone: string, agora = new Date(),
): ContextoRevendaAgente | null {
  const numero = telefoneRevendaAgente(telefone);
  if (!ficha || !numero || ficha.empresa_id !== empresa || ficha.telefone !== numero || ![100000, 150000].includes(ficha.minimo_centavos)) return null;
  const idade = agora.getTime() - Date.parse(ficha.created_at);
  if (!Number.isFinite(idade) || idade < 0 || idade > 30 * 86400000) return null;
  const p = revendaSchema.safeParse({ ...(ficha.respostas as object), envio_id: ficha.id });
  if (!p.success || "55" + p.data.whatsapp !== numero) return null;
  return { id: ficha.id, preenchidoEm: ficha.created_at, minimoCentavos: ficha.minimo_centavos, respostas: p.data };
}
const limpar = (s: string) => s.replace(/https?:\/\/\S+|www\.\S+/gi, "[link]").replace(/[\u0000-\u001f]/g, " ").trim();
export function resumoFichaRevendaAgente(ficha: ContextoRevendaAgente) {
  const d = ficha.respostas;
  return `Formulário de revenda — declarado pelo interessado:\nNome: ${limpar(d.nome)}\nCidade/UF: ${limpar(d.cidade)}/${d.uf}\nCanal: ${CANAIS_REVENDA[d.canal]}\nPedido inicial mínimo de ${formatarMinimoRevenda(ficha.minimoCentavos)}: aceitou no formulário.\nPrazo: ${PRAZOS_REVENDA[d.prazo]}.\nNão comprova compra ou pagamento; confira eventuais atualizações na conversa.`;
}
export function respostaFichaRevendaAgente(
  config: ConfigAgente, mensagens: MensagemAgente[], dados: DadosAgente,
  ficha: ContextoRevendaAgente | null, agora = new Date(),
): ResultadoAgente | null {
  if (!ficha) return null;
  const texto = ultimoBlocoAgente(mensagens);
  const motivo = motivoObrigatorioAgente(texto, config);
  const assunto = assuntoAtendimentoAgente(texto);
  // A prior form must never override a stop, support request or a changed interest.
  if (!texto.trim() || (motivo && motivo !== "atendimento_humano" && motivo !== "condicao_comercial") ||
      assunto === "suporte" || assunto === "consumo" || formularioAgente(texto)) return null;
  return {
    resposta: "Recebi seu formulário de revenda! Vou passar suas informações à equipe da MiMo para continuar o atendimento." +
      (horarioHumanoAberto(config, agora) ? "" : ` ${config.disponibilidade}`),
    // Form statements stay explicitly sourced in the summary. They are not fabricated
    // WhatsApp quotes and do not overwrite corrected conversation or sales fields.
    dados, estado: "humano", encaminhar: true, motivo: "formulario_revenda",
    resumo: resumoFichaRevendaAgente(ficha),
  };
}
