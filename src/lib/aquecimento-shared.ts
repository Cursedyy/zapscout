/** Banco de frases curtas e naturais usadas no aquecimento. */
export const FRASES_AQUECIMENTO = [
  "Oi, tudo bem?",
  "Bom dia!",
  "Boa tarde!",
  "Boa noite!",
  "Pode falar?",
  "Obrigado!",
  "Combinado!",
  "Até mais!",
  "Valeu!",
  "Beleza, obrigado!",
  "Show!",
  "Perfeito, obrigado.",
  "Tudo certo por aqui.",
  "Show de bola!",
  "Vou ver e te retorno.",
  "Anotado!",
  "Ok, sem problemas.",
  "Tranquilo!",
  "Fico no aguardo.",
  "Qualquer coisa me chama.",
  "Te aviso quando souber.",
  "Já te respondo.",
  "Já vi sim.",
  "Boa!",
  "Legal!",
  "Que bom!",
  "Show, obrigado pelo retorno.",
  "Ok, combinado.",
  "Maravilha!",
  "Tranquilo, sem pressa.",
];

export function fraseAleatoria(): string {
  return FRASES_AQUECIMENTO[Math.floor(Math.random() * FRASES_AQUECIMENTO.length)];
}

/**
 * Volume diário cresce linearmente de 5 até 50 mensagens/dia
 * ao longo de `duracaoDias`.
 */
export function metaDiaria(dia: number, duracaoDias: number): number {
  const d = Math.max(1, Math.min(dia, duracaoDias));
  if (duracaoDias <= 1) return 50;
  const v = 5 + ((d - 1) * 45) / (duracaoDias - 1);
  return Math.round(v);
}

/** Intervalo aleatório entre 2 e 15 minutos, em milissegundos. */
export function intervaloAleatorioMs(): number {
  const min = 2 * 60 * 1000;
  const max = 15 * 60 * 1000;
  return Math.floor(min + Math.random() * (max - min));
}
