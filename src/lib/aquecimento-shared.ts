/** Banco de frases curtas e naturais usadas no aquecimento. */
export const FRASES_AQUECIMENTO_CATEGORIAS: Record<string, string[]> = {
  confirmacoes: [
    "Sim!", "Pode ser!", "Combinado!", "Tá bom!", "Entendido!",
    "Perfeito!", "Claro!", "Com certeza!", "Tudo certo!", "Fechado!",
  ],
  perguntas: [
    "Tudo bem por aí?", "Como você está?", "Tem novidade?",
    "O que está fazendo?", "Chegou bem?", "Resolveu o problema?",
    "Deu certo?", "Conseguiu?", "Está ocupado agora?", "Pode falar?",
  ],
  respostas: [
    "Estou bem sim, obrigado!", "Aqui tudo tranquilo!", "Chegando agora!",
    "Já resolvi, valeu!", "Deu certo sim!", "Consegui sim!",
    "Pode falar à vontade!", "Agora posso sim!", "Estou livre agora!",
    "Tudo resolvido!",
  ],
  cotidiano: [
    "Vou sair mais tarde", "Estou no trabalho agora", "Te ligo depois",
    "Me manda no zap", "Vou verificar aqui", "Já te respondo",
    "Um segundo", "Aguarda um momento", "Estou chegando", "Quase lá",
  ],
  agradecimentos: [
    "Valeu mesmo!", "Muito obrigado!", "Obrigada!", "Que bom!",
    "Ótimo, obrigado!", "Grato!", "Muito grato!", "Agradeço!",
    "Fico feliz!", "Maravilha!",
  ],
};

export const FRASES_AQUECIMENTO: string[] = Object.values(
  FRASES_AQUECIMENTO_CATEGORIAS,
).flat();

export type TipoMensagem = "casual" | "profissional" | "misto";
export type Intensidade = "suave" | "moderado" | "agressivo";

/** Casual = cotidiano + confirmações + agradecimentos.
 *  Profissional = perguntas + respostas.
 *  Misto = todas. */
const TIPO_CATEGORIAS: Record<TipoMensagem, string[]> = {
  casual: ["cotidiano", "confirmacoes", "agradecimentos"],
  profissional: ["perguntas", "respostas"],
  misto: ["confirmacoes", "perguntas", "respostas", "cotidiano", "agradecimentos"],
};

/** Escolhe uma frase alternando entre categorias do tipo selecionado.
 *  Nunca retorna `ultimaFrase`. */
export function fraseAleatoria(
  tipo: TipoMensagem = "misto",
  ultimaFrase?: string | null,
): string {
  const cats = [...TIPO_CATEGORIAS[tipo]].sort(() => Math.random() - 0.5);
  for (const cat of cats) {
    const opcoes = (FRASES_AQUECIMENTO_CATEGORIAS[cat] ?? []).filter(
      (f) => f !== ultimaFrase,
    );
    if (opcoes.length > 0) return opcoes[Math.floor(Math.random() * opcoes.length)];
  }
  return FRASES_AQUECIMENTO[Math.floor(Math.random() * FRASES_AQUECIMENTO.length)];
}

/** Faixas de volume por intensidade. */
export const INTENSIDADE_RANGE: Record<Intensidade, { min: number; max: number }> = {
  suave: { min: 5, max: 15 },
  moderado: { min: 15, max: 30 },
  agressivo: { min: 30, max: 50 },
};

/** Volume diário cresce linearmente do mínimo até o máximo da intensidade. */
export function metaDiaria(
  dia: number,
  duracaoDias: number,
  intensidade: Intensidade = "moderado",
): number {
  const { min, max } = INTENSIDADE_RANGE[intensidade];
  const d = Math.max(1, Math.min(dia, duracaoDias));
  if (duracaoDias <= 1) return max;
  const v = min + ((d - 1) * (max - min)) / (duracaoDias - 1);
  return Math.round(v);
}

/** Intervalo aleatório entre 2 e 15 minutos, em milissegundos. */
export function intervaloAleatorioMs(): number {
  const min = 2 * 60 * 1000;
  const max = 15 * 60 * 1000;
  return Math.floor(min + Math.random() * (max - min));
}

/** Domingo=0 ... Sábado=6 */
export const DIAS_SEMANA_LABEL = ["D", "S", "T", "Q", "Q", "S", "S"];
export const DIAS_SEMANA_NOME = [
  "Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado",
];
