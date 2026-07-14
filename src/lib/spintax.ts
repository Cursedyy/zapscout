/**
 * Suporte a Spintax: {opção1|opção2|opção3} → escolhe uma aleatoriamente.
 *
 * Importante:
 * - Chaves DUPLAS {{variavel}} NÃO são consumidas (o regex [^{}]+ garante isso).
 * - Deve rodar ANTES do render de variáveis {{nome}} etc.
 * - Se não há barra dentro do grupo, o texto original é mantido.
 */
export function renderSpintax(texto: string): string {
  if (!texto) return texto;
  // Processa iterativamente para suportar aninhamento simples: {a|b {c|d}}
  let prev = "";
  let atual = texto;
  let iter = 0;
  while (atual !== prev && iter < 10) {
    prev = atual;
    atual = atual.replace(/\{([^{}]+)\}/g, (match, grupo: string) => {
      if (!grupo.includes("|")) return match; // não é spintax, deixa
      const opcoes = grupo.split("|").map((s) => s.trim());
      const escolha = opcoes[Math.floor(Math.random() * opcoes.length)] ?? opcoes[0];
      return escolha;
    });
    iter++;
  }
  return atual;
}
