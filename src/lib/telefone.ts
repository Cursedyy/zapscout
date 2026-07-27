/**
 * Utilitários de normalização de telefone BR.
 * Cobre variações com/sem 9º dígito e com/sem código 55.
 */

export function onlyDigits(s: string | null | undefined): string {
  return (s ?? "").replace(/\D+/g, "");
}

/**
 * Verifica se um número BR está no formato de celular (DDD + 9 + 8 dígitos =
 * 11 dígitos locais). Fixo (DDD + 8 dígitos = 10 dígitos locais) retorna
 * `false`. Usado como filtro barato ANTES de tentar enviar via UazAPI — não
 * substitui a checagem real de WhatsApp do provedor, só evita gastar
 * tentativa (e risco de sinal de erro incomum na instância) em números que
 * obviamente não são celular.
 */
/**
 * Formata um número BR (dígitos, com ou sem código 55) pra exibição, ex.:
 * "+55 11 91234-5678". Sem validação de DDD/operadora — fallback bruto
 * ("+<dígitos>") se não bater no formato DDD + 8/9 dígitos esperado.
 */
export function formatarNumeroExibicaoBR(raw: string | null | undefined): string {
  const d = onlyDigits(raw);
  if (!d) return "";
  let local = d;
  if (local.startsWith("55") && local.length >= 12) local = local.slice(2);
  if (local.length !== 10 && local.length !== 11) return `+${d}`;
  const ddd = local.slice(0, 2);
  const resto = local.slice(2);
  const meio = resto.length === 9 ? resto.slice(0, 5) : resto.slice(0, 4);
  const fim = resto.length === 9 ? resto.slice(5) : resto.slice(4);
  return `+55 ${ddd} ${meio}-${fim}`;
}

export function isCelularBR(raw: string | null | undefined): boolean {
  let local = onlyDigits(raw);
  if (!local) return false;
  if (local.startsWith("55") && local.length >= 12) local = local.slice(2);
  if (local.length !== 11) return false;
  return local[2] === "9";
}

/**
 * Normaliza telefone BR pra forma local de 11 dígitos (DDD+9+8), sem código 55.
 * Espelha a função SQL `normalizar_telefone_br` (migration
 * 20260723120000_leads_telefone_normalizado.sql) usada na coluna gerada
 * `leads.telefone_normalizado` — manter as duas em sincronia.
 */
export function normalizarTelefoneBR(raw: string | null | undefined): string {
  const digits = onlyDigits(raw);
  if (!digits) return "";
  let local = digits;
  if (local.length >= 12 && local.startsWith("55")) local = local.slice(2);
  if (local.length === 10) local = `${local.slice(0, 2)}9${local.slice(2)}`;
  return local;
}

/**
 * Gera todas as variações plausíveis de um número BR (10 e 11 dígitos locais,
 * com e sem código 55). Útil para casar contra o que está gravado em `leads.telefone`
 * ou `leads.whatsapp` — que pode ter sido salvo em qualquer formato.
 */
export function variacoesTelefoneBR(raw: string | null | undefined): string[] {
  const d = onlyDigits(raw);
  if (!d) return [];
  let local = d;
  if (local.startsWith("55") && local.length >= 12) local = local.slice(2);
  if (local.length < 10) return [d];
  const ddd = local.slice(0, 2);
  const numero = local.slice(2);
  const variantes = new Set<string>();
  if (numero.length === 9 && numero.startsWith("9")) {
    // com 9
    const com9 = `${ddd}${numero}`;
    const sem9 = `${ddd}${numero.slice(1)}`;
    variantes.add(com9);
    variantes.add(sem9);
    variantes.add(`55${com9}`);
    variantes.add(`55${sem9}`);
  } else if (numero.length === 8) {
    const sem9 = `${ddd}${numero}`;
    const com9 = `${ddd}9${numero}`;
    variantes.add(sem9);
    variantes.add(com9);
    variantes.add(`55${sem9}`);
    variantes.add(`55${com9}`);
  } else {
    variantes.add(local);
    variantes.add(`55${local}`);
  }
  return [...variantes];
}
