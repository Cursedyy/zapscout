export class ErroConsultaComercial extends Error {}

/** Lê até a contagem exata, inclusive quando a API devolve páginas menores que as solicitadas. */
export async function lerPaginasComerciais<T>(
  buscar: (de: number, ate: number) => PromiseLike<{ data: T[] | null; count: number | null; error: unknown }>,
  max = 20000,
) {
  const itens: T[] = [];
  let total: number | null = null;
  do {
    const r = await buscar(itens.length, itens.length + 999);
    if (r.error) throw new ErroConsultaComercial("Não foi possível consultar os registros. Tente novamente.");
    if (r.count === null || r.count < 0 || !r.data)
      throw new ErroConsultaComercial("Consulta incompleta. Atualize os indicadores.");
    if (r.count > max)
      throw new ErroConsultaComercial("O período excede o limite de registros. Reduza o período e tente novamente.");
    if (total !== null && total !== r.count)
      throw new ErroConsultaComercial("Os registros mudaram durante a consulta. Atualize os indicadores.");
    total = r.count;
    if ((!r.data.length && itens.length < total) || itens.length + r.data.length > total)
      throw new ErroConsultaComercial("Consulta incompleta. Atualize os indicadores.");
    itens.push(...r.data);
  } while (itens.length < total);
  return itens;
}
