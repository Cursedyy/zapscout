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
export function isCelularBR(raw: string | null | undefined): boolean {
  let local = onlyDigits(raw);
  if (!local) return false;
  if (local.startsWith("55") && local.length >= 12) local = local.slice(2);
  if (local.length !== 11) return false;
  return local[2] === "9";
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
