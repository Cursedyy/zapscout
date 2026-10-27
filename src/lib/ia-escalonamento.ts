// Regras puras do atendimento da IA: pedido de humano, roteamento do
// escalonamento, estilo natural e tempo de "digitando".

export type DestinoEscalonamento = { nome: string; assunto: string; telefone: string };

const REGEX_PEDE_HUMANO =
  /\b(falar|conversar|atendimento|atender)\b.{0,30}\b(humano|pessoa|atendente|algu[eé]m|respons[aá]vel|vendedor|consultor|representante|gerente|dono)\b|\b(atendente|humano|pessoa real|pessoa de verdade)\b|(^|\s)(é|e) (um |uma )?(rob[oô]|bot|ia)(?![a-z])|\bme liga\b|\bpode me ligar\b/i;

export function pedeHumano(texto: string): boolean {
  return REGEX_PEDE_HUMANO.test(texto);
}

// A IA disse que vai encaminhar/passar o contato: precisa escalar de fato.
const REGEX_PROMETE_ENCAMINHAR =
  /\b(vou|j[aá] vou|vou te|irei)\s+(passar|encaminhar|transferir|direcionar|chamar)\b|\b(consultor|respons[aá]vel|equipe|time)\b.{0,40}\b(entra|vai entrar|vai te chamar|te chama|entrar[aá])\b/i;

export function prometeEncaminhar(resposta: string): boolean {
  return REGEX_PROMETE_ENCAMINHAR.test(resposta);
}

function normalizar(t: string): string {
  return t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

/** Escolhe o destino: nome devolvido pela IA, senão palavras do assunto no texto, senão null (usa o padrão). */
export function resolverDestino(
  destinos: DestinoEscalonamento[],
  nomeEscolhido: string | null | undefined,
  textoLead: string,
): DestinoEscalonamento | null {
  const validos = destinos.filter((d) => d.telefone.replace(/\D/g, "").length >= 10);
  if (!validos.length) return null;
  const escolhido = nomeEscolhido ? normalizar(nomeEscolhido) : "";
  if (escolhido) {
    const d = validos.find((x) => normalizar(x.nome) === escolhido);
    if (d) return d;
  }
  const texto = normalizar(textoLead);
  for (const d of validos) {
    const palavras = normalizar(d.assunto).split(/[^a-z0-9]+/).filter((p) => p.length >= 5);
    if (palavras.some((p) => texto.includes(p.slice(0, Math.max(5, p.length - 2))))) return d;
  }
  return null;
}

/** Remove emojis e travessões para soar como uma pessoa digitando. */
export function estiloHumano(texto: string): string {
  return texto
    .replace(/[\p{Extended_Pictographic}\u{1F3FB}-\u{1F3FF}\u200D\uFE0F]/gu, "")
    .replace(/\s*[—–]\s*/g, ", ")
    .replace(/\s+-\s+/g, ", ")
    .replace(/,\s*([,.!?])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +([,.!?])/g, "$1")
    .trim();
}

/** Tempo em ms mostrando "digitando..." antes de enviar (entre 1,5s e 8s). */
export function tempoDigitando(texto: string): number {
  return Math.min(8000, Math.max(1500, Math.round(texto.length * 55)));
}
